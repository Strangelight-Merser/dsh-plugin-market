import { realpath, readFile, stat } from 'node:fs/promises'
import { isAbsolute, join, resolve, sep } from 'node:path'

const OPEN_SOURCE_LICENSES = new Set([
  '0BSD',
  'AGPL-3.0-only',
  'AGPL-3.0-or-later',
  'Apache-2.0',
  'Artistic-2.0',
  'BSD-2-Clause',
  'BSD-2-Clause-Patent',
  'BSD-3-Clause',
  'CC0-1.0',
  'EPL-1.0',
  'EPL-2.0',
  'EUPL-1.2',
  'GPL-2.0-only',
  'GPL-2.0-or-later',
  'GPL-3.0-only',
  'GPL-3.0-or-later',
  'ISC',
  'LGPL-2.1-only',
  'LGPL-2.1-or-later',
  'LGPL-3.0-only',
  'LGPL-3.0-or-later',
  'MIT',
  'MPL-2.0',
  'Unlicense',
  'Zlib',
])

interface PackageManifest {
  name?: unknown
  license?: unknown
  main?: unknown
  exports?: unknown
  dsh?: { bundle?: { patch?: unknown } }
}

export interface InstalledBundle {
  packageName: string
  license: string | null
  packageRoot: string
  patchPath: string
  entrypointPath: string
}

export class BundleValidationError extends Error {
  override readonly name = 'BundleValidationError'
}

function isSafeRelativePath(value: string): boolean {
  if (value.length === 0 || value.includes('\0') || isAbsolute(value)) return false
  return resolve('/', value) !== '/' && !value.split(/[\\/]/).includes('..')
}

function exportedEntrypoint(manifest: PackageManifest): string | null {
  if (typeof manifest.main === 'string') return manifest.main
  if (typeof manifest.exports === 'string') return manifest.exports
  if (typeof manifest.exports === 'object' && manifest.exports !== null && !Array.isArray(manifest.exports)) {
    const root = (manifest.exports as Record<string, unknown>)['.']
    if (typeof root === 'string') return root
    if (typeof root === 'object' && root !== null && !Array.isArray(root)) {
      const conditions = root as Record<string, unknown>
      for (const key of ['import', 'default', 'require']) {
        if (typeof conditions[key] === 'string') return conditions[key]
      }
    }
  }
  return null
}

async function assertContainedFile(packageRoot: string, relativePath: string, label: string): Promise<string> {
  if (!isSafeRelativePath(relativePath)) throw new BundleValidationError(`${label} is not a safe relative path`)
  const realRoot = await realpath(packageRoot)
  const candidate = await realpath(resolve(realRoot, relativePath))
  if (!candidate.startsWith(`${realRoot}${sep}`)) throw new BundleValidationError(`${label} escapes the installed package`)
  if (!(await stat(candidate)).isFile()) throw new BundleValidationError(`${label} is not a file`)
  return candidate
}

export function isApprovedOpenSourceLicense(license: string): boolean {
  return OPEN_SOURCE_LICENSES.has(license)
}

export async function inspectInstalledBundle(
  profileDir: string,
  expected: { packageName: string; license: string | null; strictLicense: boolean },
): Promise<InstalledBundle> {
  const packageRoot = join(profileDir, 'node_modules', ...expected.packageName.split('/'))
  let manifest: PackageManifest
  try {
    manifest = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8')) as PackageManifest
  } catch (error) {
    throw new BundleValidationError(`cannot read installed manifest: ${String(error)}`)
  }

  if (manifest.name !== expected.packageName) throw new BundleValidationError('installed package name does not match the registry')
  const license = typeof manifest.license === 'string' ? manifest.license : null
  if (expected.strictLicense) {
    if (expected.license === null || license !== expected.license) {
      throw new BundleValidationError('installed license does not match the verified registry evidence')
    }
    if (!isApprovedOpenSourceLicense(license)) throw new BundleValidationError(`license ${license} is not approved`)
  }

  const patch = manifest.dsh?.bundle?.patch
  if (typeof patch !== 'string') throw new BundleValidationError('installed package has no dsh.bundle.patch')
  const entrypoint = exportedEntrypoint(manifest)
  if (entrypoint === null) throw new BundleValidationError('installed package has no host entrypoint')

  return {
    packageName: expected.packageName,
    license,
    packageRoot: await realpath(packageRoot),
    patchPath: await assertContainedFile(packageRoot, patch, 'bundle patch'),
    entrypointPath: await assertContainedFile(packageRoot, entrypoint, 'host entrypoint'),
  }
}
