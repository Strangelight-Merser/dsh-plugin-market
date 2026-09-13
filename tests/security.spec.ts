import { describe, expect, it } from 'vitest'
import { isSameOrigin } from '../src/host/api.ts'
import { RegistrySnapshotSchema, SUPPORTED_DSH_VERSIONS } from '../src/core/registry.ts'
import { PluginLifecycleService } from '../src/lifecycle/service.ts'
import type { DshCommandRunner } from '../src/lifecycle/runner.ts'

describe('host security gates', () => {
  it('requires an exact same-origin authority for mutation requests', () => {
    expect(isSameOrigin('http://127.0.0.1:3080', '127.0.0.1:3080')).toBe(true)
    expect(isSameOrigin('https://evil.example', '127.0.0.1:3080')).toBe(false)
    expect(isSameOrigin('https://127.0.0.1:3080', '127.0.0.1:3080')).toBe(false)
    expect(isSameOrigin('http://user@127.0.0.1:3080', '127.0.0.1:3080')).toBe(false)
    expect(isSameOrigin('http://127.0.0.1:3080/path', '127.0.0.1:3080')).toBe(false)
    expect(isSameOrigin('https://localhost:3080', 'localhost:3080', 'https:')).toBe(true)
    expect(isSameOrigin(undefined, '127.0.0.1:3080')).toBe(false)
    expect(isSameOrigin('not a URL', '127.0.0.1:3080')).toBe(false)
  })

  it.each(['0.1.0-rc.6', '0.1.5-alpha.2', '0.1.5-rc.3', '0.1.5', 'unexpected output'])('fails closed before profile mutation on unsupported DSH %s', async (version) => {
    const runner: DshCommandRunner = {
      run: async () => ({ code: 0, stdout: `${version}\n`, stderr: '' }),
    }
    const snapshot = RegistrySnapshotSchema.parse({
      schemaVersion: 1,
      generatedAt: '2026-08-15T00:00:00.000Z',
      entries: [],
    })
    const service = new PluginLifecycleService(
      () => snapshot,
      'web',
      runner,
      { resolve: async () => { throw new Error('not used') } },
      '/tmp/dsh-verified-version-gate',
    )
    await expect(service.assertSupportedRuntime()).rejects.toThrow('unsupported DSH')
  })

  it.each(SUPPORTED_DSH_VERSIONS)('accepts tested DSH %s', async (version) => {
    const service = new PluginLifecycleService(
      () => ({ schemaVersion: 1, generatedAt: '2026-09-12T00:00:00.000Z', entries: [] }),
      'web',
      { run: async () => ({ code: 0, stdout: `${version}\n`, stderr: '' }) },
      { resolve: async () => { throw new Error('not used') } },
      '/tmp/dsh-verified-version-gate',
    )
    await expect(service.assertSupportedRuntime()).resolves.toBeUndefined()
  })
})
