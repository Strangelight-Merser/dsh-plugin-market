import { describe, expect, it } from 'vitest'
import { CatalogManifestValidator } from '../src/registry/manifest-validator.ts'

const checkedAt = '2026-08-15T08:00:00.000Z'

describe('catalog manifest admission', () => {
  it('admits an npm package only after validating its latest DSH manifest', async () => {
    const validator = new CatalogManifestValidator({
      now: () => new Date(checkedAt),
      npmRegistryUrl: 'https://registry.example.test/',
      fetcher: async () => Response.json({
        'dist-tags': { latest: '1.4.0' },
        versions: {
          '1.4.0': {
            name: '@example/dsh-tool',
            version: '1.4.0',
            license: 'MIT',
            main: './lib/index.js',
            dsh: { bundle: { patch: './cordis.patch.yml' } },
          },
        },
      }),
    })
    await expect(validator.validate({ kind: 'npm', packageName: '@example/dsh-tool' })).resolves.toEqual({
      validation: { manifest: 'pass', checkedAt, packageName: '@example/dsh-tool' },
      source: { kind: 'npm', packageName: '@example/dsh-tool', version: '1.4.0' },
      license: 'MIT',
    })
  })

  it('checks the declared GitHub subdirectory rather than trusting a topic', async () => {
    const requests: string[] = []
    const validator = new CatalogManifestValidator({
      now: () => new Date(checkedAt),
      fetcher: async (input) => {
        requests.push(String(input))
        return Response.json({
          name: '@example/dsh-ui',
          license: 'Apache-2.0',
          exports: './index.js',
          dsh: { bundle: { patch: './cordis.patch.yml' } },
        })
      },
    })
    await expect(validator.validate({ kind: 'github', repository: 'example/mono', path: '/packages/ui' }))
      .resolves.toEqual({
        validation: { manifest: 'pass', checkedAt, packageName: '@example/dsh-ui' },
        source: null,
        license: 'Apache-2.0',
      })
    expect(requests).toEqual(['https://raw.githubusercontent.com/example/mono/HEAD/packages/ui/package.json'])
  })

  it('rejects a repository with no native DSH bundle declaration', async () => {
    const validator = new CatalogManifestValidator({ fetcher: async () => Response.json({ name: 'unrelated', main: './index.js' }) })
    await expect(validator.validate({ kind: 'github', repository: 'example/unrelated', path: null }))
      .rejects.toThrow('no dsh.bundle.patch')
  })
})
