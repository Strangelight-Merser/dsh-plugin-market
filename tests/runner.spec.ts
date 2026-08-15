import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SpawnDshRunner } from '../src/lifecycle/runner.ts'

describe('argv-only command runner', () => {
  it('passes shell metacharacters as inert arguments', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-verified-argv-'))
    try {
      const output = join(root, 'argv.json')
      const marker = join(root, 'must-not-exist')
      const executable = join(root, 'capture.mjs')
      await writeFile(executable, `#!/usr/bin/env node\nimport { writeFileSync } from 'node:fs'\nwriteFileSync(process.argv[2], JSON.stringify(process.argv.slice(3)))\n`)
      await chmod(executable, 0o700)
      const runner = new SpawnDshRunner(root, executable)
      const shaped = `safe;touch ${marker}`
      const result = await runner.run([output, shaped])
      expect(result.code).toBe(0)
      expect(JSON.parse(await readFile(output, 'utf8'))).toEqual([shaped])
      await expect(readFile(marker)).rejects.toMatchObject({ code: 'ENOENT' })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
