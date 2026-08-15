import { describe, expect, it } from 'vitest'
import { isSameOrigin } from '../src/host/api.ts'
import { RegistrySnapshotSchema } from '../src/core/registry.ts'
import { PluginLifecycleService } from '../src/lifecycle/service.ts'
import type { DshCommandRunner } from '../src/lifecycle/runner.ts'

describe('host security gates', () => {
  it('requires an exact same-origin authority for mutation requests', () => {
    expect(isSameOrigin('http://127.0.0.1:3080', '127.0.0.1:3080')).toBe(true)
    expect(isSameOrigin('https://evil.example', '127.0.0.1:3080')).toBe(false)
    expect(isSameOrigin(undefined, '127.0.0.1:3080')).toBe(false)
    expect(isSameOrigin('not a URL', '127.0.0.1:3080')).toBe(false)
  })

  it('fails closed before profile mutation on a DSH version mismatch', async () => {
    const runner: DshCommandRunner = {
      run: async () => ({ code: 0, stdout: '0.1.0-rc.5\n', stderr: '' }),
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
})
