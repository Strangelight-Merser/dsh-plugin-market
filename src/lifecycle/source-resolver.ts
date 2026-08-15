import {
  RegistrySourceSchema,
  type RegistryEntry,
  type RegistryInstallHint,
  type RegistrySource,
} from '../core/registry.ts'
import { assertDshPluginManifest, PluginManifestError } from '../core/plugin-manifest.ts'

const DEFAULT_NPM_REGISTRY = 'https://registry.npmjs.org/'
const GITHUB_API = 'https://api.github.com'
const SHA_PATTERN = /^[0-9a-f]{40}$/

type JsonRecord = Record<string, unknown>

export interface ResolvedInstallSource {
  source: RegistrySource
  license: string | null
  strictLicense: boolean
}

export interface InstallSourceResolver {
  resolve(entry: RegistryEntry): Promise<ResolvedInstallSource>
}

export interface NetworkInstallSourceResolverOptions {
  fetcher?: typeof fetch
  npmRegistryUrl?: string
  githubToken?: string
}

export class SourceResolutionError extends Error {
  override readonly name = 'SourceResolutionError'
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function licenseOf(manifest: JsonRecord): string | null {
  if (typeof manifest.license === 'string' && manifest.license.length > 0) return manifest.license
  if (isRecord(manifest.license) && typeof manifest.license.type === 'string' && manifest.license.type.length > 0) return manifest.license.type
  return null
}

export class NetworkInstallSourceResolver implements InstallSourceResolver {
  private readonly fetcher: typeof fetch
  private readonly npmRegistryUrl: string
  private readonly githubToken: string | undefined

  constructor(options: NetworkInstallSourceResolverOptions = {}) {
    this.fetcher = options.fetcher ?? fetch
    this.npmRegistryUrl = new URL(options.npmRegistryUrl ?? DEFAULT_NPM_REGISTRY).href
    this.githubToken = options.githubToken
  }

  async resolve(entry: RegistryEntry): Promise<ResolvedInstallSource> {
    if (entry.source !== null) {
      return { source: entry.source, license: entry.license, strictLicense: entry.status === 'verified' }
    }
    if (entry.installHint === null) throw new SourceResolutionError('plugin has no install locator')
    return this.resolveHint(entry.installHint)
  }

  async resolveHint(hint: RegistryInstallHint): Promise<ResolvedInstallSource> {
    if (hint.kind === 'npm') return this.resolveNpm(hint.packageName)
    return this.resolveGithub(hint.repository, hint.path)
  }

  private async resolveNpm(packageName: string): Promise<ResolvedInstallSource> {
    const url = new URL(encodeURIComponent(packageName), this.npmRegistryUrl)
    const metadata = await this.fetchJson(url.href, { accept: 'application/json' })
    if (!isRecord(metadata) || !isRecord(metadata['dist-tags']) || typeof metadata['dist-tags'].latest !== 'string') {
      throw new SourceResolutionError(`npm metadata for ${packageName} has no latest version`)
    }
    const version = metadata['dist-tags'].latest
    if (!isRecord(metadata.versions) || !isRecord(metadata.versions[version])) {
      throw new SourceResolutionError(`npm metadata for ${packageName}@${version} is incomplete`)
    }
    const manifest = metadata.versions[version]
    this.assertManifest(manifest, packageName)
    const source = RegistrySourceSchema.parse({ kind: 'npm', packageName, version })
    return { source, license: licenseOf(manifest), strictLicense: false }
  }

  private async resolveGithub(repository: string, path: string | null): Promise<ResolvedInstallSource> {
    const headers = {
      accept: 'application/vnd.github+json',
      'user-agent': 'dsh-plugin-market-installer',
      ...(this.githubToken === undefined ? {} : { authorization: `Bearer ${this.githubToken}` }),
    }
    const repo = await this.fetchJson(`${GITHUB_API}/repos/${repository}`, headers)
    if (!isRecord(repo) || typeof repo.default_branch !== 'string' || repo.default_branch.length === 0) {
      throw new SourceResolutionError(`GitHub repository ${repository} has no default branch`)
    }
    const commitResponse = await this.fetcher(`${GITHUB_API}/repos/${repository}/commits/${encodeURIComponent(repo.default_branch)}`, {
      headers: { ...headers, accept: 'application/vnd.github.sha' },
      signal: AbortSignal.timeout(15_000),
    })
    if (!commitResponse.ok) throw new SourceResolutionError(`GitHub commit lookup returned HTTP ${commitResponse.status}`)
    const commit = (await commitResponse.text()).trim().toLowerCase()
    if (!SHA_PATTERN.test(commit)) throw new SourceResolutionError(`GitHub returned an invalid commit for ${repository}`)
    const manifestUrl = `https://raw.githubusercontent.com/${repository}/${commit}${path ?? ''}/package.json`
    const manifest = await this.fetchJson(manifestUrl, { 'user-agent': 'dsh-plugin-market-installer' })
    if (!isRecord(manifest)) {
      throw new SourceResolutionError(`cannot resolve a package manifest for ${repository}${path ?? ''}`)
    }
    const packageName = this.assertManifest(manifest)
    const source = RegistrySourceSchema.parse({ kind: 'github', packageName, repository, commit, path })
    return { source, license: licenseOf(manifest), strictLicense: false }
  }

  private async fetchJson(url: string, headers: Record<string, string>): Promise<unknown> {
    const response = await this.fetcher(url, { headers, signal: AbortSignal.timeout(15_000) })
    if (!response.ok) throw new SourceResolutionError(`${new URL(url).hostname} returned HTTP ${response.status}`)
    try {
      return await response.json()
    } catch {
      throw new SourceResolutionError(`${new URL(url).hostname} returned invalid JSON`)
    }
  }

  private assertManifest(manifest: unknown, expectedName?: string): string {
    try {
      return assertDshPluginManifest(manifest, expectedName)
    } catch (error) {
      if (error instanceof PluginManifestError) throw new SourceResolutionError(error.message)
      throw error
    }
  }
}
