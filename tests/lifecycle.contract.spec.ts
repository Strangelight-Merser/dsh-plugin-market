import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { access, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readManagedState } from '../src/core/managed-state.ts'
import { readProfileManifest } from '../src/core/profile.ts'
import { RegistrySnapshotSchema, type RegistrySnapshot } from '../src/core/registry.ts'
import { SpawnDshRunner } from '../src/lifecycle/runner.ts'
import { PluginLifecycleService } from '../src/lifecycle/service.ts'
import { NetworkInstallSourceResolver } from '../src/lifecycle/source-resolver.ts'

const execFileAsync = promisify(execFile)
const here = dirname(fileURLToPath(import.meta.url))
const metadataFiles = ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', '.dsh-plugin-market/state.json']

interface PackedFixture {
  name: string
  version: string
  manifest: Record<string, unknown>
  bytes: Buffer
}

let root: string
let dshHome: string
let profileDir: string
let registryServer: Server
let service: PluginLifecycleService

async function packFixture(directory: string): Promise<PackedFixture> {
  const fixtureDir = join(here, '..', 'fixtures', directory)
  const manifest = JSON.parse(await readFile(join(fixtureDir, 'package.json'), 'utf8')) as Record<string, unknown>
  const { stdout } = await execFileAsync('pnpm', ['pack', '--pack-destination', root], { cwd: fixtureDir })
  const tarballPath = stdout.trim().split('\n').at(-1)
  if (tarballPath === undefined) throw new Error(`pnpm pack returned no path for ${directory}`)
  return {
    name: String(manifest.name),
    version: String(manifest.version),
    manifest,
    bytes: await readFile(tarballPath),
  }
}

async function startRegistry(fixtures: readonly PackedFixture[]): Promise<{ url: string; close: () => Promise<void> }> {
  const byName = new Map(fixtures.map((fixture) => [fixture.name, fixture]))
  registryServer = createServer((request, response) => {
    const requestUrl = new URL(request.url ?? '/', 'http://registry.invalid')
    const tarballMatch = /^\/([^/]+)\/-\/[^/]+\.tgz$/.exec(requestUrl.pathname)
    if (tarballMatch !== null) {
      const fixture = byName.get(decodeURIComponent(tarballMatch[1]!))
      if (fixture === undefined) {
        response.writeHead(404).end()
        return
      }
      response.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': fixture.bytes.length })
      response.end(fixture.bytes)
      return
    }

    const name = decodeURIComponent(requestUrl.pathname.slice(1))
    const fixture = byName.get(name)
    if (fixture === undefined) {
      response.writeHead(404).end()
      return
    }
    const address = registryServer.address()
    if (address === null || typeof address === 'string') throw new Error('registry has no TCP address')
    const tarball = `http://127.0.0.1:${address.port}/${fixture.name}/-/${fixture.name}-${fixture.version}.tgz`
    const body = JSON.stringify({
      _id: fixture.name,
      name: fixture.name,
      'dist-tags': { latest: fixture.version },
      versions: {
        [fixture.version]: {
          ...fixture.manifest,
          dist: {
            tarball,
            shasum: createHash('sha1').update(fixture.bytes).digest('hex'),
            integrity: `sha512-${createHash('sha512').update(fixture.bytes).digest('base64')}`,
          },
        },
      },
    })
    response.writeHead(200, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) })
    response.end(body)
  })
  await new Promise<void>((resolve, reject) => {
    registryServer.once('error', reject)
    registryServer.listen(0, '127.0.0.1', resolve)
  })
  const address = registryServer.address()
  if (address === null || typeof address === 'string') throw new Error('registry has no TCP address')
  return {
    url: `http://127.0.0.1:${address.port}/`,
    close: () => new Promise((resolve, reject) => registryServer.close((error) => error === undefined ? resolve() : reject(error))),
  }
}

function communityEntry(id: string, name: string, packageName: string): Record<string, unknown> {
  return {
    id,
    name,
    description: { en: `${name} fixture`, zh: `${name} 测试夹具` },
    category: 'dev',
    repositoryUrl: `https://github.com/dsh-plugin-market/${packageName}`,
    license: null,
    source: null,
    installHint: { kind: 'npm', packageName },
    status: 'installable',
    validation: { manifest: 'pass', checkedAt: '2026-08-15T00:00:00.000Z', packageName },
  }
}

async function profileMetadataHash(): Promise<string> {
  const hash = createHash('sha256')
  for (const relative of metadataFiles) {
    hash.update(relative)
    try {
      hash.update(await readFile(join(profileDir, relative)))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      hash.update('<absent>')
    }
  }
  return hash.digest('hex')
}

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'dsh-verified-contract-'))
  dshHome = join(root, 'home')
  profileDir = join(dshHome, 'profiles', 'web')
  const bootstrap = new SpawnDshRunner(dshHome)
  const initialized = await bootstrap.run(['plugin', '--profile', 'web', 'install', '--ignore-scripts'])
  expect(initialized.code, initialized.stderr).toBe(0)

  const fixtures = await Promise.all([packFixture('valid-plugin'), packFixture('invalid-plugin')])
  const registry = await startRegistry(fixtures)
  const snapshot: RegistrySnapshot = RegistrySnapshotSchema.parse({
    schemaVersion: 1,
    generatedAt: '2026-08-15T00:00:00.000Z',
    entries: [
      communityEntry('npm:valid-fixture', 'Valid fixture', 'dsh-verified-fixture-plugin'),
      communityEntry('npm:invalid-fixture', 'Invalid fixture', 'dsh-verified-invalid-fixture'),
    ],
  })
  service = new PluginLifecycleService(
    () => snapshot,
    'web',
    new SpawnDshRunner(dshHome, 'dsh', { PNPM_CONFIG_REGISTRY: registry.url }),
    new NetworkInstallSourceResolver({ npmRegistryUrl: registry.url }),
    dshHome,
  )
})

afterAll(async () => {
  if (registryServer !== undefined) await new Promise<void>((resolve, reject) => registryServer.close((error) => error === undefined ? resolve() : reject(error)))
  if (root !== undefined) await rm(root, { recursive: true, force: true })
})

describe('real isolated DSH lifecycle', () => {
  it('rejects a non-plugin package during the side-effect-free preview', async () => {
    const before = await profileMetadataHash()
    await expect(service.preview('npm:invalid-fixture')).rejects.toThrow('no dsh.bundle.patch')
    expect(await profileMetadataHash()).toBe(before)
    await expect(access(join(profileDir, 'node_modules', 'dsh-verified-invalid-fixture'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('completes active-by-default install, disable-retain, re-enable, and uninstall', async () => {
    const preview = await service.preview('npm:valid-fixture')
    expect(preview).toEqual(expect.objectContaining({
      packageName: 'dsh-verified-fixture-plugin',
      resolvedRef: 'dsh-verified-fixture-plugin@1.0.0',
      verified: false,
    }))
    await expect(service.perform('install', 'npm:valid-fixture', 'dsh-verified-fixture-plugin@0.9.0'))
      .rejects.toThrow('source changed after preview')
    const installed = await service.perform('install', 'npm:valid-fixture', preview.resolvedRef)
    expect(installed.state).toBe('active')
    expect(installed.resolvedRef).toBe('dsh-verified-fixture-plugin@1.0.0')
    expect(installed.runtimeEffect).toBe('restart-required')
    let manifest = await readProfileManifest(profileDir)
    expect(manifest.dependencies?.['dsh-verified-fixture-plugin']).toBe('1.0.0')
    expect(manifest.dsh?.profile?.bundles).toContain('dsh-verified-fixture-plugin')

    const disabled = await service.perform('disable', 'npm:valid-fixture')
    expect(disabled.state).toBe('inactive')
    manifest = await readProfileManifest(profileDir)
    expect(manifest.devDependencies?.['dsh-verified-fixture-plugin']).toBe('1.0.0')
    expect(manifest.dsh?.profile?.bundles).not.toContain('dsh-verified-fixture-plugin')
    await expect(access(join(profileDir, 'node_modules', 'dsh-verified-fixture-plugin'))).resolves.toBeUndefined()

    const enabled = await service.perform('enable', 'npm:valid-fixture')
    expect(enabled.state).toBe('active')
    manifest = await readProfileManifest(profileDir)
    expect(manifest.dependencies?.['dsh-verified-fixture-plugin']).toBe('1.0.0')
    expect(manifest.dsh?.profile?.bundles).toContain('dsh-verified-fixture-plugin')

    const uninstalled = await service.perform('uninstall', 'npm:valid-fixture')
    expect(uninstalled.state).toBe('absent')
    expect((await readManagedState(profileDir)).plugins).toEqual({})
    await expect(access(join(profileDir, 'node_modules', 'dsh-verified-fixture-plugin'))).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
