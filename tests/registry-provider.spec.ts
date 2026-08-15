import { describe, expect, it, vi } from 'vitest'
import { RegistrySnapshotSchema, SUPPORTED_DSH_VERSION, type RegistrySnapshot } from '../src/core/registry.ts'
import { composeLiveSnapshot, RegistryProvider } from '../src/registry/provider.ts'

const verified = {
  id: 'github:example/verified',
  name: 'Verified old name',
  description: { en: 'old', zh: '旧描述' },
  category: 'tools',
  repositoryUrl: 'https://github.com/example/verified',
  license: 'MIT',
  source: { kind: 'npm', packageName: 'dsh-verified-example', version: '1.2.3' },
  installHint: { kind: 'npm', packageName: 'dsh-verified-example' },
  status: 'verified',
  discovery: { sources: ['awesome-dsh-plugin'], stars: 1, pushedAt: null },
  evidence: {
    dshVersion: SUPPORTED_DSH_VERSION,
    checkedAt: '2026-08-15T00:00:00.000Z',
    platform: 'darwin',
    manifest: 'pass',
    artifacts: 'pass',
    dumpConfig: 'pass',
    boot: 'pass',
  },
} as const

const oldCandidate = {
  id: 'github:example/old-candidate',
  name: 'Old candidate',
  description: { en: 'old candidate', zh: 'old candidate' },
  category: 'other',
  repositoryUrl: 'https://github.com/example/old-candidate',
  license: null,
  source: null,
  installHint: { kind: 'github', repository: 'example/old-candidate', path: null },
  status: 'installable',
  validation: { manifest: 'pass', checkedAt: '2026-08-15T00:00:00.000Z', packageName: 'old-candidate' },
  discovery: { sources: ['github-topic'], stars: 2, pushedAt: null },
} as const

function snapshot(): RegistrySnapshot {
  return RegistrySnapshotSchema.parse({
    schemaVersion: 1,
    generatedAt: '2026-08-15T00:00:00.000Z',
    entries: [verified, oldCandidate],
  })
}

const curated = {
  plugins: [
    {
      name: 'Verified fresh name',
      url: 'https://github.com/example/verified',
      description: { en: 'fresh', zh: '最新描述' },
      category: 'ui',
      install: 'dsh plugin --profile web add dsh-verified-example',
    },
    {
      name: 'New native',
      url: 'https://github.com/example/new-native',
      description: { en: 'new', zh: '新插件' },
      category: 'workflow',
      install: 'dsh plugin --profile web add github:example/new-native',
    },
  ],
}

const github = {
  items: [
    {
      full_name: 'example/verified',
      name: 'verified',
      html_url: 'https://github.com/example/verified',
      description: 'verified',
      stargazers_count: 20,
      pushed_at: '2026-08-15T01:00:00.000Z',
      license: { spdx_id: 'Apache-2.0' },
    },
    {
      full_name: 'example/topic-new',
      name: 'topic-new',
      html_url: 'https://github.com/example/topic-new',
      description: 'topic candidate',
      stargazers_count: 4,
      pushed_at: '2026-08-15T01:00:00.000Z',
      license: { spdx_id: 'MIT' },
    },
    {
      full_name: 'example/awesome-dsh-plugins',
      name: 'awesome-dsh-plugins',
      html_url: 'https://github.com/example/awesome-dsh-plugins',
      description: 'catalog, not a plugin',
      stargazers_count: 100,
      pushed_at: '2026-08-15T01:00:00.000Z',
      license: { spdx_id: 'CC0-1.0' },
    },
  ],
}

const validations = new Map([
  ['npm:dsh-verified-example', {
    source: { kind: 'npm', packageName: 'dsh-verified-example', version: '1.2.4' } as const,
    license: 'Apache-2.0',
    validation: { manifest: 'pass', checkedAt: '2026-08-15T02:00:00.000Z', packageName: 'dsh-verified-example' } as const,
  }],
  ['github:example/new-native', {
    source: null,
    license: 'MIT',
    validation: { manifest: 'pass', checkedAt: '2026-08-15T02:00:00.000Z', packageName: 'new-native' } as const,
  }],
  ['github:example/topic-new', {
    source: null,
    license: 'MIT',
    validation: { manifest: 'pass', checkedAt: '2026-08-15T02:00:00.000Z', packageName: 'topic-new' } as const,
  }],
])

describe('runtime registry provider', () => {
  it('refreshes discovery fields without promoting or weakening trusted verification', () => {
    const next = composeLiveSnapshot(snapshot(), snapshot(), curated, github, '2026-08-15T02:00:00.000Z', validations)
    expect(next.entries).toContainEqual(expect.objectContaining({
      id: verified.id,
      name: 'Verified fresh name',
      status: 'verified',
      license: 'MIT',
      source: verified.source,
      evidence: verified.evidence,
      discovery: expect.objectContaining({ stars: 20 }),
    }))
    expect(next.entries).toContainEqual(expect.objectContaining({ id: 'github:example/new-native', status: 'installable' }))
    expect(next.entries).toContainEqual(expect.objectContaining({ id: 'github:example/topic-new', status: 'installable' }))
    expect(next.entries).not.toContainEqual(expect.objectContaining({ id: 'github:example/awesome-dsh-plugins' }))
    expect(next.entries.find((entry) => entry.id === 'github:example/new-native')?.validation?.packageName).toBe('new-native')
  })

  it('does not admit a topic hit without a validated DSH manifest', () => {
    const withoutTopicValidation = new Map([...validations].filter(([key]) => key !== 'github:example/topic-new'))
    const next = composeLiveSnapshot(snapshot(), snapshot(), curated, github, '2026-08-15T02:00:00.000Z', withoutTopicValidation)
    expect(next.entries).not.toContainEqual(expect.objectContaining({ id: 'github:example/topic-new' }))
  })

  it('keeps cached GitHub-only rows when that optional source is unavailable', () => {
    const next = composeLiveSnapshot(snapshot(), snapshot(), curated, null, '2026-08-15T02:00:00.000Z', validations)
    expect(next.entries).toContainEqual(expect.objectContaining({ id: oldCandidate.id }))
  })

  it('keeps the last good snapshot when the required curated source fails', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response('unavailable', { status: 503 }))
    const provider = new RegistryProvider(snapshot(), {
      fetcher,
      githubPages: 0,
      now: () => new Date('2026-08-15T03:00:00.000Z'),
    })
    const before = provider.current()
    const result = await provider.refresh()
    expect(result.updated).toBe(false)
    expect(provider.current()).toBe(before)
    expect(result.status.error).toContain('HTTP 503')
  })
})
