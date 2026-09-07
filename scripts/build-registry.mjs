import { readFile, writeFile, rename } from 'node:fs/promises'
import { resolve } from 'node:path'
import { resolvePluginCategory } from '../src/core/category.ts'
import { assertDshPluginManifest, PluginManifestError } from '../src/core/plugin-manifest.ts'
import { parseInstallHint, RegistrySnapshotSchema } from '../src/core/registry.ts'

const CURATED_URL = 'https://awesome-dsh-plugin.com/plugins.json'
const GITHUB_SEARCH_URL = 'https://api.github.com/search/repositories'
const OUTPUT = resolve(process.env.DSH_REGISTRY_OUTPUT ?? 'data/registry-v1.json')
const VERIFIED_OVERRIDES = resolve('data/verified-overrides.json')
const GITHUB_PAGES = Math.max(0, Math.min(10, Number.parseInt(process.env.DSH_GITHUB_PAGES ?? '10', 10)))
const MAX_DESCRIPTION = 4000
const repositoryPattern = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/

class MissingManifestError extends Error {}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(15_000) })
  if (response.status === 404) throw new MissingManifestError(`${new URL(url).hostname} returned HTTP 404`)
  if (!response.ok) throw new Error(`${new URL(url).hostname} returned HTTP ${response.status}`)
  try { return await response.json() }
  catch { throw new PluginManifestError(`${new URL(url).hostname} returned invalid JSON`) }
}

function repositoryIdentity(url) {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' || parsed.hostname.toLowerCase() !== 'github.com') return null
    const parts = parsed.pathname.split('/').filter(Boolean)
    if (parts.length < 2) return null
    return `${parts[0]}/${parts[1].replace(/\.git$/i, '')}`
  } catch {
    return null
  }
}

function description(value) {
  const en = typeof value?.en === 'string' ? value.en.slice(0, MAX_DESCRIPTION) : ''
  const zh = typeof value?.zh === 'string' ? value.zh.slice(0, MAX_DESCRIPTION) : en
  return { en, zh }
}

function licenseOf(value) {
  if (typeof value?.license === 'string' && value.license.length > 0) return value.license
  if (typeof value?.license?.type === 'string' && value.license.type.length > 0) return value.license.type
  const spdx = value?.license?.spdx_id
  return typeof spdx === 'string' && spdx !== 'NOASSERTION' ? spdx : null
}

function isDirectoryRepository(item) {
  return String(item?.name ?? '').toLowerCase().startsWith('awesome-')
}

function topicsOf(value) {
  return Array.isArray(value?.topics) ? value.topics.filter((topic) => typeof topic === 'string') : []
}

function hintKey(hint) {
  return hint.kind === 'npm' ? `npm:${hint.packageName}` : `github:${hint.repository}${hint.path ?? ''}`
}

async function validateHint(hint, checkedAt) {
  if (hint.kind === 'npm') {
    const metadata = await fetchJson(`https://registry.npmjs.org/${encodeURIComponent(hint.packageName)}`, {
      headers: { accept: 'application/json', 'user-agent': 'dsh-plugin-market-registry-builder' },
    })
    const version = metadata?.['dist-tags']?.latest
    const manifest = typeof version === 'string' ? metadata?.versions?.[version] : null
    const packageName = assertDshPluginManifest(manifest, hint.packageName)
    return {
      validation: { manifest: 'pass', checkedAt, packageName },
      source: { kind: 'npm', packageName, version },
      license: licenseOf(manifest),
    }
  }
  const manifest = await fetchJson(`https://raw.githubusercontent.com/${hint.repository}/HEAD${hint.path ?? ''}/package.json`, {
    headers: { accept: 'application/json', 'user-agent': 'dsh-plugin-market-registry-builder' },
  })
  const packageName = assertDshPluginManifest(manifest)
  return {
    validation: { manifest: 'pass', checkedAt, packageName },
    source: null,
    license: licenseOf(manifest),
  }
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
    if (!Array.isArray(body.items) || body.incomplete_results) throw new Error('GitHub search returned incomplete results')
    for (const item of body.items) entries.push(item)
    if ((body.items ?? []).length < 100) break
  }
  return entries
}

async function validateAll(hints, checkedAt) {
  const queue = [...hints.entries()]
  const results = new Map()
  let cursor = 0
  const worker = async () => {
    while (cursor < queue.length) {
      const row = queue[cursor++]
      if (row === undefined) return
      const [key, hint] = row
      try {
        results.set(key, await validateHint(hint, checkedAt))
      } catch (error) {
        if (!(error instanceof MissingManifestError || error instanceof PluginManifestError)) throw error
        // Missing or invalid manifests are excluded; transport failures abort publication.
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(16, queue.length) }, worker))
  return results
}

const checkedAt = new Date().toISOString()
const curated = await fetchJson(CURATED_URL, { headers: { 'user-agent': 'dsh-plugin-market-registry-builder' } })
if (!Array.isArray(curated.plugins) || curated.plugins.length === 0) throw new Error('curated catalog is empty or invalid')
const github = await githubTopic()

const hints = new Map()
for (const plugin of curated.plugins ?? []) {
  const hint = parseInstallHint(plugin.install)
  if (hint !== null) hints.set(hintKey(hint), hint)
}
for (const item of github) {
  if (isDirectoryRepository(item) || !repositoryPattern.test(String(item.full_name ?? ''))) continue
  const hint = { kind: 'github', repository: item.full_name, path: null }
  hints.set(hintKey(hint), hint)
}
const validations = await validateAll(hints, checkedAt)

const githubByRepo = new Map(github.map((item) => [String(item.full_name).toLowerCase(), item]))
const merged = new Map()
const curatedRepos = new Set()

for (const plugin of curated.plugins ?? []) {
  const identity = repositoryIdentity(String(plugin.url ?? ''))
  const installHint = parseInstallHint(plugin.install)
  if (identity === null || installHint === null) continue
  const key = identity.toLowerCase()
  curatedRepos.add(key)
  const validation = validations.get(hintKey(installHint))
  if (validation === undefined) continue
  const githubItem = githubByRepo.get(key)
  const id = entryId(key, installHint, plugin.name ?? identity.split('/')[1], merged)
  const entryDescription = description(plugin.description)
  merged.set(id, {
    id,
    name: String(plugin.name ?? identity.split('/')[1]).slice(0, 120),
    description: entryDescription,
    category: resolvePluginCategory(plugin.category, {
      name: String(plugin.name ?? identity.split('/')[1]),
      description: `${entryDescription.zh} ${entryDescription.en}`,
      topics: topicsOf(githubItem),
    }),
    repositoryUrl: String(plugin.url),
    license: validation.license ?? licenseOf(githubItem),
    source: validation.source,
    installHint,
    status: 'installable',
    validation: validation.validation,
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
  if (!repositoryPattern.test(identity) || curatedRepos.has(key) || repositoryIdentity(String(item.html_url ?? '')) === null) continue
  const installHint = { kind: 'github', repository: identity, path: null }
  const validation = validations.get(hintKey(installHint))
  if (validation === undefined) continue
  const id = `github:${key}`
  const text = String(item.description ?? '').slice(0, MAX_DESCRIPTION)
  merged.set(id, {
    id,
    name: String(item.name ?? identity).slice(0, 120),
    description: { en: text, zh: text },
    category: resolvePluginCategory(undefined, {
      name: String(item.name ?? identity),
      description: text,
      topics: topicsOf(item),
    }),
    repositoryUrl: String(item.html_url),
    license: validation.license ?? licenseOf(item),
    source: validation.source,
    installHint,
    status: 'installable',
    validation: validation.validation,
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
  if (entry === undefined) throw new Error(`verified override ${id} has no validated registry entry`)
  merged.set(id, { ...entry, ...override, id: entry.id, discovery: entry.discovery, validation: entry.validation })
}

const priority = { verified: 0, installable: 1, blocked: 2 }
const entries = [...merged.values()].sort((left, right) => {
  if (left.status !== right.status) return priority[left.status] - priority[right.status]
  return (right.discovery.stars ?? -1) - (left.discovery.stars ?? -1) || left.name.localeCompare(right.name)
})
const snapshot = RegistrySnapshotSchema.parse({ schemaVersion: 1, generatedAt: checkedAt, entries })
if (snapshot.entries.length === 0) throw new Error('refusing to publish an empty registry')
try {
  const previous = JSON.parse(await readFile(OUTPUT, 'utf8'))
  const signature = (value) => JSON.stringify(value, (key, row) => key === 'checkedAt' ? undefined : row)
  if (signature(previous.entries) === signature(entries)) {
    process.stdout.write(`registry: unchanged (${entries.length} entries)\n`)
    process.exit(0)
  }
} catch {
  // A missing or invalid previous snapshot is replaced below.
}
const temporary = `${OUTPUT}.${process.pid}.tmp`
await writeFile(temporary, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8')
await rename(temporary, OUTPUT)
process.stdout.write(`registry: wrote ${entries.length} validated entries; rejected ${hints.size - validations.size} of ${hints.size} unique locators (${curated.plugins?.length ?? 0} curated rows, ${github.length} GitHub topic rows)\n`)
