import {
  RegistryEntrySchema,
  RegistrySnapshotSchema,
  parseInstallHint,
  type CatalogValidation,
  type RegistryInstallHint,
  type RegistryEntry,
  type RegistrySource,
  type RegistrySnapshot,
} from '../core/registry.ts'
import { CatalogManifestValidator } from './manifest-validator.ts'

const CURATED_URL = 'https://awesome-dsh-plugin.com/plugins.json'
const GITHUB_SEARCH_URL = 'https://api.github.com/search/repositories'
export const DEFAULT_REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000

const allowedCategories = new Set<RegistryEntry['category']>([
  'ui', 'theme', 'session', 'memory', 'tools', 'skill', 'workflow', 'notify', 'model', 'dev', 'fun', 'other',
])

type JsonRecord = Record<string, unknown>

export interface RegistryRefreshStatus {
  source: 'bundled' | 'live'
  refreshing: boolean
  intervalMs: number
  lastAttemptAt: string | null
  lastSuccessAt: string | null
  nextRefreshAt: string | null
  error: string | null
  curatedRows: number | null
  githubRows: number | null
  acceptedRows: number | null
  rejectedRows: number | null
}

export interface RegistryRefreshResult {
  updated: boolean
  status: RegistryRefreshStatus
}

export interface RegistryProviderOptions {
  fetcher?: typeof fetch
  now?: () => Date
  refreshIntervalMs?: number
  githubPages?: number
  githubToken?: string
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function repositoryIdentity(value: unknown): string | null {
  const url = stringValue(value)
  if (url === null) return null
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' || parsed.hostname.toLowerCase() !== 'github.com') return null
    const parts = parsed.pathname.split('/').filter(Boolean)
    if (parts.length < 2) return null
    return `${parts[0]}/${parts[1]!.replace(/\.git$/i, '')}`
  } catch {
    return null
  }
}

function description(value: unknown): RegistryEntry['description'] {
  if (!isRecord(value)) return { en: '', zh: '' }
  const en = typeof value.en === 'string' ? value.en.slice(0, 4000) : ''
  const zh = typeof value.zh === 'string' ? value.zh.slice(0, 4000) : en
  return { en, zh }
}

function licenseOf(value: unknown): string | null {
  if (!isRecord(value) || !isRecord(value.license)) return null
  const spdx = stringValue(value.license.spdx_id)
  return spdx === null || spdx === 'NOASSERTION' ? null : spdx
}

function isDirectoryRepository(item: JsonRecord): boolean {
  return (stringValue(item.name) ?? '').toLowerCase().startsWith('awesome-')
}

function trustedOverlay(entry: RegistryEntry, trusted: RegistryEntry | undefined): RegistryEntry {
  if (trusted === undefined || !['verified', 'installable', 'blocked'].includes(trusted.status)) return entry
  return RegistryEntrySchema.parse({
    ...entry,
    license: trusted.license,
    source: trusted.source,
    status: trusted.status,
    ...(trusted.evidence === undefined ? {} : { evidence: trusted.evidence }),
  })
}

function priority(status: RegistryEntry['status']): number {
  return { verified: 0, installable: 1, blocked: 2 }[status]
}

export interface ValidatedCatalogSource {
  validation: CatalogValidation
  source: RegistrySource | null
  license: string | null
}

export function installHintKey(hint: RegistryInstallHint): string {
  return hint.kind === 'npm' ? `npm:${hint.packageName}` : `github:${hint.repository}${hint.path ?? ''}`
}

function entryId(key: string, hint: RegistryInstallHint | null, name: unknown, entries: ReadonlyMap<string, RegistryEntry>): string {
  let id = `github:${key}`
  if (hint?.kind === 'github' && hint.path !== null) id += `/path${hint.path.toLowerCase()}`
  if (!entries.has(id)) return id
  const slug = String(name).toLowerCase().replace(/[^a-z0-9._/-]+/g, '-').replace(/^-+|-+$/g, '') || 'plugin'
  let candidate = `${id}/entry/${slug}`
  let suffix = 2
  while (entries.has(candidate)) candidate = `${id}/entry/${slug}-${suffix++}`
  return candidate
}

export function composeLiveSnapshot(
  trustedSnapshot: RegistrySnapshot,
  currentSnapshot: RegistrySnapshot,
  curatedBody: unknown,
  githubBody: unknown | null,
  generatedAt: string,
  validations: ReadonlyMap<string, ValidatedCatalogSource>,
): RegistrySnapshot {
  const trustedById = new Map(trustedSnapshot.entries.map((entry) => [entry.id, entry]))
  const currentById = new Map(currentSnapshot.entries.map((entry) => [entry.id, entry]))
  const githubItems = githubBody !== null && isRecord(githubBody) && Array.isArray(githubBody.items)
    ? githubBody.items.filter(isRecord)
    : null
  const githubByRepo = new Map<string, JsonRecord>()
  for (const item of githubItems ?? []) {
    const identity = stringValue(item.full_name)
    if (identity !== null) githubByRepo.set(identity.toLowerCase(), item)
  }

  const merged = new Map<string, RegistryEntry>()
  const curatedRepos = new Set<string>()
  const curatedPlugins = isRecord(curatedBody) && Array.isArray(curatedBody.plugins)
    ? curatedBody.plugins.filter(isRecord)
    : []

  for (const plugin of curatedPlugins) {
    const identity = repositoryIdentity(plugin.url)
    if (identity === null) continue
    const key = identity.toLowerCase()
    curatedRepos.add(key)
    const installHint = parseInstallHint(plugin.install)
    if (installHint === null) continue
    const id = entryId(key, installHint, plugin.name ?? identity.split('/')[1], merged)
    const validation = validations.get(installHintKey(installHint))
    const trusted = trustedById.get(id)
    const source = validation === undefined ? trusted?.source ?? null : validation.source
    const manifestValidation = validation?.validation ?? trusted?.validation
    if (manifestValidation === undefined) continue
    const githubItem = githubByRepo.get(key)
    const previous = currentById.get(id)
    const category = allowedCategories.has(plugin.category as RegistryEntry['category'])
      ? plugin.category as RegistryEntry['category']
      : 'other'
    const liveEntry: RegistryEntry = {
      id,
      name: (stringValue(plugin.name) ?? identity.split('/')[1]!).slice(0, 120),
      description: description(plugin.description),
      category,
      repositoryUrl: `https://github.com/${identity}`,
      license: validation?.license ?? (githubItem === undefined ? previous?.license ?? null : licenseOf(githubItem)),
      source,
      installHint,
      status: 'installable',
      validation: manifestValidation,
      discovery: {
        sources: githubItem === undefined ? ['awesome-dsh-plugin'] : ['awesome-dsh-plugin', 'github-topic'],
        stars: Number.isInteger(githubItem?.stargazers_count)
          ? githubItem!.stargazers_count as number
          : previous?.discovery?.stars ?? null,
        pushedAt: typeof githubItem?.pushed_at === 'string'
          ? githubItem.pushed_at
          : previous?.discovery?.pushedAt ?? null,
      },
    }
    merged.set(id, trustedOverlay(liveEntry, trusted))
  }

  if (githubItems !== null) {
    for (const item of githubItems) {
      if (isDirectoryRepository(item)) continue
      const identity = stringValue(item.full_name)
      if (identity === null) continue
      const key = identity.toLowerCase()
      const id = `github:${key}`
      if (curatedRepos.has(key)) continue
      const repositoryUrl = stringValue(item.html_url)
      if (repositoryIdentity(repositoryUrl) === null) continue
      const installHint = { kind: 'github', repository: identity, path: null } as const
      const validation = validations.get(installHintKey(installHint))
      const trusted = trustedById.get(id)
      const source = validation === undefined ? trusted?.source ?? null : validation.source
      const manifestValidation = validation?.validation ?? trusted?.validation
      if (manifestValidation === undefined) continue
      const text = (stringValue(item.description) ?? '').slice(0, 4000)
      const liveEntry: RegistryEntry = {
        id,
        name: (stringValue(item.name) ?? identity).slice(0, 120),
        description: { en: text, zh: text },
        category: 'other',
        repositoryUrl: `https://github.com/${identity}`,
        license: validation?.license ?? licenseOf(item),
        source,
        installHint,
        status: 'installable',
        validation: manifestValidation,
        discovery: {
          sources: ['github-topic'],
          stars: Number.isInteger(item.stargazers_count) ? item.stargazers_count as number : null,
          pushedAt: typeof item.pushed_at === 'string' ? item.pushed_at : null,
        },
      }
      merged.set(id, trustedOverlay(liveEntry, trusted))
    }
  } else {
    for (const entry of currentSnapshot.entries) {
      if (entry.discovery?.sources.includes('github-topic') === true && !merged.has(entry.id)) merged.set(entry.id, entry)
    }
  }

  for (const entry of trustedSnapshot.entries) {
    if (['verified', 'blocked'].includes(entry.status) && !merged.has(entry.id)) merged.set(entry.id, entry)
  }

  const entries = [...merged.values()].sort((left, right) => {
    if (left.status !== right.status) return priority(left.status) - priority(right.status)
    return (right.discovery?.stars ?? -1) - (left.discovery?.stars ?? -1) || left.name.localeCompare(right.name)
  })
  return RegistrySnapshotSchema.parse({ schemaVersion: 1, generatedAt, entries })
}

export class RegistryProvider {
  private readonly trustedSnapshot: RegistrySnapshot
  private readonly fetcher: typeof fetch
  private readonly now: () => Date
  private readonly refreshIntervalMs: number
  private readonly githubPages: number
  private readonly githubToken: string | undefined
  private snapshot: RegistrySnapshot
  private refreshPromise: Promise<RegistryRefreshResult> | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  private refreshStatus: RegistryRefreshStatus

  constructor(snapshot: RegistrySnapshot, options: RegistryProviderOptions = {}) {
    this.trustedSnapshot = RegistrySnapshotSchema.parse(snapshot)
    this.snapshot = this.trustedSnapshot
    this.fetcher = options.fetcher ?? fetch
    this.now = options.now ?? (() => new Date())
    this.refreshIntervalMs = options.refreshIntervalMs ?? DEFAULT_REFRESH_INTERVAL_MS
    this.githubPages = Math.max(0, Math.min(10, options.githubPages ?? 10))
    this.githubToken = options.githubToken
    this.refreshStatus = {
      source: 'bundled',
      refreshing: false,
      intervalMs: this.refreshIntervalMs,
      lastAttemptAt: null,
      lastSuccessAt: null,
      nextRefreshAt: null,
      error: null,
      curatedRows: null,
      githubRows: null,
      acceptedRows: null,
      rejectedRows: null,
    }
  }

  current(): RegistrySnapshot {
    return this.snapshot
  }

  status(): RegistryRefreshStatus {
    return { ...this.refreshStatus }
  }

  start(): () => void {
    if (this.timer !== null) return () => this.stop()
    this.scheduleNext()
    void this.refresh()
    this.timer = setInterval(() => { void this.refresh() }, this.refreshIntervalMs)
    this.timer.unref?.()
    return () => this.stop()
  }

  stop(): void {
    if (this.timer !== null) clearInterval(this.timer)
    this.timer = null
    this.refreshStatus = { ...this.refreshStatus, nextRefreshAt: null }
  }

  refresh(): Promise<RegistryRefreshResult> {
    if (this.refreshPromise !== null) return this.refreshPromise
    this.refreshPromise = this.performRefresh().finally(() => { this.refreshPromise = null })
    return this.refreshPromise
  }

  private scheduleNext(): void {
    this.refreshStatus = {
      ...this.refreshStatus,
      nextRefreshAt: new Date(this.now().getTime() + this.refreshIntervalMs).toISOString(),
    }
  }

  private async fetchJson(url: string, headers: Record<string, string>): Promise<unknown> {
    const response = await this.fetcher(url, { headers, signal: AbortSignal.timeout(15_000) })
    if (!response.ok) throw new Error(`${new URL(url).hostname} returned HTTP ${response.status}`)
    return response.json()
  }

  private async githubTopic(): Promise<unknown> {
    if (this.githubPages === 0) return null
    const items: unknown[] = []
    const headers = {
      accept: 'application/vnd.github+json',
      'user-agent': 'dsh-plugin-market-runtime',
      ...(this.githubToken === undefined ? {} : { authorization: `Bearer ${this.githubToken}` }),
    }
    for (let page = 1; page <= this.githubPages; page += 1) {
      const url = new URL(GITHUB_SEARCH_URL)
      url.searchParams.set('q', 'topic:dsh-plugin')
      url.searchParams.set('sort', 'updated')
      url.searchParams.set('order', 'desc')
      url.searchParams.set('per_page', '100')
      url.searchParams.set('page', String(page))
      const body = await this.fetchJson(url.href, headers)
      const rows = isRecord(body) && Array.isArray(body.items) ? body.items : []
      items.push(...rows)
      if (rows.length < 100) break
    }
    return { items }
  }

  private async validateSources(curatedBody: unknown, githubBody: unknown | null): Promise<{
    validations: Map<string, ValidatedCatalogSource>
    totalLocators: number
  }> {
    const hints = new Map<string, RegistryInstallHint>()
    if (isRecord(curatedBody) && Array.isArray(curatedBody.plugins)) {
      for (const plugin of curatedBody.plugins.filter(isRecord)) {
        const hint = parseInstallHint(plugin.install)
        if (hint !== null) hints.set(installHintKey(hint), hint)
      }
    }
    if (githubBody !== null && isRecord(githubBody) && Array.isArray(githubBody.items)) {
      for (const item of githubBody.items.filter(isRecord)) {
        if (isDirectoryRepository(item)) continue
        const identity = stringValue(item.full_name)
        if (identity === null || repositoryIdentity(item.html_url) === null) continue
        const hint = { kind: 'github', repository: identity, path: null } as const
        hints.set(installHintKey(hint), hint)
      }
    }

    const validator = new CatalogManifestValidator({ fetcher: this.fetcher, now: this.now })
    const queue = [...hints.entries()]
    const validations = new Map<string, ValidatedCatalogSource>()
    let cursor = 0
    const worker = async (): Promise<void> => {
      while (cursor < queue.length) {
        const index = cursor++
        const row = queue[index]
        if (row === undefined) return
        const [key, hint] = row
        try {
          validations.set(key, await validator.validate(hint))
        } catch {
          // Discovery is intentionally fail-closed: an unproved locator is not catalog data.
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(12, queue.length) }, worker))
    return { validations, totalLocators: hints.size }
  }

  private async performRefresh(): Promise<RegistryRefreshResult> {
    const attemptAt = this.now().toISOString()
    this.refreshStatus = { ...this.refreshStatus, refreshing: true, lastAttemptAt: attemptAt, error: null }
    let githubBody: unknown | null = null
    let githubError: string | null = null
    try {
      const [curatedBody, githubResult] = await Promise.all([
        this.fetchJson(CURATED_URL, { 'user-agent': 'dsh-plugin-market-runtime' }),
        this.githubTopic().then(
          (value) => ({ value, error: null }),
          (error: unknown) => ({ value: null, error: String(error) }),
        ),
      ])
      if (!isRecord(curatedBody) || !Array.isArray(curatedBody.plugins) || curatedBody.plugins.length === 0) {
        throw new Error('awesome-dsh-plugin returned an invalid or empty catalog')
      }
      githubBody = githubResult.value
      githubError = githubResult.error
      const { validations, totalLocators } = await this.validateSources(curatedBody, githubBody)
      const generatedAt = this.now().toISOString()
      const next = composeLiveSnapshot(this.trustedSnapshot, this.snapshot, curatedBody, githubBody, generatedAt, validations)
      this.snapshot = next
      const curatedRows = isRecord(curatedBody) && Array.isArray(curatedBody.plugins) ? curatedBody.plugins.length : 0
      const githubRows = githubBody !== null && isRecord(githubBody) && Array.isArray(githubBody.items) ? githubBody.items.length : null
      this.refreshStatus = {
        ...this.refreshStatus,
        source: 'live',
        refreshing: false,
        lastSuccessAt: generatedAt,
        error: githubError === null ? null : `GitHub topic refresh failed; kept cached rows: ${githubError}`,
        curatedRows,
        githubRows,
        acceptedRows: next.entries.filter((entry) => entry.status !== 'blocked').length,
        rejectedRows: totalLocators - validations.size,
      }
      this.scheduleNext()
      return { updated: true, status: this.status() }
    } catch (error) {
      this.refreshStatus = { ...this.refreshStatus, refreshing: false, error: String(error) }
      this.scheduleNext()
      return { updated: false, status: this.status() }
    }
  }
}
