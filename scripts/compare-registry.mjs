import { readFile } from 'node:fs/promises'
import { isDeepStrictEqual } from 'node:util'

// Validation times change on every fetch; all catalog content still matters.
function content(text) {
  const { generatedAt, entries, ...snapshot } = JSON.parse(text)
  return {
    ...snapshot,
    entries: entries.map(({ validation, ...entry }) => {
      if (validation == null) return { ...entry, validation }
      const { checkedAt, ...result } = validation
      return { ...entry, validation: result }
    }),
  }
}

try {
  const snapshots = await Promise.all(process.argv.slice(2).map((path) => readFile(path, 'utf8')))
  if (snapshots.length !== 2) throw new Error('expected two registry snapshot paths')
  process.exitCode = isDeepStrictEqual(...snapshots.map(content)) ? 0 : 1
} catch (error) {
  console.error(`Cannot compare registry snapshots: ${error.message}`)
  process.exitCode = 2
}
