import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export interface ProfileManifest {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  dsh?: { profile?: { bundles?: string[] } }
}

export type PluginLifecycleState = 'active' | 'inactive' | 'unmanaged' | 'absent' | 'drifted'

export async function readProfileManifest(profileDir: string): Promise<ProfileManifest> {
  return JSON.parse(await readFile(join(profileDir, 'package.json'), 'utf8')) as ProfileManifest
}

export function lifecycleState(manifest: ProfileManifest, packageName: string, managed: boolean): PluginLifecycleState {
  const activeDependency = manifest.dependencies?.[packageName] !== undefined
  const inactiveDependency = manifest.devDependencies?.[packageName] !== undefined
  const inBundles = manifest.dsh?.profile?.bundles?.includes(packageName) ?? false

  if (!managed) return activeDependency || inactiveDependency || inBundles ? 'unmanaged' : 'absent'
  if (activeDependency && inBundles) return 'active'
  if (inactiveDependency && !inBundles) return 'inactive'
  if (!activeDependency && !inactiveDependency && !inBundles) return 'absent'
  return 'drifted'
}
