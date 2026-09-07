import { execFile } from 'node:child_process'
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'

const exec = promisify(execFile)
const script = fileURLToPath(new URL('../scripts/propose-registry.sh', import.meta.url))

describe('registry PR publication', () => {
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
      await writeFile(join(repository, 'data/registry-v1.json'), 'initial')
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
      for (const content of ['first refresh', 'second refresh']) {
        await git(['reset', '--hard', main])
        await writeFile(join(repository, 'data/registry-v1.json'), content)
        await exec('bash', [script], { cwd: repository, env })
      }
      expect((await exec('git', ['--git-dir', remote, 'rev-parse', 'main'])).stdout.trim()).toBe(main)
      expect((await exec('git', ['--git-dir', remote, 'show', 'automation/registry-refresh:data/registry-v1.json'])).stdout).toBe('second refresh')
      const commands = await readFile(log, 'utf8')
      expect(commands.match(/^pr create /gm)).toHaveLength(1)
      expect(commands).not.toContain('workflow run')
      await exec('bash', [script], { cwd: repository, env })
      expect(await readFile(log, 'utf8')).toBe(commands)
    } finally { await rm(root, { recursive: true, force: true }) }
  })
})
