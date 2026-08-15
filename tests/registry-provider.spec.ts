import { describe, expect, it, vi } from 'vitest'
import { RegistrySnapshotSchema, type RegistrySnapshot } from '../src/core/registry.ts'
import { RegistryProvider } from '../src/registry/provider.ts'

const baseEntry = {
  id: 'github:example/tool',
  name: 'Example tool',
  description: { en: 'A browser search tool', zh: '浏览器搜索工具' },
  category: 'other',
  repositoryUrl: 'https://github.com/example/tool',
  license: 'MIT',
  source: null,
  installHint: { kind: 'github', repository: 'example/tool', path: null },
  status: 'installable',
  validation: { manifest: 'pass', checkedAt: '2026-08-15T00:00:00.000Z', packageName: 'example-tool' },
  discovery: { sources: ['github-topic'], stars: 2, pushedAt: '2026-08-15T00:00:00.000Z' },
} as const

function snapshot(generatedAt = '2026-08-15T00:00:00.000Z'): RegistrySnapshot {
  return RegistrySnapshotSchema.parse({ schemaVersion: 1, generatedAt, entries: [baseEntry] })
}

function response(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('published registry updates', () => {
  it('classifies the bundled fallback without network access', () => {
    const provider = new RegistryProvider(snapshot())
    expect(provider.current().entries[0]?.category).toBe('tools')
    expect(provider.status()).toMatchObject({ source: 'bundled', entryCount: 1 })
  })

  it('updates from one published snapshot request and classifies new entries', async () => {
    const next = RegistrySnapshotSchema.parse({
      schemaVersion: 1,
      generatedAt: '2026-08-15T02:00:00.000Z',
      entries: [baseEntry, {
        ...baseEntry,
        id: 'github:example/skills',
        name: 'Skill manager',
        description: { en: 'Manage reusable skills', zh: '管理技能' },
        repositoryUrl: 'https://github.com/example/skills',
        installHint: { kind: 'github', repository: 'example/skills', path: null },
        validation: { ...baseEntry.validation, packageName: 'example-skills' },
      }],
    })
    const fetcher = vi.fn<typeof fetch>(async () => response(next))
    const provider = new RegistryProvider(snapshot(), {
      fetcher,
      registryUrl: 'https://example.com/registry-v1.json',
      now: () => new Date('2026-08-15T03:00:00.000Z'),
    })

    const result = await provider.refresh()

    expect(result.updated).toBe(true)
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(provider.current().entries).toHaveLength(2)
    expect(provider.current().entries[1]?.category).toBe('skill')
    expect(provider.status()).toMatchObject({
      source: 'live',
      lastSuccessAt: '2026-08-15T03:00:00.000Z',
      entryCount: 2,
      error: null,
    })
  })

  it('does not replace a newer bundled snapshot with stale online data', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => response(snapshot('2026-08-15T00:00:00.000Z')))
    const provider = new RegistryProvider(snapshot('2026-08-15T04:00:00.000Z'), {
      fetcher,
      registryUrl: 'https://example.com/registry-v1.json',
    })

    const result = await provider.refresh()

    expect(result.updated).toBe(true)
    expect(provider.current().generatedAt).toBe('2026-08-15T04:00:00.000Z')
    expect(provider.status().source).toBe('live')
  })

  it('keeps the last good snapshot when online update fails', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => response({ error: 'unavailable' }, 503))
    const provider = new RegistryProvider(snapshot(), {
      fetcher,
      registryUrl: 'https://example.com/registry-v1.json',
    })
    const before = provider.current()

    const result = await provider.refresh()

    expect(result.updated).toBe(false)
    expect(provider.current()).toBe(before)
    expect(result.status.error).toContain('HTTP 503')
  })

  it('starts with an immediate update and schedules the next one', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => response(snapshot('2026-08-15T02:00:00.000Z')))
    const provider = new RegistryProvider(snapshot(), {
      fetcher,
      registryUrl: 'https://example.com/registry-v1.json',
      refreshIntervalMs: 60_000,
      now: () => new Date('2026-08-15T03:00:00.000Z'),
    })

    const stop = provider.start()
    const result = await provider.refresh()

    expect(result.updated).toBe(true)
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(provider.status().nextRefreshAt).toBe('2026-08-15T03:01:00.000Z')
    stop()
    expect(provider.status().nextRefreshAt).toBeNull()
  })
})
