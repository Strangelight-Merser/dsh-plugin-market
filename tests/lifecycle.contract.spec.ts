import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { access, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { readManagedState } from '../src/core/managed-state.ts'
import { readProfileManifest } from '../src/core/profile.ts'
import { RegistrySnapshotSchema, SUPPORTED_DSH_VERSIONS, type RegistrySnapshot } from '../src/core/registry.ts'
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
let registryUrl: string
let web: ChildProcess | undefined

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
    // The real packed market retains its production dependency. Only the
    // fixture packages are served locally; resolve zod from its official registry.
    if (name === 'zod') {
      response.writeHead(302, { location: 'https://registry.npmjs.org/zod' }).end()
      return
    }
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

  const fixtures = await Promise.all([packFixture('valid-plugin'), packFixture('invalid-plugin'), packFixture('missing-artifact')])
  const registry = await startRegistry(fixtures)
  registryUrl = registry.url
  const snapshot: RegistrySnapshot = RegistrySnapshotSchema.parse({
    schemaVersion: 1,
    generatedAt: '2026-08-15T00:00:00.000Z',
    entries: [
      communityEntry('npm:valid-fixture', 'Valid fixture', 'dsh-verified-fixture-plugin'),
      communityEntry('npm:invalid-fixture', 'Invalid fixture', 'dsh-verified-invalid-fixture'),
      communityEntry('npm:missing-artifact', 'Missing artifact', 'dsh-missing-artifact-fixture'),
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
  // The restart helper deliberately detaches its replacement. The fixture
  // records that PID so cleanup owns both generations, including on failure.
  let replacementPid: number | undefined
  if (root !== undefined) {
    try { replacementPid = Number(await readFile(join(root, 'runtime-pid'), 'utf8')) }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  }
  for (const pid of new Set([web?.pid, replacementPid])) {
    if (pid === undefined || !Number.isSafeInteger(pid) || pid <= 0) continue
    try { process.kill(pid, 'SIGTERM') }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error }
    await vi.waitFor(() => {
      try { process.kill(pid, 0) }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') return; throw error }
      throw new Error(`DSH process ${pid} is still stopping`)
    }, { timeout: 30_000, interval: 100 })
  }
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

  it('restores profile metadata and dependencies when installed artifacts are invalid', async () => {
    const before = await profileMetadataHash()
    const preview = await service.preview('npm:missing-artifact')
    await expect(service.perform('install', 'npm:missing-artifact', preview.resolvedRef)).rejects.toThrow(/artifact|patch|entry|bundle/i)
    expect(await profileMetadataHash()).toBe(before)
    await expect(access(join(profileDir, 'node_modules', 'dsh-missing-artifact-fixture'))).rejects.toMatchObject({ code: 'ENOENT' })
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

  it('boots the packed market behind DSH authentication and applies a batch with one real restart', async () => {
    const projectDir = join(here, '..')
    const packed = await execFileAsync('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', root], { cwd: projectDir })
    const [{ filename }] = JSON.parse(packed.stdout) as [{ filename: string }]
    const installed = await new SpawnDshRunner(dshHome).run(['plugin', '--profile', 'web', 'add', '--ignore-scripts', join(root, filename)])
    expect(installed.code, installed.stderr).toBe(0)
    const preview = await service.preview('npm:valid-fixture')
    await service.perform('install', preview.id, preview.resolvedRef)

    const portProbe = createServer()
    await new Promise<void>((resolve) => portProbe.listen(0, '127.0.0.1', resolve))
    const address = portProbe.address()
    if (address === null || typeof address === 'string') throw new Error('no available TCP port')
    await new Promise<void>((resolve, reject) => portProbe.close((error) => error ? reject(error) : resolve()))
    const baseUrl = `http://127.0.0.1:${address.port}`
    let log = ''
    let spawnError: Error | undefined
    web = spawn('dsh', ['web', '--no-open', '--port', String(address.port)], {
      cwd: root,
      env: { ...process.env, DSH_HOME: dshHome, DSH_TELEMETRY_DISABLED: '1', PNPM_CONFIG_REGISTRY: registryUrl, DSH_MARKET_FIXTURE_RUNTIME_FILE: join(root, 'runtime-pid') },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    web.on('error', (error) => { spawnError = error })
    web.stdout!.on('data', (chunk: Buffer) => { log += chunk.toString() })
    web.stderr!.on('data', (chunk: Buffer) => { log += chunk.toString() })
    await vi.waitFor(() => {
      if (spawnError !== undefined) throw spawnError
      expect(log, log).toContain(`${baseUrl}/?token=`)
    }, { timeout: 30_000, interval: 100 })

    for (const path of ['catalog', 'installed', 'registry/refresh', 'preview', 'actions', 'restart']) {
      const method = ['catalog', 'installed'].includes(path) ? 'GET' : 'POST'
      expect((await fetch(`${baseUrl}/api/dsh-market/v1/${path}`, { method })).status, path).toBe(401)
    }
    const loginUrl = log.match(/http:\/\/127\.0\.0\.1:\d+\/\?token=\S+/)![0]
    const login = await fetch(loginUrl, { redirect: 'manual' })
    expect(login.status).toBe(303)
    const cookie = login.headers.get('set-cookie')!.split(';')[0]!
    expect((await fetch(`${baseUrl}/api/dsh-market/v1/catalog`, { headers: { cookie, origin: 'https://evil.example' } })).status).toBe(403)
    const request = (path: string, body?: unknown) => fetch(`${baseUrl}${path}`, {
      headers: { cookie, origin: baseUrl, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(15_000),
    })
    const catalog = async (): Promise<{ runtimeInstanceId: string; pendingRestartIds: string[]; supportedDshVersions: string[] }> => {
      const response = await request('/api/dsh-market/v1/catalog')
      expect(response.status).toBe(200)
      return response.json()
    }

    const html = await (await request('/')).text()
    const boot = JSON.parse(html.match(/globalThis\["__DSH_BOOT__"\] = (.*?)<\/script>/s)![1]!) as { entries: Array<{ id: string; url: string; inject: string[] }> }
    const market = boot.entries.find((entry) => entry.id === 'dsh-plugin-market')!
    expect(market).toBeDefined()
    for (const dependency of market.inject) expect(boot.entries.some((entry) => entry.id === dependency), `missing client dependency ${dependency}`).toBe(true)
    const client = await request(market.url)
    expect(client.status).toBe(200)
    expect(await client.text()).toContain('settings.section')

    const before = await catalog()
    expect(before.supportedDshVersions).toEqual(SUPPORTED_DSH_VERSIONS)
    const runningPid = (await (await request('/api/dsh-market-fixture')).json() as { pid: number }).pid
    for (const action of ['disable', 'enable']) {
      const response = await request('/api/dsh-market/v1/actions', { action, id: preview.id })
      expect(response.status, await response.clone().text()).toBe(200)
      expect((await catalog()).runtimeInstanceId).toBe(before.runtimeInstanceId)
      expect(await (await request('/api/dsh-market-fixture')).json()).toEqual({ pid: runningPid })
    }
    expect((await catalog()).pendingRestartIds).toEqual([preview.id])
    const restart = await request('/api/dsh-market/v1/restart', {})
    expect(restart.status, await restart.clone().text()).toBe(202)
    await vi.waitFor(async () => {
      const current = await catalog()
      expect(current.runtimeInstanceId).not.toBe(before.runtimeInstanceId)
      expect(current.pendingRestartIds).toEqual([])
    }, { timeout: 45_000, interval: 250 })
    expect((await (await request('/api/dsh-market-fixture')).json() as { pid: number }).pid).not.toBe(runningPid)
    expect((await readProfileManifest(profileDir)).dsh?.profile?.bundles).toContain('dsh-verified-fixture-plugin')
    expect((await request('/api/dsh-market/v1/restart', {})).status).toBe(409)
  })
})
