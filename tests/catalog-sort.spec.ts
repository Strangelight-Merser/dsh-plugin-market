import { describe, expect, it } from 'vitest'
import { sortCatalog, type SortableCatalogEntry } from '../src/client/catalog-sort.ts'

const entries: SortableCatalogEntry[] = [
  { id: 'missing', name: 'Missing', discovery: { stars: null, pushedAt: null } },
  { id: 'popular-old', name: 'Popular old', discovery: { stars: 20, pushedAt: '2026-08-10T00:00:00.000Z' } },
  { id: 'new-low', name: 'New low', discovery: { stars: 2, pushedAt: '2026-08-15T00:00:00.000Z' } },
  { id: 'popular-new', name: 'Popular new', discovery: { stars: 20, pushedAt: '2026-08-14T00:00:00.000Z' } },
]

describe('catalog sorting', () => {
  it('sorts by stars descending, then recent update, without mutating input', () => {
    const before = [...entries]
    expect(sortCatalog(entries, 'stars').map((entry) => entry.id)).toEqual([
      'popular-new', 'popular-old', 'new-low', 'missing',
    ])
    expect(entries).toEqual(before)
  })

  it('sorts by recent update descending, then stars, with missing metadata last', () => {
    expect(sortCatalog(entries, 'recent').map((entry) => entry.id)).toEqual([
      'new-low', 'popular-new', 'popular-old', 'missing',
    ])
  })
})
