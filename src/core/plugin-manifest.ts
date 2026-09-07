type JsonRecord = Record<string, unknown>

export class PluginManifestError extends Error {
  override readonly name = 'PluginManifestError'
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function isSafeRelativePath(value: string): boolean {
  return value.length > 0 && !value.includes('\0') && !value.includes('\\')
    && !value.startsWith('/') && !/^[A-Za-z]:/.test(value)
    && !value.split('/').includes('..') && value.split('/').some((part) => part !== '' && part !== '.')
}

function importTarget(value: unknown): string | null {
  if (typeof value === 'string') return value
  if (!isRecord(value)) return null
  // Node resolves matching export conditions in declaration order.
  for (const [condition, target] of Object.entries(value)) {
    if (['node', 'node-addons', 'import', 'default'].includes(condition)) {
      const resolved = importTarget(target)
      if (resolved !== null || target === null) return resolved
    }
  }
  return null
}

export function hostEntrypointOf(manifest: JsonRecord): string | null {
  if (manifest.exports !== undefined) {
    const exports = manifest.exports
    return importTarget(isRecord(exports) && Object.keys(exports).some((key) => key.startsWith('.')) ? exports['.'] : exports)
  }
  return typeof manifest.main === 'string' ? manifest.main : null
}

export function assertDshPluginManifest(manifest: unknown, expectedName?: string): string {
  if (!isRecord(manifest) || typeof manifest.name !== 'string' || !/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(manifest.name)) {
    throw new PluginManifestError('package manifest has no name')
  }
  if (expectedName !== undefined && manifest.name !== expectedName) {
    throw new PluginManifestError(`npm package name mismatch for ${expectedName}`)
  }
  if (!isRecord(manifest.dsh) || !isRecord(manifest.dsh.bundle) || typeof manifest.dsh.bundle.patch !== 'string') {
    throw new PluginManifestError(`${manifest.name} has no dsh.bundle.patch`)
  }
  if (!isSafeRelativePath(manifest.dsh.bundle.patch)) throw new PluginManifestError(`${manifest.name} has an unsafe bundle patch`)
  const entrypoint = hostEntrypointOf(manifest)
  if (entrypoint === null) {
    throw new PluginManifestError(`${manifest.name} has no host entrypoint`)
  }
  if (!isSafeRelativePath(entrypoint)) throw new PluginManifestError(`${manifest.name} has an unsafe host entrypoint`)
  return manifest.name
}
