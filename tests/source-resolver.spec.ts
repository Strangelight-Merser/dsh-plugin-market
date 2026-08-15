import { describe, expect, it } from 'vitest'
import { RegistryEntrySchema } from '../src/core/registry.ts'
import { NetworkInstallSourceResolver } from '../src/lifecycle/source-resolver.ts'

function entry(input: Record<string, unknown>) {
  return RegistryEntrySchema.parse({
    id: 'github:example/plugin',
    name: 'Example plugin',
    description: { en: 'example', zh: '示例' },
    category: 'tools',
    repositoryUrl: 'https://github.com/example/plugin',
    license: null,
    source: null,
    status: 'installable',
    validation: { manifest: 'pass', checkedAt: '2026-08-15T00:00:00.000Z', packageName: 'example-plugin' },
    ...input,
  })
}

describe('network install source resolution', () => {
  it('resolves an npm locator to the current exact version', async () => {
    const requests: string[] = []
    const fetcher: typeof fetch = async (input) => {
      requests.push(String(input))
      return Response.json({
        'dist-tags': { latest: '2.4.1' },
        versions: {
          '2.4.1': {
            name: '@example/dsh-plugin',
            version: '2.4.1',
            license: 'MIT',
            main: './index.js',
            dsh: { bundle: { patch: './cordis.patch.yml' } },
          },
        },
      })
    }
    const resolver = new NetworkInstallSourceResolver({ fetcher, npmRegistryUrl: 'https://registry.example.test/' })
    await expect(resolver.resolve(entry({
      installHint: { kind: 'npm', packageName: '@example/dsh-plugin' },
    }))).resolves.toEqual({
      source: { kind: 'npm', packageName: '@example/dsh-plugin', version: '2.4.1' },
      license: 'MIT',
      strictLicense: false,
    })
    expect(requests).toEqual(['https://registry.example.test/%40example%2Fdsh-plugin'])
  })

  it('pins a GitHub monorepo package to a 40-character commit and preserves its path', async () => {
    const commit = 'a'.repeat(40)
    const requests: string[] = []
    const fetcher: typeof fetch = async (input) => {
      const url = String(input)
      requests.push(url)
      if (url === 'https://api.github.com/repos/example/monorepo') return Response.json({ default_branch: 'main' })
      if (url === 'https://api.github.com/repos/example/monorepo/commits/main') return new Response(commit)
      if (url === `https://raw.githubusercontent.com/example/monorepo/${commit}/packages/ui/package.json`) {
        return Response.json({
          name: '@example/dsh-ui',
          license: 'Apache-2.0',
          main: './index.js',
          dsh: { bundle: { patch: './cordis.patch.yml' } },
        })
      }
      return new Response('not found', { status: 404 })
    }
    const resolver = new NetworkInstallSourceResolver({ fetcher })
    await expect(resolver.resolve(entry({
      id: 'github:example/monorepo/path/packages/ui',
      repositoryUrl: 'https://github.com/example/monorepo',
      installHint: { kind: 'github', repository: 'example/monorepo', path: '/packages/ui' },
    }))).resolves.toEqual({
      source: {
        kind: 'github',
        packageName: '@example/dsh-ui',
        repository: 'example/monorepo',
        commit,
        path: '/packages/ui',
      },
      license: 'Apache-2.0',
      strictLicense: false,
    })
    expect(requests).toHaveLength(3)
  })

  it('rejects a GitHub response that cannot prove an exact commit', async () => {
    const fetcher: typeof fetch = async (input) => String(input).endsWith('/repos/example/plugin')
      ? Response.json({ default_branch: 'main' })
      : new Response('main')
    const resolver = new NetworkInstallSourceResolver({ fetcher })
    await expect(resolver.resolve(entry({
      installHint: { kind: 'github', repository: 'example/plugin', path: null },
    }))).rejects.toThrow('invalid commit')
  })

  it('rejects a repository that is not a native DSH plugin before installation', async () => {
    const fetcher: typeof fetch = async () => Response.json({
      'dist-tags': { latest: '1.0.0' },
      versions: { '1.0.0': { name: 'not-a-dsh-plugin', version: '1.0.0', main: './index.js' } },
    })
    const resolver = new NetworkInstallSourceResolver({ fetcher })
    await expect(resolver.resolve(entry({
      installHint: { kind: 'npm', packageName: 'not-a-dsh-plugin' },
    }))).rejects.toThrow('no dsh.bundle.patch')
  })
})
