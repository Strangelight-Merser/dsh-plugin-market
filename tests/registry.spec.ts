import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  installBlockReason,
  installRef,
  parseInstallHint,
  RegistryEntrySchema,
  RegistrySnapshotSchema,
  SUPPORTED_DSH_VERSIONS,
} from '../src/core/registry.ts'

const verified = RegistryEntrySchema.parse({
  id: 'npm:dsh-example',
  name: 'Example',
  description: { en: 'Example plugin', zh: '示例插件' },
  category: 'tools',
  repositoryUrl: 'https://github.com/example/dsh-example',
  license: 'MIT',
  source: { kind: 'npm', packageName: 'dsh-example', version: '1.2.3' },
  installHint: { kind: 'npm', packageName: 'dsh-example' },
  status: 'verified',
  evidence: {
    dshVersion: SUPPORTED_DSH_VERSIONS[0],
    checkedAt: '2026-08-15T00:00:00.000Z',
    platform: 'darwin',
    manifest: 'pass',
    artifacts: 'pass',
    dumpConfig: 'pass',
    boot: 'pass',
  },
})
const here = dirname(fileURLToPath(import.meta.url))

describe('registry trust boundary', () => {
  it('accepts a versioned empty snapshot', () => {
    expect(RegistrySnapshotSchema.parse({
      schemaVersion: 1,
      generatedAt: '2026-08-15T00:00:00.000Z',
      entries: [],
    }).entries).toEqual([])
  })

  it('parses the generated multi-source snapshot and keeps one real verified entry', async () => {
    const snapshot = RegistrySnapshotSchema.parse(JSON.parse(await readFile(join(here, '..', 'data', 'registry-v1.json'), 'utf8')))
    expect(snapshot.entries.length).toBeGreaterThan(0)
    expect(new Set(snapshot.entries.map((entry) => entry.id)).size).toBe(snapshot.entries.length)
    expect(snapshot.entries.some((entry) => entry.status === 'installable')).toBe(true)
    expect(snapshot.entries.every((entry) => entry.status === 'blocked' || entry.validation?.manifest === 'pass')).toBe(true)
    expect(snapshot.entries.filter((entry) => entry.status === 'installable').every((entry) => installBlockReason(entry) === null)).toBe(true)
    const monorepoEntries = snapshot.entries.filter((entry) => entry.installHint?.kind === 'github' && entry.installHint.path !== null)
    expect(monorepoEntries.length).toBeGreaterThan(0)
    expect(monorepoEntries.every((entry) => entry.installHint?.kind === 'github' && entry.installHint.path?.startsWith('/') === true)).toBe(true)
    expect(snapshot.entries).toContainEqual(expect.objectContaining({
      id: 'github:awesome-dsh-plugin/dsh-find-plugin',
      status: 'verified',
      license: 'MIT',
      source: { kind: 'npm', packageName: 'dsh-find-plugin', version: '0.3.6' },
    }))
  })

  it('keeps recommendation IDs unique while allowing upstream delisting', async () => {
    const recommendations = JSON.parse(await readFile(join(here, '..', 'data', 'recommendations.json'), 'utf8')) as { entries: Array<{ id: string }> }
    const ids = recommendations.entries.map((entry) => entry.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.every((id) => /^[a-z0-9][a-z0-9:._/-]*$/.test(id))).toBe(true)
  })

  it('builds only exact non-shell install references', () => {
    expect(installRef(verified.source!)).toBe('dsh-example@1.2.3')
    expect(installRef({
      kind: 'github',
      packageName: 'dsh-example',
      repository: 'example/dsh-example',
      commit: 'a'.repeat(40),
      path: null,
    })).toBe(`github:example/dsh-example#${'a'.repeat(40)}`)
    expect(installRef({
      kind: 'github',
      packageName: 'dsh-example-ui',
      repository: 'example/dsh-example',
      commit: 'b'.repeat(40),
      path: '/packages/ui',
    })).toBe(`github:example/dsh-example#${'b'.repeat(40)}&path:/packages/ui`)
  })

  it('retains historical evidence without treating it as support for the current runtime', () => {
    const historical = RegistryEntrySchema.parse({
      ...verified,
      evidence: { ...verified.evidence, dshVersion: '0.1.0-rc.6' },
    })
    expect(historical.evidence?.dshVersion).toBe('0.1.0-rc.6')
    expect(installBlockReason(historical)).toContain('unsupported DSH version')
    for (const dshVersion of SUPPORTED_DSH_VERSIONS) {
      expect(installBlockReason(RegistryEntrySchema.parse({ ...verified, evidence: { ...verified.evidence, dshVersion } }))).toBeNull()
    }
    expect(() => RegistryEntrySchema.parse({ ...verified, evidence: { ...verified.evidence, dshVersion: 'latest' } })).toThrow()
  })

  it('rejects command-shaped package metadata', () => {
    expect(() => RegistryEntrySchema.parse({
      ...verified,
      source: { kind: 'npm', packageName: 'safe;touch-pwned', version: '1.2.3' },
    })).toThrow()
  })

  it('opens installation for every located entry while preserving explicit blocks', () => {
    expect(installBlockReason(verified)).toBeNull()
    expect(installBlockReason({
      ...verified,
      status: 'installable',
      source: null,
      evidence: undefined,
      validation: { manifest: 'pass', checkedAt: '2026-08-15T00:00:00.000Z', packageName: 'dsh-example' },
    })).toBeNull()
    expect(installBlockReason({ ...verified, status: 'installable', source: null, installHint: null, evidence: undefined })).toContain('locator')
    expect(installBlockReason({ ...verified, status: 'blocked' })).toContain('blocked')
  })

  it('parses npm, GitHub root, and GitHub monorepo install declarations', () => {
    expect(parseInstallHint('dsh plugin --profile web add dsh-example')).toEqual({ kind: 'npm', packageName: 'dsh-example' })
    expect(parseInstallHint('dsh plugin --profile web add github:example/repo')).toEqual({ kind: 'github', repository: 'example/repo', path: null })
    expect(parseInstallHint('dsh plugin --profile web add github:example/repo#path:/packages/ui')).toEqual({
      kind: 'github', repository: 'example/repo', path: '/packages/ui',
    })
    expect(parseInstallHint('dsh plugin --profile web add github:example/repo#main')).toBeNull()
  })
  it('rejects path traversal and duplicate registry identities', () => {
    for (const path of ['/../private', '/packages/../private', '/packages/.', '/.']) {
      expect(parseInstallHint(`dsh plugin --profile web add github:example/repo#path:${path}`)).toBeNull()
    }
    expect(() => RegistrySnapshotSchema.parse({ schemaVersion: 1, generatedAt: '2026-08-15T00:00:00.000Z', entries: [verified, verified] })).toThrow('duplicate plugin id')
  })

})
