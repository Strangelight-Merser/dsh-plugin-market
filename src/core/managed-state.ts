import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { z } from 'zod'

const packageNamePattern = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/
const exactInstallRefPattern = /^(?:(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*@\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?|github:[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+#[0-9a-f]{40}(?:&path:\/(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+)?)$/

const ManagedPluginSchema = z.object({
  id: z.string().min(1).max(200).regex(/^[a-z0-9][a-z0-9:._/-]*$/),
  packageName: z.string().regex(packageNamePattern),
  installRef: z.string().regex(exactInstallRefPattern),
  installedAt: z.iso.datetime(),
}).strict()

const ManagedStateSchema = z.object({
  schemaVersion: z.literal(1),
  plugins: z.record(z.string(), ManagedPluginSchema),
}).strict()

export type ManagedPlugin = z.infer<typeof ManagedPluginSchema>
export type ManagedState = z.infer<typeof ManagedStateSchema>

export function stateFile(profileDir: string): string {
  return join(profileDir, '.dsh-plugin-market', 'state.json')
}

export async function readManagedState(profileDir: string): Promise<ManagedState> {
  try {
    return ManagedStateSchema.parse(JSON.parse(await readFile(stateFile(profileDir), 'utf8')))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { schemaVersion: 1, plugins: {} }
    throw error
  }
}

export async function writeManagedState(profileDir: string, state: ManagedState): Promise<void> {
  const parsed = ManagedStateSchema.parse(state)
  const destination = stateFile(profileDir)
  await mkdir(dirname(destination), { recursive: true })
  const temporary = `${destination}.${process.pid}.${crypto.randomUUID()}.tmp`
  await writeFile(temporary, `${JSON.stringify(parsed, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  await rename(temporary, destination)
}
