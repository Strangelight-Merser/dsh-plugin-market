export type CatalogSort = 'stars' | 'recent'

export interface SortableCatalogEntry {
  id: string
  name: string
  discovery?: {
    stars: number | null
    pushedAt: string | null
  }
}

function stars(entry: SortableCatalogEntry): number {
  return entry.discovery?.stars ?? -1
}

function pushedAt(entry: SortableCatalogEntry): number {
  const value = entry.discovery?.pushedAt
  if (value === null || value === undefined) return -1
  const timestamp = Date.parse(value)
  return Number.isNaN(timestamp) ? -1 : timestamp
}

function nameAndId(left: SortableCatalogEntry, right: SortableCatalogEntry): number {
  return left.name.localeCompare(right.name) || left.id.localeCompare(right.id)
}

export function sortCatalog<T extends SortableCatalogEntry>(entries: readonly T[], order: CatalogSort): T[] {
  return [...entries].sort((left, right) => {
    if (order === 'recent') {
      return pushedAt(right) - pushedAt(left)
        || stars(right) - stars(left)
        || nameAndId(left, right)
    }
    return stars(right) - stars(left)
      || pushedAt(right) - pushedAt(left)
      || nameAndId(left, right)
  })
}
