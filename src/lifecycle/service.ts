import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { BundleValidationError, inspectInstalledBundle } from '../core/installed-bundle.ts'
import { readManagedState, stateFile, writeManagedState, type ManagedPlugin, type ManagedState } from '../core/managed-state.ts'
import { lifecycleState, readProfileManifest, type PluginLifecycleState } from '../core/profile.ts'
import { withProfileLock } from '../core/profile-lock.ts'
import {
  installBlockReason,
  installRef,
  RegistrySnapshotSchema,
  SUPPORTED_DSH_VERSION,
  type RegistryEntry,
  type RegistrySnapshot,
} from '../core/registry.ts'
import { type CommandResult, type DshCommandRunner, SpawnDshRunner } from './runner.ts'
import {
  NetworkInstallSourceResolver,
  SourceResolutionError,
  type InstallSourceResolver,
  type ResolvedInstallSource,
} from './source-resolver.ts'

const PROFILE_PATTERN = /^[a-z0-9][a-z0-9._-]*$/
const BACKUP_FILES = ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml'] as const

export type LifecycleAction = 'install' | 'enable' | 'disable' | 'uninstall'

export interface LifecycleResult {
  action: LifecycleAction
  id: string
  packageName: string
  state: PluginLifecycleState
  resolvedRef: string
  runtimeEffect: 'restart-required'
}

export interface LifecyclePreview {
  id: string
  packageName: string
  repositoryUrl: string
  resolvedRef: string
  license: string | null
  verified: boolean
}

interface BundleValidation {
  license: string | null
  strictLicense: boolean
}

interface MetadataBackup {
  path: string
  content: Buffer | null
}

export class LifecycleError extends Error {
  override readonly name = 'LifecycleError'
}

async function readOptional(path: string): Promise<Buffer | null> {
  try {
    return await readFile(path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

async function takeMetadataBackup(profileDir: string): Promise<MetadataBackup[]> {
  const paths = [...BACKUP_FILES.map((name) => join(profileDir, name)), stateFile(profileDir)]
  return Promise.all(paths.map(async (path) => ({ path, content: await readOptional(path) })))
}

async function restoreMetadata(backups: readonly MetadataBackup[]): Promise<void> {
  for (const backup of backups) {
    if (backup.content === null) {
      await unlink(backup.path).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT') throw error
      })
      continue
    }
    await mkdir(dirname(backup.path), { recursive: true })
    await writeFile(backup.path, backup.content)
  }
}

function commandFailure(args: readonly string[], result: CommandResult): LifecycleError {
  const detail = [result.stdout.trim(), result.stderr.trim()].filter((value) => value.length > 0).join('\n') || `exit ${result.code}`
  return new LifecycleError(`dsh ${args.join(' ')} failed: ${detail}`)
}

export class PluginLifecycleService {
  readonly dshHome: string
  readonly profileDir: string

  constructor(
    private readonly registry: () => RegistrySnapshot,
    readonly profile: string,
    private readonly runner: DshCommandRunner,
    private readonly resolver: InstallSourceResolver,
    dshHome = process.env.DSH_HOME ?? join(homedir(), '.dsh'),
  ) {
    if (!PROFILE_PATTERN.test(profile)) throw new LifecycleError('invalid profile name')
    RegistrySnapshotSchema.parse(registry())
    this.dshHome = dshHome
    this.profileDir = join(dshHome, 'profiles', profile)
  }

  static create(registry: () => RegistrySnapshot, profile = 'web', dshHome = process.env.DSH_HOME ?? join(homedir(), '.dsh')): PluginLifecycleService {
    return new PluginLifecycleService(
      registry,
      profile,
      new SpawnDshRunner(dshHome),
      new NetworkInstallSourceResolver({
        ...(process.env.GITHUB_TOKEN === undefined ? {} : { githubToken: process.env.GITHUB_TOKEN }),
      }),
      dshHome,
    )
  }

  async assertSupportedRuntime(): Promise<void> {
    const result = await this.runner.run(['--version'])
    if (result.code !== 0) throw commandFailure(['--version'], result)
    if (result.stdout.trim() !== SUPPORTED_DSH_VERSION) {
      throw new LifecycleError(`unsupported DSH ${JSON.stringify(result.stdout.trim())}; expected ${SUPPORTED_DSH_VERSION}`)
    }
  }

  async stateFor(packageName: string): Promise<PluginLifecycleState> {
    const manifest = await readProfileManifest(this.profileDir)
    const managed = (await readManagedState(this.profileDir)).plugins[packageName] !== undefined
    return lifecycleState(manifest, packageName, managed)
  }

  async preview(id: string): Promise<LifecyclePreview> {
    const entry = this.entryFor(id)
    if (entry === undefined) throw new LifecycleError(`registry entry ${id} does not exist`)
    const reason = installBlockReason(entry)
    if (reason !== null) throw new LifecycleError(reason)
    let resolved: ResolvedInstallSource
    try {
      resolved = await this.resolver.resolve(entry)
    } catch (error) {
      if (error instanceof SourceResolutionError) throw new LifecycleError(error.message)
      throw error
    }
    return {
      id,
      packageName: resolved.source.packageName,
      repositoryUrl: entry.repositoryUrl,
      resolvedRef: installRef(resolved.source),
      license: resolved.license,
      verified: entry.status === 'verified',
    }
  }

  async perform(action: LifecycleAction, id: string, expectedRef?: string): Promise<LifecycleResult> {
    await this.assertSupportedRuntime()
    return withProfileLock(this.dshHome, this.profile, async () => {
      await readProfileManifest(this.profileDir)
      const entry = this.entryFor(id)
      const managedState = await readManagedState(this.profileDir)

      if (action === 'install') {
        if (entry === undefined) throw new LifecycleError(`registry entry ${id} does not exist`)
        const reason = installBlockReason(entry)
        if (reason !== null) throw new LifecycleError(reason)
      }

      if (action === 'install') return this.install(entry!, managedState, expectedRef)
      const managed = Object.values(managedState.plugins).find((plugin) => plugin.id === id)
      if (managed === undefined) throw new LifecycleError(`plugin ${id} is not managed by this market`)
      if (action === 'enable') return this.enable(entry, managed, managedState)
      if (action === 'disable') return this.disable(entry, managed, managedState)
      return this.uninstall(managed, managedState)
    })
  }

  private entryFor(id: string): RegistryEntry | undefined {
    const snapshot = RegistrySnapshotSchema.parse(this.registry())
    return snapshot.entries.find((entry) => entry.id === id)
  }

  private async install(entry: RegistryEntry, state: ManagedState, expectedRef?: string): Promise<LifecycleResult> {
    let resolved: ResolvedInstallSource
    try {
      resolved = await this.resolver.resolve(entry)
    } catch (error) {
      if (error instanceof SourceResolutionError) throw new LifecycleError(error.message)
      throw error
    }
    const resolvedRef = installRef(resolved.source)
    if (expectedRef !== undefined && resolvedRef !== expectedRef) {
      throw new LifecycleError('install source changed after preview; review it again')
    }
    const packageName = resolved.source.packageName
    if (state.plugins[packageName] !== undefined) throw new LifecycleError(`${packageName} is already managed`)
    const before = lifecycleState(await readProfileManifest(this.profileDir), packageName, false)
    if (before !== 'absent') throw new LifecycleError(`${packageName} is already present as ${before}`)
    const managed: ManagedPlugin = {
      id: entry.id,
      packageName,
      installRef: resolvedRef,
      installedAt: new Date().toISOString(),
    }
    return this.mutate(
      'install',
      managed,
      state,
      ['plugin', '--profile', this.profile, 'add', '--save-prod', '--save-exact', '--ignore-scripts', managed.installRef],
      'active',
      { license: resolved.license, strictLicense: resolved.strictLicense },
      (next) => { next.plugins[packageName] = managed },
      true,
    )
  }

  private async enable(entry: RegistryEntry | undefined, managed: ManagedPlugin, state: ManagedState): Promise<LifecycleResult> {
    const before = await this.assertManagedState(managed, 'inactive')
    if (before !== 'inactive') throw new LifecycleError(`${managed.packageName} must be inactive before enabling`)
    return this.mutate(
      'enable',
      managed,
      state,
      ['plugin', '--profile', this.profile, 'add', '--save-prod', '--save-exact', '--ignore-scripts', managed.installRef],
      'active',
      this.validationFor(entry),
      () => undefined,
      true,
    )
  }

  private async disable(entry: RegistryEntry | undefined, managed: ManagedPlugin, state: ManagedState): Promise<LifecycleResult> {
    await this.assertManagedState(managed, 'active')
    return this.mutate(
      'disable',
      managed,
      state,
      ['plugin', '--profile', this.profile, 'add', '--save-dev', '--save-exact', '--ignore-scripts', managed.installRef],
      'inactive',
      this.validationFor(entry),
      () => undefined,
      true,
    )
  }

  private validationFor(entry: RegistryEntry | undefined): BundleValidation {
    if (entry?.status === 'verified') return { license: entry.license, strictLicense: true }
    return { license: null, strictLicense: false }
  }

  private async uninstall(managed: ManagedPlugin, state: ManagedState): Promise<LifecycleResult> {
    const before = await this.assertManagedState(managed, ['active', 'inactive'])
    if (before !== 'active' && before !== 'inactive') throw new LifecycleError(`${managed.packageName} cannot be uninstalled from ${before}`)
    return this.mutate(
      'uninstall',
      managed,
      state,
      ['plugin', '--profile', this.profile, 'remove', managed.packageName],
      'absent',
      null,
      (next) => { delete next.plugins[managed.packageName] },
      true,
    )
  }

  private async assertManagedState(
    managed: ManagedPlugin,
    expected: PluginLifecycleState | readonly PluginLifecycleState[],
  ): Promise<PluginLifecycleState> {
    const actual = lifecycleState(await readProfileManifest(this.profileDir), managed.packageName, true)
    const allowed = Array.isArray(expected) ? expected : [expected]
    if (!allowed.includes(actual)) throw new LifecycleError(`${managed.packageName} is ${actual}; expected ${allowed.join(' or ')}`)
    return actual
  }

  private async mutate(
    action: LifecycleAction,
    managed: ManagedPlugin,
    state: ManagedState,
    args: readonly string[],
    expected: PluginLifecycleState,
    validation: BundleValidation | null,
    editState: (state: ManagedState) => void,
    dumpConfig = false,
  ): Promise<LifecycleResult> {
    const backups = await takeMetadataBackup(this.profileDir)
    try {
      const result = await this.runner.run(args)
      if (result.code !== 0) throw commandFailure(args, result)
      if (validation !== null) {
        await inspectInstalledBundle(this.profileDir, { packageName: managed.packageName, ...validation })
      }
      const actual = lifecycleState(await readProfileManifest(this.profileDir), managed.packageName, true)
      if (actual !== expected) throw new LifecycleError(`${managed.packageName} became ${actual}, expected ${expected}`)
      if (dumpConfig) {
        const dumpArgs = ['--profile', this.profile, '--dump-config'] as const
        const dump = await this.runner.run(dumpArgs)
        if (dump.code !== 0) throw commandFailure(dumpArgs, dump)
      }
      editState(state)
      await writeManagedState(this.profileDir, state)
      return {
        action,
        id: managed.id,
        packageName: managed.packageName,
        state: expected,
        resolvedRef: managed.installRef,
        runtimeEffect: 'restart-required',
      }
    } catch (error) {
      await restoreMetadata(backups)
      const repairArgs = ['plugin', '--profile', this.profile, 'install', '--ignore-scripts'] as const
      const repaired = await this.runner.run(repairArgs)
      if (repaired.code !== 0) {
        throw new LifecycleError(`operation failed (${String(error)}); rollback also failed (${commandFailure(repairArgs, repaired).message})`)
      }
      if (error instanceof BundleValidationError) throw new LifecycleError(error.message)
      throw error
    }
  }
}
