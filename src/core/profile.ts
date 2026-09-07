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
  const activeDependency = Object.hasOwn(manifest.dependencies ?? {}, packageName)
  const inactiveDependency = Object.hasOwn(manifest.devDependencies ?? {}, packageName)
  const inBundles = manifest.dsh?.profile?.bundles?.includes(packageName) ?? false

  if (!managed) return activeDependency || inactiveDependency || inBundles ? 'unmanaged' : 'absent'
  if (activeDependency && inactiveDependency) return 'drifted'
  if (activeDependency && inBundles) return 'active'
  if (inactiveDependency && !inBundles) return 'inactive'
  if (!activeDependency && !inactiveDependency && !inBundles) return 'absent'
  return 'drifted'
}
