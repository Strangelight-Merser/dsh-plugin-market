import { describe, expect, it } from 'vitest'
import { assertDshPluginManifest, hostEntrypointOf } from '../src/core/plugin-manifest.ts'

const manifest = { name: 'example-tool', main: './index.js', dsh: { bundle: { patch: './cordis.patch.yml' } } }

describe('shared manifest admission', () => {
  it('honors exports before main and supports nested Node import conditions', () => {
    expect(hostEntrypointOf({ ...manifest, exports: { node: { import: './actual.js' }, default: './other.js' } })).toBe('./actual.js')
    expect(hostEntrypointOf({ ...manifest, exports: { '.': null } })).toBeNull()
    expect(() => assertDshPluginManifest({ ...manifest, exports: { '.': { require: './only-cjs.cjs' } } })).toThrow('no host entrypoint')
  })

  it.each(['', '../outside.js', '/absolute.js', 'C:/outside.js', 'foo\\bar.js'])('rejects unsafe artifact paths: %s', (path) => {
    expect(() => assertDshPluginManifest({ ...manifest, main: path })).toThrow('unsafe host entrypoint')
    expect(() => assertDshPluginManifest({ ...manifest, dsh: { bundle: { patch: path } } })).toThrow('unsafe bundle patch')
  })

  it('rejects malformed package names during discovery rather than after publication', () => {
    expect(() => assertDshPluginManifest({ ...manifest, name: '../invalid' })).toThrow()
  })
})
