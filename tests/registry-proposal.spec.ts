import { execFile } from 'node:child_process'
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'

const exec = promisify(execFile)
const script = fileURLToPath(new URL('../scripts/propose-registry.sh', import.meta.url))
const snapshot = (name: string, time = '2026-09-09T00:00:00Z') => JSON.stringify({
  schemaVersion: 1, generatedAt: time,
  entries: [{ id: 'test', name, validation: { manifest: 'pass', checkedAt: time } }],
})

describe('registry PR publication', () => {
  it('ignores object formatting and check times but preserves catalog and schema changes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-registry-compare-'))
    try {
      const before = join(root, 'before.json')
      const after = join(root, 'after.json')
      const compare = fileURLToPath(new URL('../scripts/compare-registry.mjs', import.meta.url))
      await writeFile(before, snapshot('plugin'))
      const value = JSON.parse(snapshot('plugin', '2026-09-09T06:00:00Z'))
      await writeFile(after, JSON.stringify({ entries: value.entries, generatedAt: value.generatedAt, schemaVersion: 1 }, null, 2))
      await exec(process.execPath, [compare, before, after])
      for (const changed of [
        { ...value, schemaVersion: 2 },
        { ...value, entries: [] },
        { ...value, entries: [{ ...value.entries[0], name: 'new name' }] },
        { ...value, entries: [{ ...value.entries[0], validation: { ...value.entries[0].validation, manifest: 'fail' } }] },
        { ...value, entries: [{ ...value.entries[0], discovery: { stars: 2 } }] },
      ]) {
        await writeFile(after, JSON.stringify(changed))
        await expect(exec(process.execPath, [compare, before, after])).rejects.toMatchObject({ code: 1 })
      }
    } finally { await rm(root, { recursive: true, force: true }) }
  })

  it('updates one bot branch without pushing main and reuses the PR for review', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-registry-pr-'))
    const repository = join(root, 'work')
    const remote = join(root, 'remote.git')
    const bin = join(root, 'bin')
    const log = join(root, 'gh.log')
    try {
      await exec('git', ['init', '--bare', remote])
      await exec('git', ['init', '--initial-branch=main', repository])
      const git = (args: string[]) => exec('git', args, { cwd: repository })
      await git(['config', 'user.name', 'Test'])
      await git(['config', 'user.email', 'test@example.invalid'])
      await mkdir(join(repository, 'data'))
      await writeFile(join(repository, 'data/registry-v1.json'), snapshot('initial'))
      await git(['add', '.'])
      await git(['commit', '-m', 'initial'])
      await git(['remote', 'add', 'origin', remote])
      await git(['push', 'origin', 'main'])
      const main = (await git(['rev-parse', 'HEAD'])).stdout.trim()
      const hook = join(remote, 'hooks/pre-receive')
      await writeFile(hook, '#!/bin/sh\nwhile read old new ref; do\n  if [ "$ref" = refs/heads/main ]; then exit 1; fi\ndone\n')
      await chmod(hook, 0o700)
      await mkdir(bin)
      const gh = join(bin, 'gh')
      await writeFile(gh, '#!/bin/sh\nprintf "%s\\n" "$*" >> "$GH_TEST_LOG"\nif [ "$1 $2" = "pr list" ] && [ -f "$GH_TEST_LOG.created" ]; then echo 12; fi\nif [ "$1 $2" = "pr create" ]; then touch "$GH_TEST_LOG.created"; fi\n')
      await chmod(gh, 0o700)
      const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, GH_TEST_LOG: log }
      const head = async () => (await exec('git', ['--git-dir', remote, 'rev-parse', 'automation/registry-refresh'])).stdout.trim()
      const refresh = async (value: string) => {
        await git(['reset', '--hard', main])
        await writeFile(join(repository, 'data/registry-v1.json'), value)
        return exec('bash', [script], { cwd: repository, env })
      }
      let lastHead: string | undefined
      for (const content of ['first refresh', 'second refresh']) {
        await refresh(snapshot(content))
        const proposed = await head()
        expect(proposed).not.toBe(lastHead)
        lastHead = proposed
        // Scheduled runs start from main, not from the open PR's checkout.
        await refresh(snapshot(content))
        expect(await head()).toBe(proposed)
        await refresh(snapshot(content, '2026-09-09T06:00:00Z'))
        expect(await head()).toBe(proposed)
      }
      expect((await exec('git', ['--git-dir', remote, 'rev-parse', 'main'])).stdout.trim()).toBe(main)
      expect((await exec('git', ['--git-dir', remote, 'show', 'automation/registry-refresh:data/registry-v1.json'])).stdout).toBe(snapshot('second refresh'))
      const commands = await readFile(log, 'utf8')
      expect(commands.match(/^pr create /gm)).toHaveLength(1)
      expect(commands).not.toContain('workflow run')
      await git(['reset', '--hard', main])
      await exec('bash', [script], { cwd: repository, env })
      expect(await readFile(log, 'utf8')).toBe(commands)

      // Recover if the push succeeded but PR creation failed on a prior run.
      await rm(`${log}.created`)
      await refresh(snapshot('second refresh', '2026-09-09T12:00:00Z'))
      expect(await head()).toBe(lastHead)
      expect((await readFile(log, 'utf8')).match(/^pr create /gm)).toHaveLength(2)

      // Comparison errors must fail closed, never become a new publication.
      await expect(refresh('invalid JSON')).rejects.toThrow()
      expect(await head()).toBe(lastHead)

      // A handwritten change on the bot branch must still block updates.
      await git(['reset', '--hard', lastHead!])
      await writeFile(join(repository, 'manual.txt'), 'manual change')
      await git(['add', 'manual.txt'])
      await git(['commit', '-m', 'manual change'])
      await git(['push', 'origin', 'HEAD:automation/registry-refresh'])
      const manualHead = await head()
      await expect(refresh(snapshot('third refresh'))).rejects.toThrow('non-registry changes')
      expect(await head()).toBe(manualHead)
    } finally { await rm(root, { recursive: true, force: true }) }
  })
})
