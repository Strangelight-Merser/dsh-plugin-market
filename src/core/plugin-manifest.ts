type JsonRecord = Record<string, unknown>

export class PluginManifestError extends Error {
  override readonly name = 'PluginManifestError'
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function hostEntrypointOf(manifest: JsonRecord): string | null {
  if (typeof manifest.main === 'string' && manifest.main.length > 0) return manifest.main
  if (typeof manifest.exports === 'string' && manifest.exports.length > 0) return manifest.exports
  if (!isRecord(manifest.exports)) return null
  const root = manifest.exports['.']
  if (typeof root === 'string' && root.length > 0) return root
  if (!isRecord(root)) return null
  for (const condition of ['import', 'default', 'require']) {
    if (typeof root[condition] === 'string' && root[condition].length > 0) return root[condition]
  }
  return null
}

export function assertDshPluginManifest(manifest: unknown, expectedName?: string): string {
  if (!isRecord(manifest) || typeof manifest.name !== 'string' || manifest.name.length === 0) {
    throw new PluginManifestError('package manifest has no name')
  }
  if (expectedName !== undefined && manifest.name !== expectedName) {
    throw new PluginManifestError(`npm package name mismatch for ${expectedName}`)
  }
  if (!isRecord(manifest.dsh) || !isRecord(manifest.dsh.bundle) || typeof manifest.dsh.bundle.patch !== 'string') {
    throw new PluginManifestError(`${manifest.name} has no dsh.bundle.patch`)
  }
  if (hostEntrypointOf(manifest) === null) {
    throw new PluginManifestError(`${manifest.name} has no host entrypoint`)
  }
  return manifest.name
}
