import { describe, expect, it } from 'vitest'
import { lifecycleState, type ProfileManifest } from '../src/core/profile.ts'

function manifest(overrides: ProfileManifest): ProfileManifest {
  return { dsh: { profile: { bundles: [] } }, ...overrides }
}

describe('profile lifecycle projection', () => {
  it('distinguishes managed active and inactive bundles', () => {
    expect(lifecycleState(manifest({
      dependencies: { plugin: '1.0.0' },
      dsh: { profile: { bundles: ['plugin'] } },
    }), 'plugin', true)).toBe('active')

    expect(lifecycleState(manifest({
      devDependencies: { plugin: '1.0.0' },
    }), 'plugin', true)).toBe('inactive')
  })

  it('marks contradictory package and bundle state as drifted', () => {
    expect(lifecycleState(manifest({ dependencies: { plugin: '1.0.0' } }), 'plugin', true)).toBe('drifted')
    expect(lifecycleState(manifest({
      devDependencies: { plugin: '1.0.0' },
      dsh: { profile: { bundles: ['plugin'] } },
    }), 'plugin', true)).toBe('drifted')
  })

  it('does not claim ownership of externally installed plugins', () => {
    expect(lifecycleState(manifest({
      dependencies: { plugin: '1.0.0' },
      dsh: { profile: { bundles: ['plugin'] } },
    }), 'plugin', false)).toBe('unmanaged')
    expect(lifecycleState(manifest({
      dsh: { profile: { bundles: ['in-box-bundle'] } },
    }), 'in-box-bundle', false)).toBe('unmanaged')
  })
  it('does not treat inherited keys as installed packages and flags duplicate dependency roles', () => {
    expect(lifecycleState({ dependencies: {} }, 'constructor', false)).toBe('absent')
    expect(lifecycleState({ dependencies: { tool: '1.0.0' }, devDependencies: { tool: '1.0.0' }, dsh: { profile: { bundles: ['tool'] } } }, 'tool', true)).toBe('drifted')
  })

})
