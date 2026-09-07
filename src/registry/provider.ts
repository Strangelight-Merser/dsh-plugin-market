import { resolvePluginCategory } from '../core/category.ts'
import { RegistrySnapshotSchema, type RegistryEntry, type RegistrySnapshot } from '../core/registry.ts'

export const PUBLISHED_REGISTRY_URL = 'https://raw.githubusercontent.com/Strangelight-Merser/dsh-plugin-market/main/data/registry-v1.json'
export const DEFAULT_REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000

export interface RegistryRefreshStatus {
  source: 'bundled' | 'live'
  refreshing: boolean
  intervalMs: number
  lastAttemptAt: string | null
  lastSuccessAt: string | null
  nextRefreshAt: string | null
  error: string | null
  entryCount: number
}

export interface RegistryRefreshResult {
  updated: boolean
  status: RegistryRefreshStatus
}

export interface RegistryProviderOptions {
  fetcher?: typeof fetch
  now?: () => Date
  refreshIntervalMs?: number
  registryUrl?: string
}

function withFunctionalCategory(entry: RegistryEntry): RegistryEntry {
  return {
    ...entry,
    category: resolvePluginCategory(entry.category, {
      name: entry.name,
      description: `${entry.description.zh} ${entry.description.en}`,
    }),
  }
}

function normalizedSnapshot(value: unknown): RegistrySnapshot {
  const snapshot = RegistrySnapshotSchema.parse(value)
  if (snapshot.entries.length === 0) throw new Error('published registry is empty')
  return RegistrySnapshotSchema.parse({
    ...snapshot,
    entries: snapshot.entries.map(withFunctionalCategory),
  })
}

export class RegistryProvider {
  private readonly fetcher: typeof fetch
  private readonly now: () => Date
  private readonly refreshIntervalMs: number
  private readonly registryUrl: string
  private snapshot: RegistrySnapshot
  private refreshPromise: Promise<RegistryRefreshResult> | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private running = false
  private refreshStatus: RegistryRefreshStatus

  constructor(snapshot: RegistrySnapshot, options: RegistryProviderOptions = {}) {
    this.snapshot = normalizedSnapshot(snapshot)
    this.fetcher = options.fetcher ?? fetch
    this.now = options.now ?? (() => new Date())
    this.refreshIntervalMs = options.refreshIntervalMs ?? DEFAULT_REFRESH_INTERVAL_MS
    this.registryUrl = options.registryUrl ?? PUBLISHED_REGISTRY_URL
    this.refreshStatus = {
      source: 'bundled',
      refreshing: false,
      intervalMs: this.refreshIntervalMs,
      lastAttemptAt: null,
      lastSuccessAt: null,
      nextRefreshAt: null,
      error: null,
      entryCount: this.snapshot.entries.length,
    }
  }

  current(): RegistrySnapshot {
    return this.snapshot
  }

  status(): RegistryRefreshStatus {
    return { ...this.refreshStatus }
  }

  start(): () => void {
    if (this.running) return () => this.stop()
    this.running = true
    void this.refresh()
    return () => this.stop()
  }

  stop(): void {
    this.running = false
    if (this.timer !== null) clearTimeout(this.timer)
    this.timer = null
    this.refreshStatus = { ...this.refreshStatus, nextRefreshAt: null }
  }

  refresh(): Promise<RegistryRefreshResult> {
    if (this.refreshPromise !== null) return this.refreshPromise
    this.refreshPromise = this.performRefresh().finally(() => { this.refreshPromise = null })
    return this.refreshPromise
  }

  private scheduleNext(): void {
    if (!this.running) return
    if (this.timer !== null) clearTimeout(this.timer)
    this.refreshStatus = {
      ...this.refreshStatus,
      nextRefreshAt: new Date(this.now().getTime() + this.refreshIntervalMs).toISOString(),
    }
    this.timer = setTimeout(() => { void this.refresh() }, this.refreshIntervalMs)
    this.timer.unref?.()
  }

  private async performRefresh(): Promise<RegistryRefreshResult> {
    const attemptedAt = this.now().toISOString()
    this.refreshStatus = { ...this.refreshStatus, refreshing: true, lastAttemptAt: attemptedAt, error: null }
    try {
      const response = await this.fetcher(this.registryUrl, {
        headers: { accept: 'application/json', 'user-agent': 'dsh-plugin-market' },
        signal: AbortSignal.timeout(15_000),
      })
      if (!response.ok) throw new Error(`${new URL(this.registryUrl).hostname} returned HTTP ${response.status}`)
      const next = normalizedSnapshot(await response.json())
      if (Date.parse(next.generatedAt) < Date.parse(this.snapshot.generatedAt)) throw new Error('published registry is older than the current snapshot')
      this.snapshot = next
      this.refreshStatus = {
        ...this.refreshStatus,
        source: 'live',
        refreshing: false,
        lastSuccessAt: attemptedAt,
        error: null,
        entryCount: this.snapshot.entries.length,
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
