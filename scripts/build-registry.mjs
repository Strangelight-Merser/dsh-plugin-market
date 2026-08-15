import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const CURATED_URL = 'https://awesome-dsh-plugin.com/plugins.json'
const GITHUB_SEARCH_URL = 'https://api.github.com/search/repositories'
const OUTPUT = resolve('data/registry-v1.json')
const VERIFIED_OVERRIDES = resolve('data/verified-overrides.json')
const GITHUB_PAGES = Math.max(0, Number.parseInt(process.env.DSH_GITHUB_PAGES ?? '1', 10))
const allowedCategories = new Set(['ui', 'theme', 'session', 'memory', 'tools', 'skill', 'workflow', 'notify', 'model', 'dev', 'fun', 'other'])
const packageNamePattern = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/
const repositoryPattern = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/
const repositoryPathPattern = /^\/(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+$/

async function fetchJson(url, options = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(15_000) })
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`)
  return response.json()
}

function repositoryIdentity(url) {
  const parsed = new URL(url)
  if (parsed.hostname !== 'github.com') return null
  const parts = parsed.pathname.split('/').filter(Boolean)
  if (parts.length < 2) return null
  return `${parts[0]}/${parts[1].replace(/\.git$/, '')}`
}

function description(value) {
  const en = typeof value?.en === 'string' ? value.en.slice(0, 500) : ''
  const zh = typeof value?.zh === 'string' ? value.zh.slice(0, 500) : en
  return { en, zh }
}

function licenseOf(item) {
  const spdx = item?.license?.spdx_id
  return typeof spdx === 'string' && spdx !== 'NOASSERTION' ? spdx : null
}

function isDirectoryRepository(item) {
  return String(item?.name ?? '').toLowerCase().startsWith('awesome-')
}

function installHintOf(value) {
  if (typeof value !== 'string') return null
  const prefix = 'dsh plugin --profile web add '
  if (!value.startsWith(prefix)) return null
  const locator = value.slice(prefix.length)
  if (locator.startsWith('github:')) {
    const [repository, fragment] = locator.slice('github:'.length).split('#')
    if (!repositoryPattern.test(repository)) return null
    if (fragment === undefined) return { kind: 'github', repository, path: null }
    if (!fragment.startsWith('path:') || !repositoryPathPattern.test(fragment.slice('path:'.length))) return null
    return { kind: 'github', repository, path: fragment.slice('path:'.length) }
  }
  return packageNamePattern.test(locator) ? { kind: 'npm', packageName: locator } : null
}

function entryId(key, hint, name, entries) {
  let id = `github:${key}`
  if (hint?.kind === 'github' && hint.path !== null) id += `/path${hint.path.toLowerCase()}`
  if (!entries.has(id)) return id
  const slug = String(name).toLowerCase().replace(/[^a-z0-9._/-]+/g, '-').replace(/^-+|-+$/g, '') || 'plugin'
  let candidate = `${id}/entry/${slug}`
  let suffix = 2
  while (entries.has(candidate)) candidate = `${id}/entry/${slug}-${suffix++}`
  return candidate
}

async function githubTopic() {
  const entries = []
  const headers = {
    accept: 'application/vnd.github+json',
    'user-agent': 'dsh-plugin-market-registry-builder',
    ...(process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
  }
  for (let page = 1; page <= GITHUB_PAGES; page += 1) {
    const url = new URL(GITHUB_SEARCH_URL)
    url.searchParams.set('q', 'topic:dsh-plugin')
    url.searchParams.set('sort', 'updated')
    url.searchParams.set('order', 'desc')
    url.searchParams.set('per_page', '100')
    url.searchParams.set('page', String(page))
    const body = await fetchJson(url, { headers })
    for (const item of body.items ?? []) entries.push(item)
    if ((body.items ?? []).length < 100) break
  }
  return entries
}

const curated = await fetchJson(CURATED_URL, { headers: { 'user-agent': 'dsh-plugin-market-registry-builder' } })
let github = []
try {
  github = await githubTopic()
} catch (error) {
  process.stderr.write(`registry: GitHub topic source unavailable: ${String(error)}\n`)
}

const githubByRepo = new Map(github.map((item) => [String(item.full_name).toLowerCase(), item]))
const merged = new Map()
const curatedRepos = new Set()

for (const plugin of curated.plugins ?? []) {
  const identity = repositoryIdentity(String(plugin.url ?? ''))
  if (identity === null) continue
  const key = identity.toLowerCase()
  curatedRepos.add(key)
  const githubItem = githubByRepo.get(key)
  const installHint = installHintOf(plugin.install)
  const id = entryId(key, installHint, plugin.name ?? identity.split('/')[1], merged)
  merged.set(id, {
    id,
    name: String(plugin.name ?? identity.split('/')[1]).slice(0, 120),
    description: description(plugin.description),
    category: allowedCategories.has(plugin.category) ? plugin.category : 'other',
    repositoryUrl: String(plugin.url),
    license: licenseOf(githubItem),
    source: null,
    installHint,
    status: 'native',
    discovery: {
      sources: githubItem === undefined ? ['awesome-dsh-plugin'] : ['awesome-dsh-plugin', 'github-topic'],
      stars: Number.isInteger(githubItem?.stargazers_count) ? githubItem.stargazers_count : null,
      pushedAt: typeof githubItem?.pushed_at === 'string' ? githubItem.pushed_at : null,
    },
  })
}

for (const item of github) {
  if (isDirectoryRepository(item)) continue
  const identity = String(item.full_name ?? '')
  const key = identity.toLowerCase()
  if (identity.length === 0 || curatedRepos.has(key)) continue
  const id = `github:${key}`
  const text = String(item.description ?? '').slice(0, 500)
  merged.set(id, {
    id,
    name: String(item.name ?? identity).slice(0, 120),
    description: { en: text, zh: text },
    category: 'other',
    repositoryUrl: String(item.html_url),
    license: licenseOf(item),
    source: null,
    installHint: { kind: 'github', repository: identity, path: null },
    status: 'candidate',
    discovery: {
      sources: ['github-topic'],
      stars: Number.isInteger(item.stargazers_count) ? item.stargazers_count : null,
      pushedAt: typeof item.pushed_at === 'string' ? item.pushed_at : null,
    },
  })
}

const overrides = JSON.parse(await readFile(VERIFIED_OVERRIDES, 'utf8'))
for (const [id, override] of Object.entries(overrides)) {
  const entry = merged.get(id)
  if (entry === undefined) throw new Error(`verified override ${id} has no discovered registry entry`)
  merged.set(id, { ...entry, ...override, id: entry.id, discovery: entry.discovery })
}

const entries = [...merged.values()].sort((left, right) => {
  const priority = { verified: 0, native: 1, installable: 2, candidate: 3, blocked: 4 }
  if (left.status !== right.status) return priority[left.status] - priority[right.status]
  return (right.discovery.stars ?? -1) - (left.discovery.stars ?? -1) || left.name.localeCompare(right.name)
})
const snapshot = { schemaVersion: 1, generatedAt: new Date().toISOString(), entries }
await writeFile(OUTPUT, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8')
process.stdout.write(`registry: wrote ${entries.length} entries (${curated.plugins?.length ?? 0} curated, ${github.length} GitHub topic rows) to ${OUTPUT}\n`)
