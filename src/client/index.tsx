import * as React from 'react'
import { sortCatalog, type CatalogSort } from './catalog-sort.ts'

const API_PREFIX = '/api/dsh-market/v1'
const PAGE_SIZE = 30

interface SlotsService {
  inject(name: string, register: () => () => void): () => void
  register(options: Record<string, unknown>, component: React.ComponentType): () => void
}

interface ClientContext {
  slots: SlotsService
}

type CatalogStatus = 'installable' | 'verified' | 'blocked'
type PluginState = 'active' | 'inactive' | 'unmanaged' | 'absent' | 'drifted'
type Action = 'install' | 'enable' | 'disable' | 'uninstall'

interface CatalogEntry {
  id: string
  name: string
  description: { en: string; zh: string }
  category: string
  repositoryUrl: string
  license: string | null
  status: CatalogStatus
  installBlockReason: string | null
  source: { packageName: string } | null
  installHint: { kind: 'npm'; packageName: string } | { kind: 'github'; repository: string; path: string | null } | null
  discovery?: { stars: number | null; pushedAt: string | null }
  assessment: {
    score: number
    tier: 'strong' | 'promising' | 'listed' | 'excluded'
    reasons: string[]
    cautions: string[]
  }
  recommendation: {
    summary: string
    bestFor: string
    caution: string
  } | null
}

interface InstalledPlugin {
  packageName: string
  managed: boolean
  id: string | null
  state: PluginState
}

interface RefreshStatus {
  source: 'bundled' | 'live'
  refreshing: boolean
  lastSuccessAt: string | null
  error: string | null
}

interface CatalogResponse {
  entries: CatalogEntry[]
  refresh: RefreshStatus
  evaluation: { recommendationIds: string[] }
}

interface LifecyclePreview {
  id: string
  packageName: string
  repositoryUrl: string
  resolvedRef: string
  license: string | null
  verified: boolean
}

interface LifecycleResponse {
  action: Action
  id: string
  packageName: string
  state: PluginState
  resolvedRef: string
  runtimeEffect: 'restart-required'
}

const styles = `
  .dpm { --dpm-accent:#766cf6; --dpm-good:#35b77a; --dpm-warn:#d59b35; box-sizing:border-box; color:inherit; container-type:inline-size; min-height:360px; padding:20px 22px 30px; width:100%; }
  .dpm *, .dpm *::before, .dpm *::after { box-sizing:border-box; }
  .dpm-header { align-items:center; display:flex; gap:16px; justify-content:space-between; margin-bottom:18px; }
  .dpm-title { font-size:21px; letter-spacing:-.02em; line-height:1.2; margin:0; }
  .dpm-summary { font-size:11px; margin:5px 0 0; opacity:.55; }
  .dpm-button { align-items:center; background:transparent; border:1px solid color-mix(in srgb,currentColor 16%,transparent); border-radius:8px; color:inherit; cursor:pointer; display:inline-flex; font:inherit; font-size:12px; font-weight:650; gap:5px; justify-content:center; min-height:32px; padding:6px 10px; transition:background .15s,border-color .15s,transform .15s; }
  .dpm-button:hover:not(:disabled) { background:color-mix(in srgb,currentColor 8%,transparent); border-color:color-mix(in srgb,currentColor 28%,transparent); }
  .dpm-button:active:not(:disabled) { transform:translateY(1px); }
  .dpm-button:disabled { cursor:not-allowed; opacity:.38; }
  .dpm-button-primary { background:var(--dpm-accent); border-color:var(--dpm-accent); color:#fff; }
  .dpm-button-primary:hover:not(:disabled) { background:#685ee9; border-color:#685ee9; }
  .dpm-button-quiet { border-color:transparent; opacity:.68; }
  .dpm-button-danger { border-color:transparent; color:#e3777d; }
  .dpm-icon-button { border-color:transparent; border-radius:50%; font-size:17px; height:34px; padding:0; width:34px; }
  .dpm-tabs { border-bottom:1px solid color-mix(in srgb,currentColor 11%,transparent); display:flex; gap:20px; margin-bottom:14px; }
  .dpm-tab { background:none; border:0; color:inherit; cursor:pointer; font:inherit; font-size:13px; opacity:.5; padding:0 1px 10px; position:relative; }
  .dpm-tab[aria-selected='true'] { font-weight:700; opacity:1; }
  .dpm-tab[aria-selected='true']::after { background:var(--dpm-accent); border-radius:2px; bottom:-1px; content:''; height:2px; left:0; position:absolute; right:0; }
  .dpm-filters { display:flex; gap:8px; margin-bottom:12px; }
  .dpm-input, .dpm-select { background:color-mix(in srgb,currentColor 3%,transparent); border:1px solid color-mix(in srgb,currentColor 15%,transparent); border-radius:8px; color:inherit; font:inherit; font-size:12px; min-height:36px; outline:none; padding:7px 10px; }
  .dpm-input { flex:1 1 0; min-width:0; width:0; }
  .dpm-select { flex:0 0 88px; max-width:88px; }
  .dpm-input:focus, .dpm-select:focus { border-color:var(--dpm-accent); box-shadow:0 0 0 2px color-mix(in srgb,var(--dpm-accent) 16%,transparent); }
  .dpm-alert { align-items:flex-start; border-radius:8px; display:flex; font-size:11px; justify-content:space-between; line-height:1.45; margin:0 0 12px; padding:9px 10px; }
  .dpm-alert-error { background:color-mix(in srgb,#e35f68 11%,transparent); color:#eb858b; }
  .dpm-alert-good { background:color-mix(in srgb,var(--dpm-good) 10%,transparent); }
  .dpm-alert button { background:none; border:0; color:inherit; cursor:pointer; opacity:.55; }
  .dpm-list { border-top:1px solid color-mix(in srgb,currentColor 10%,transparent); }
  .dpm-card { align-items:start; border-bottom:1px solid color-mix(in srgb,currentColor 10%,transparent); display:grid; gap:14px; grid-template-columns:minmax(0,1fr) auto; min-width:0; padding:16px 2px; }
  .dpm-card-main { min-width:0; }
  .dpm-card-head { align-items:center; display:flex; gap:7px; min-width:0; }
  .dpm-card-title { font-size:13px; font-weight:720; line-height:1.35; margin:0; overflow-wrap:anywhere; }
  .dpm-badge { background:color-mix(in srgb,currentColor 7%,transparent); border-radius:99px; flex:0 0 auto; font-size:9px; line-height:1; opacity:.65; padding:4px 6px; }
  .dpm-badge-good { background:color-mix(in srgb,var(--dpm-good) 14%,transparent); color:var(--dpm-good); opacity:1; }
  .dpm-badge-warn { background:color-mix(in srgb,var(--dpm-warn) 14%,transparent); color:var(--dpm-warn); opacity:1; }
  .dpm-description { font-size:11px; line-height:1.6; margin:6px 0 8px; opacity:.66; overflow-wrap:anywhere; white-space:pre-wrap; }
  .dpm-recommendation { background:color-mix(in srgb,var(--dpm-accent) 8%,transparent); border-left:2px solid var(--dpm-accent); border-radius:0 7px 7px 0; font-size:10px; line-height:1.55; margin:8px 0; padding:7px 9px; }
  .dpm-recommendation strong { display:block; font-size:10px; margin-bottom:2px; }
  .dpm-recommendation span { opacity:.62; }
  .dpm-meta { align-items:center; display:flex; flex-wrap:wrap; font-size:10px; gap:8px; opacity:.46; }
  .dpm-source { color:inherit; text-decoration:none; }
  .dpm-source:hover { opacity:1; text-decoration:underline; }
  .dpm-assessment { font-size:10px; margin-top:8px; opacity:.52; }
  .dpm-assessment summary { cursor:pointer; list-style:none; width:max-content; }
  .dpm-assessment summary::-webkit-details-marker { display:none; }
  .dpm-assessment p { line-height:1.55; margin:6px 0 0; max-width:700px; }
  .dpm-actions { align-items:center; display:flex; flex:0 0 auto; gap:3px; }
  .dpm-empty { font-size:12px; opacity:.5; padding:42px 12px; text-align:center; }
  .dpm-more { display:flex; justify-content:center; padding-top:14px; }
  .dpm-dialog-backdrop { align-items:center; background:rgba(0,0,0,.56); display:flex; inset:0; justify-content:center; padding:20px; position:fixed; z-index:10000; }
  .dpm-dialog { background:#252525; border:1px solid rgba(255,255,255,.12); border-radius:14px; box-shadow:0 18px 55px rgba(0,0,0,.45); color:#f5f5f5; max-width:440px; padding:18px; width:100%; }
  .dpm-dialog-head { align-items:flex-start; display:flex; gap:12px; justify-content:space-between; }
  .dpm-dialog h3 { font-size:17px; margin:0; }
  .dpm-dialog-subtitle { color:rgba(255,255,255,.58); font-size:11px; line-height:1.45; margin:6px 0 15px; }
  .dpm-dialog-close { background:none; border:0; color:inherit; cursor:pointer; font-size:20px; opacity:.55; padding:0; }
  .dpm-details { background:rgba(255,255,255,.045); border-radius:9px; display:grid; gap:9px; margin:0; padding:11px; }
  .dpm-detail { display:grid; gap:8px; grid-template-columns:56px minmax(0,1fr); }
  .dpm-detail dt { color:rgba(255,255,255,.45); font-size:10px; }
  .dpm-detail dd { font-size:11px; margin:0; min-width:0; overflow-wrap:anywhere; }
  .dpm-detail code { color:#c9c5ff; font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:10px; }
  .dpm-risk { background:color-mix(in srgb,var(--dpm-warn) 12%,transparent); border-radius:9px; color:rgba(255,255,255,.72); font-size:11px; line-height:1.5; margin-top:11px; padding:10px 11px; }
  .dpm-risk strong { color:#f0c56e; display:block; margin-bottom:2px; }
  .dpm-dialog-actions { display:flex; gap:8px; justify-content:flex-end; margin-top:15px; }
  @container (max-width:360px) { .dpm { padding:17px 16px 26px; } .dpm-card { align-items:start; grid-template-columns:1fr; } .dpm-actions { justify-content:flex-end; } }
`

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, headers: { accept: 'application/json', ...init?.headers } })
  const body = await response.json() as T & { error?: string }
  if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`)
  return body
}

function formatTime(value: string | null): string {
  if (value === null) return '内置目录'
  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    .format(new Date(value))
}

function stateLabel(state: PluginState): string {
  return { active: '已启用', inactive: '已停用', unmanaged: '已存在', absent: '未安装', drifted: '状态异常' }[state]
}

function trustLabel(status: CatalogStatus): string {
  if (status === 'verified') return '已验证'
  if (status === 'blocked') return '不可用'
  return '清单已检查'
}

function actionLabel(action: Action): string {
  return { install: '安装', enable: '启用', disable: '停用', uninstall: '卸载' }[action]
}

function sourceLabel(entry: CatalogEntry): string {
  if (entry.installHint?.kind === 'npm') return 'npm'
  if (entry.installHint?.kind === 'github') return 'GitHub'
  return entry.source?.packageName === undefined ? '未知来源' : '已锁定'
}

function MarketSection(): React.ReactElement {
  const [catalogResponse, setCatalogResponse] = React.useState<CatalogResponse | null>(null)
  const [installed, setInstalled] = React.useState<InstalledPlugin[]>([])
  const [error, setError] = React.useState<string | null>(null)
  const [notice, setNotice] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState<string | null>(null)
  const [previewing, setPreviewing] = React.useState<string | null>(null)
  const [registryBusy, setRegistryBusy] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const [sortOrder, setSortOrder] = React.useState<CatalogSort>('stars')
  const [view, setView] = React.useState<'recommended' | 'market' | 'installed'>('recommended')
  const [limit, setLimit] = React.useState(PAGE_SIZE)
  const [pendingRestart, setPendingRestart] = React.useState<Set<string>>(() => new Set())
  const [unavailable, setUnavailable] = React.useState<Set<string>>(() => new Set())
  const [confirmation, setConfirmation] = React.useState<{ entry: CatalogEntry; preview: LifecyclePreview } | null>(null)

  const reloadAll = React.useCallback(async (): Promise<void> => {
    const [nextCatalog, nextInstalled] = await Promise.all([
      requestJson<CatalogResponse>(`${API_PREFIX}/catalog`),
      requestJson<{ plugins: InstalledPlugin[] }>(`${API_PREFIX}/installed`),
    ])
    setCatalogResponse(nextCatalog)
    setInstalled(nextInstalled.plugins)
  }, [])

  React.useEffect(() => {
    reloadAll().catch((cause: unknown) => setError(String(cause)))
    const timer = window.setInterval(() => { reloadAll().catch((cause: unknown) => setError(String(cause))) }, 5 * 60 * 1000)
    return () => window.clearInterval(timer)
  }, [reloadAll])

  React.useEffect(() => {
    if (catalogResponse?.refresh.refreshing !== true) return undefined
    const timer = window.setTimeout(() => { reloadAll().catch((cause: unknown) => setError(String(cause))) }, 2_000)
    return () => window.clearTimeout(timer)
  }, [catalogResponse?.refresh.refreshing, reloadAll])

  React.useEffect(() => { setLimit(PAGE_SIZE) }, [query, sortOrder, view])
  React.useEffect(() => {
    if (confirmation === null) return undefined
    const close = (event: KeyboardEvent): void => { if (event.key === 'Escape' && busy === null) setConfirmation(null) }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [busy, confirmation])

  const refreshRegistry = async (): Promise<void> => {
    setRegistryBusy(true)
    setError(null)
    try {
      await requestJson(`${API_PREFIX}/registry/refresh`, { method: 'POST' })
      await reloadAll()
      setNotice('目录已更新')
    } catch (cause) {
      setError(`更新失败，正在使用缓存目录。${String(cause)}`)
      await reloadAll().catch(() => undefined)
    } finally {
      setRegistryBusy(false)
    }
  }

  const run = async (action: Action, id: string, expectedRef?: string): Promise<boolean> => {
    setBusy(`${id}:${action}`)
    setError(null)
    setNotice(null)
    try {
      const body = action === 'install' ? { action, id, expectedRef } : { action, id }
      const result = await requestJson<LifecycleResponse>(`${API_PREFIX}/actions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      setPendingRestart((current) => new Set(current).add(id))
      await reloadAll()
      setNotice(action === 'install'
        ? `${result.packageName} 已安装并启用，重启 DSH 后生效`
        : `${result.packageName} 已${action === 'enable' ? '启用' : action === 'disable' ? '停用' : '卸载'}，重启 DSH 后生效`)
      return true
    } catch (cause) {
      setError(String(cause))
      return false
    } finally {
      setBusy(null)
    }
  }

  const beginInstall = async (entry: CatalogEntry): Promise<void> => {
    setPreviewing(entry.id)
    setError(null)
    try {
      const preview = await requestJson<LifecyclePreview>(`${API_PREFIX}/preview`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: entry.id }),
      })
      setConfirmation({ entry, preview })
    } catch (cause) {
      setUnavailable((current) => new Set(current).add(entry.id))
      setError(`${entry.name} 暂时无法安装：${String(cause)}`)
    } finally {
      setPreviewing(null)
    }
  }

  const catalog = catalogResponse?.entries ?? []
  const installedByPackage = new Map(installed.map((plugin) => [plugin.packageName, plugin]))
  const installedById = new Map(installed.filter((plugin) => plugin.id !== null).map((plugin) => [plugin.id!, plugin]))
  const catalogById = new Map(catalog.map((entry) => [entry.id, entry]))
  const managedInstalled = installed.filter((plugin) => plugin.managed)
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const recommendationIds = new Set(catalogResponse?.evaluation.recommendationIds ?? [])
  const catalogForView = view === 'recommended' ? catalog.filter((entry) => recommendationIds.has(entry.id)) : catalog
  const filteredCatalog = catalogForView.filter((entry) => normalizedQuery.length === 0 || [
    entry.name, entry.category, entry.description.zh, entry.description.en,
  ].some((value) => value.toLocaleLowerCase().includes(normalizedQuery)))
  const visibleCatalog = sortCatalog(filteredCatalog, sortOrder).slice(0, limit)

  const renderActions = (entry: CatalogEntry, state: PluginState, managed: boolean): React.ReactNode => {
    if (entry.installBlockReason !== null || unavailable.has(entry.id)) {
      return <button className="dpm-button" disabled type="button">不可安装</button>
    }
    if (state === 'absent') return <button
      className="dpm-button dpm-button-primary"
      disabled={busy !== null || previewing !== null}
      onClick={() => { void beginInstall(entry) }}
      type="button"
    >{previewing === entry.id ? '检查中…' : '安装'}</button>
    if (!managed) return null
    const primary: Action | null = state === 'active' ? 'disable' : state === 'inactive' ? 'enable' : null
    return <div className="dpm-actions">
      {primary === null ? null : <button
        className={primary === 'enable' ? 'dpm-button dpm-button-primary' : 'dpm-button'}
        disabled={busy !== null}
        onClick={() => { void run(primary, entry.id) }}
        type="button"
      >{busy === `${entry.id}:${primary}` ? '处理中…' : actionLabel(primary)}</button>}
      <button
        className="dpm-button dpm-button-danger"
        disabled={busy !== null}
        onClick={() => { if (window.confirm(`卸载 ${entry.name}？`)) void run('uninstall', entry.id) }}
        type="button"
      >卸载</button>
    </div>
  }

  const lastSync = catalogResponse?.refresh.source === 'live' ? '自动更新' : '内置目录'
  const refreshTitle = catalogResponse?.refresh.source === 'live'
    ? `更新插件目录，上次同步于 ${formatTime(catalogResponse.refresh.lastSuccessAt)}`
    : '更新插件目录'

  return <section className="dpm" data-testid="dsh-plugin-market">
    <style>{styles}</style>
    <header className="dpm-header">
      <div>
        <h2 className="dpm-title">插件市场</h2>
        <p className="dpm-summary">{catalogResponse === null ? '正在加载…' : `${catalog.length} 个已确认 DSH 插件 · ${lastSync}`}</p>
      </div>
      <button aria-label="更新插件目录" className="dpm-button dpm-icon-button" disabled={registryBusy} onClick={() => { void refreshRegistry() }} title={refreshTitle} type="button">
        {registryBusy ? '…' : '↻'}
      </button>
    </header>

    {error === null ? null : <p className="dpm-alert dpm-alert-error" role="alert"><span>{error}</span><button aria-label="关闭" onClick={() => setError(null)} type="button">×</button></p>}
    {notice === null ? null : <p className="dpm-alert dpm-alert-good" role="status"><span>{notice}</span><button aria-label="关闭" onClick={() => setNotice(null)} type="button">×</button></p>}
    {catalogResponse?.refresh.error === null || catalogResponse?.refresh.error === undefined ? null
      : <p className="dpm-alert dpm-alert-error" role="status"><span>在线目录不可用，已保留缓存</span></p>}

    <div className="dpm-tabs" role="tablist">
      <button aria-selected={view === 'recommended'} className="dpm-tab" onClick={() => setView('recommended')} role="tab" type="button">推荐</button>
      <button aria-selected={view === 'market'} className="dpm-tab" onClick={() => setView('market')} role="tab" type="button">发现</button>
      <button aria-selected={view === 'installed'} className="dpm-tab" onClick={() => setView('installed')} role="tab" type="button">已安装 {managedInstalled.length > 0 ? `(${managedInstalled.length})` : ''}</button>
    </div>

    {view !== 'installed' ? <>
      <div className="dpm-filters">
        <input aria-label="搜索插件" className="dpm-input" onChange={(event) => setQuery(event.target.value)} placeholder="搜索插件" type="search" value={query} />
        <select aria-label="排序方式" className="dpm-select" onChange={(event) => setSortOrder(event.target.value as CatalogSort)} value={sortOrder}>
          <option value="stars">星标</option>
          <option value="recent">最近更新</option>
        </select>
      </div>
      {visibleCatalog.length === 0 ? <div className="dpm-empty">{catalogResponse === null ? '正在加载…' : '没有找到插件'}</div> : <div className="dpm-list">
        {visibleCatalog.map((entry) => {
          const knownPackageName = entry.source?.packageName ?? (entry.installHint?.kind === 'npm' ? entry.installHint.packageName : undefined)
          const current = installedById.get(entry.id) ?? (knownPackageName === undefined ? undefined : installedByPackage.get(knownPackageName))
          const state: PluginState = current?.state ?? 'absent'
          return <article className="dpm-card" key={entry.id}>
            <div className="dpm-card-main">
              <div className="dpm-card-head">
                <h3 className="dpm-card-title">{entry.name}</h3>
                <span className={`dpm-badge ${entry.status === 'verified' ? 'dpm-badge-good' : entry.status === 'blocked' ? 'dpm-badge-warn' : ''}`}>{trustLabel(entry.status)}</span>
                {entry.recommendation === null ? null : <span className="dpm-badge dpm-badge-good">推荐</span>}
                {state === 'absent' ? null : <span className={`dpm-badge ${state === 'active' ? 'dpm-badge-good' : state === 'drifted' ? 'dpm-badge-warn' : ''}`}>{stateLabel(state)}</span>}
                {pendingRestart.has(entry.id) ? <span className="dpm-badge dpm-badge-warn">待重启</span> : null}
              </div>
              <p className="dpm-description">{entry.description.zh || entry.description.en || '暂无描述'}</p>
              {entry.recommendation === null ? null : <div className="dpm-recommendation">
                <strong>{entry.recommendation.summary}</strong>
                <span>适合：{entry.recommendation.bestFor} · 注意：{entry.recommendation.caution}</span>
              </div>}
              <div className="dpm-meta">
                {entry.discovery?.stars === null || entry.discovery?.stars === undefined ? null : <span>★ {entry.discovery.stars}</span>}
                {entry.discovery?.pushedAt === null || entry.discovery?.pushedAt === undefined ? null : <span>{formatTime(entry.discovery.pushedAt)}</span>}
                <span>{sourceLabel(entry)}</span>
                {entry.license === null ? null : <span>{entry.license}</span>}
                <a className="dpm-source" href={entry.repositoryUrl} rel="noopener noreferrer" target="_blank">源码 ↗</a>
              </div>
              <details className="dpm-assessment">
                <summary>基础评估 {entry.assessment.score}/100</summary>
                <p>{entry.assessment.reasons.join(' · ') || '暂无正向证据'}{entry.assessment.cautions.length === 0 ? '' : `；注意：${entry.assessment.cautions.join(' · ')}`}</p>
              </details>
            </div>
            <div className="dpm-actions">{renderActions(entry, state, current?.managed ?? false)}</div>
          </article>
        })}
      </div>}
      {visibleCatalog.length >= filteredCatalog.length ? null : <div className="dpm-more"><button className="dpm-button" onClick={() => setLimit((value) => value + PAGE_SIZE)} type="button">加载更多</button></div>}
    </> : <>
      {managedInstalled.length === 0 ? <div className="dpm-empty">还没有通过市场安装插件</div> : <div className="dpm-list">
        {managedInstalled.map((plugin) => {
          const entry = plugin.id === null ? undefined : catalogById.get(plugin.id)
          if (entry === undefined) return null
          return <article className="dpm-card" key={plugin.packageName}>
            <div className="dpm-card-main">
              <div className="dpm-card-head">
                <h3 className="dpm-card-title">{entry.name}</h3>
                <span className={`dpm-badge ${plugin.state === 'active' ? 'dpm-badge-good' : plugin.state === 'drifted' ? 'dpm-badge-warn' : ''}`}>{stateLabel(plugin.state)}</span>
                {plugin.id !== null && pendingRestart.has(plugin.id) ? <span className="dpm-badge dpm-badge-warn">待重启</span> : null}
              </div>
              <p className="dpm-description">{entry.description.zh || entry.description.en || '暂无描述'}</p>
              <div className="dpm-meta"><span>{plugin.packageName}</span><a className="dpm-source" href={entry.repositoryUrl} rel="noopener noreferrer" target="_blank">源码 ↗</a></div>
            </div>
            <div className="dpm-actions">{renderActions(entry, plugin.state, true)}</div>
          </article>
        })}
      </div>}
    </>}

    {confirmation === null ? null : <div className="dpm-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && busy === null) setConfirmation(null) }}>
      <div aria-labelledby="dpm-confirm-title" aria-modal="true" className="dpm-dialog" role="dialog">
        <div className="dpm-dialog-head">
          <div><h3 id="dpm-confirm-title">安装 {confirmation.entry.name}</h3><p className="dpm-dialog-subtitle">确认来源后将安装并默认启用，重启 DSH 后生效。</p></div>
          <button aria-label="关闭" className="dpm-dialog-close" disabled={busy !== null} onClick={() => setConfirmation(null)} type="button">×</button>
        </div>
        <dl className="dpm-details">
          <div className="dpm-detail"><dt>包名</dt><dd>{confirmation.preview.packageName}</dd></div>
          <div className="dpm-detail"><dt>精确来源</dt><dd><code>{confirmation.preview.resolvedRef}</code></dd></div>
          <div className="dpm-detail"><dt>许可证</dt><dd>{confirmation.preview.license ?? '未声明'}</dd></div>
          <div className="dpm-detail"><dt>信任</dt><dd>{confirmation.preview.verified ? '已验证' : '社区收录，未经安全审查'}</dd></div>
        </dl>
        <div className="dpm-risk"><strong>第三方代码</strong>插件会以你的用户权限运行，可能读取本机文件、凭证并访问网络。请仅安装你信任的来源。</div>
        <div className="dpm-dialog-actions">
          <button className="dpm-button dpm-button-quiet" disabled={busy !== null} onClick={() => setConfirmation(null)} type="button">取消</button>
          <button autoFocus className="dpm-button dpm-button-primary" disabled={busy !== null} onClick={() => {
            void run('install', confirmation.entry.id, confirmation.preview.resolvedRef).then((success) => { if (success) setConfirmation(null) })
          }} type="button">{busy === `${confirmation.entry.id}:install` ? '安装中…' : '安装并启用'}</button>
        </div>
      </div>
    </div>}
  </section>
}

export const name = 'dsh-plugin-market/client'
export const inject = ['slots']

export function apply(ctx: ClientContext): void {
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'plugin-market',
    order: 80,
    label: '插件市场',
  }, MarketSection))
}
