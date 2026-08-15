import { assertDshPluginManifest, PluginManifestError } from '../core/plugin-manifest.ts'
import { RegistrySourceSchema, type CatalogValidation, type RegistryInstallHint, type RegistrySource } from '../core/registry.ts'

const DEFAULT_NPM_REGISTRY = 'https://registry.npmjs.org/'

type JsonRecord = Record<string, unknown>

export interface ManifestValidationResult {
  validation: CatalogValidation
  source: RegistrySource | null
  license: string | null
}

export interface CatalogManifestValidatorOptions {
  fetcher?: typeof fetch
  npmRegistryUrl?: string
  now?: () => Date
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function licenseOf(manifest: JsonRecord): string | null {
  if (typeof manifest.license === 'string' && manifest.license.length > 0) return manifest.license
  if (isRecord(manifest.license) && typeof manifest.license.type === 'string' && manifest.license.type.length > 0) return manifest.license.type
  return null
}

export class CatalogManifestValidator {
  private readonly fetcher: typeof fetch
  private readonly npmRegistryUrl: string
  private readonly now: () => Date

  constructor(options: CatalogManifestValidatorOptions = {}) {
    this.fetcher = options.fetcher ?? fetch
    this.npmRegistryUrl = new URL(options.npmRegistryUrl ?? DEFAULT_NPM_REGISTRY).href
    this.now = options.now ?? (() => new Date())
  }

  async validate(hint: RegistryInstallHint): Promise<ManifestValidationResult> {
    return hint.kind === 'npm' ? this.validateNpm(hint.packageName) : this.validateGithub(hint.repository, hint.path)
  }

  private async validateNpm(packageName: string): Promise<ManifestValidationResult> {
    const metadata = await this.fetchJson(new URL(encodeURIComponent(packageName), this.npmRegistryUrl).href)
    if (!isRecord(metadata) || !isRecord(metadata['dist-tags']) || typeof metadata['dist-tags'].latest !== 'string') {
      throw new PluginManifestError(`npm metadata for ${packageName} has no latest version`)
    }
    const version = metadata['dist-tags'].latest
    if (!isRecord(metadata.versions) || !isRecord(metadata.versions[version])) {
      throw new PluginManifestError(`npm metadata for ${packageName}@${version} is incomplete`)
    }
    const manifest = metadata.versions[version]
    const resolvedName = assertDshPluginManifest(manifest, packageName)
    return {
      validation: { manifest: 'pass', checkedAt: this.now().toISOString(), packageName: resolvedName },
      source: RegistrySourceSchema.parse({ kind: 'npm', packageName, version }),
      license: licenseOf(manifest),
    }
  }

  private async validateGithub(repository: string, path: string | null): Promise<ManifestValidationResult> {
    const manifest = await this.fetchJson(`https://raw.githubusercontent.com/${repository}/HEAD${path ?? ''}/package.json`)
    if (!isRecord(manifest)) throw new PluginManifestError(`cannot resolve a package manifest for ${repository}${path ?? ''}`)
    const packageName = assertDshPluginManifest(manifest)
    return {
      validation: { manifest: 'pass', checkedAt: this.now().toISOString(), packageName },
      source: null,
      license: licenseOf(manifest),
    }
  }

  private async fetchJson(url: string): Promise<unknown> {
    const response = await this.fetcher(url, {
      headers: { accept: 'application/json', 'user-agent': 'dsh-plugin-market-catalog-validator' },
      signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) throw new PluginManifestError(`${new URL(url).hostname} returned HTTP ${response.status}`)
    try {
      return await response.json()
    } catch {
      throw new PluginManifestError(`${new URL(url).hostname} returned invalid JSON`)
    }
  }
}
