import { z } from 'zod'

export const SUPPORTED_DSH_VERSION = '0.1.0-rc.6' as const

const packageNamePattern = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/
const exactVersionPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/
const shaPattern = /^[0-9a-f]{40}$/
const repositoryPattern = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/
const repositoryPathPattern = /^\/(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+$/

export const RegistryInstallHintSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('npm'),
    packageName: z.string().regex(packageNamePattern),
  }).strict(),
  z.object({
    kind: z.literal('github'),
    repository: z.string().regex(repositoryPattern),
    path: z.string().regex(repositoryPathPattern).nullable(),
  }).strict(),
]).readonly()

export const RegistrySourceSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('npm'),
    packageName: z.string().regex(packageNamePattern),
    version: z.string().regex(exactVersionPattern),
  }).strict(),
  z.object({
    kind: z.literal('github'),
    packageName: z.string().regex(packageNamePattern),
    repository: z.string().regex(repositoryPattern),
    commit: z.string().regex(shaPattern),
    path: z.string().regex(repositoryPathPattern).nullable(),
  }).strict(),
]).readonly()

export const RegistryEntrySchema = z.object({
  id: z.string().min(1).max(200).regex(/^[a-z0-9][a-z0-9:._/-]*$/),
  name: z.string().min(1).max(120),
  description: z.object({ en: z.string().max(500), zh: z.string().max(500) }).strict(),
  category: z.enum(['ui', 'theme', 'session', 'memory', 'tools', 'skill', 'workflow', 'notify', 'model', 'dev', 'fun', 'other']),
  repositoryUrl: z.url().startsWith('https://github.com/'),
  license: z.string().min(1).nullable(),
  source: RegistrySourceSchema.nullable(),
  installHint: RegistryInstallHintSchema.nullable(),
  status: z.enum(['candidate', 'native', 'installable', 'verified', 'blocked']),
  discovery: z.object({
    sources: z.array(z.enum(['awesome-dsh-plugin', 'github-topic'])).min(1),
    stars: z.number().int().nonnegative().nullable(),
    pushedAt: z.iso.datetime().nullable(),
  }).strict().optional(),
  evidence: z.object({
    dshVersion: z.literal(SUPPORTED_DSH_VERSION),
    checkedAt: z.iso.datetime(),
    platform: z.enum(['darwin', 'linux', 'win32']),
    manifest: z.literal('pass'),
    artifacts: z.literal('pass'),
    dumpConfig: z.literal('pass'),
    boot: z.literal('pass'),
  }).strict().optional(),
}).strict()

export const RegistrySnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: z.iso.datetime(),
  entries: z.array(RegistryEntrySchema),
}).strict()

export type RegistrySource = z.infer<typeof RegistrySourceSchema>
export type RegistryInstallHint = z.infer<typeof RegistryInstallHintSchema>
export type RegistryEntry = z.infer<typeof RegistryEntrySchema>
export type RegistrySnapshot = z.infer<typeof RegistrySnapshotSchema>

export function installRef(source: RegistrySource): string {
  if (source.kind === 'npm') return `${source.packageName}@${source.version}`
  return `github:${source.repository}#${source.commit}${source.path === null ? '' : `&path:${source.path}`}`
}

export function installBlockReason(entry: RegistryEntry): string | null {
  if (entry.status === 'blocked') return 'plugin is explicitly blocked'
  if (entry.source === null && entry.installHint === null) return 'install locator is missing'
  if (entry.status === 'verified' && entry.evidence?.dshVersion !== SUPPORTED_DSH_VERSION) {
    return 'verification targets an unsupported DSH version'
  }
  return null
}

export function parseInstallHint(value: unknown): RegistryInstallHint | null {
  if (typeof value !== 'string') return null
  const prefix = 'dsh plugin --profile web add '
  if (!value.startsWith(prefix)) return null
  const locator = value.slice(prefix.length)
  if (locator.startsWith('github:')) {
    const match = /^github:([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)(?:#path:(\/(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+))?$/.exec(locator)
    if (match === null) return null
    return RegistryInstallHintSchema.parse({ kind: 'github', repository: match[1], path: match[2] ?? null })
  }
  const parsed = RegistryInstallHintSchema.safeParse({ kind: 'npm', packageName: locator })
  return parsed.success ? parsed.data : null
}
