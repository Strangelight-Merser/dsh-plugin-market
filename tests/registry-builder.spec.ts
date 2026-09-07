import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'
import { RegistrySnapshotSchema } from '../src/core/registry.ts'

const exec = promisify(execFile)
const script = fileURLToPath(new URL('../scripts/build-registry.mjs', import.meta.url))

async function buildWith(mode: 'malformed' | 'outage'): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-registry-build-'))
  try {
    await mkdir(join(root, 'data'))
    await writeFile(join(root, 'data/verified-overrides.json'), '{}')
    const output = join(root, 'data/registry-v1.json')
    await writeFile(output, 'previous snapshot')
    const mock = join(root, 'network.mjs')
    await writeFile(mock, `
      globalThis.fetch = async (url) => {
        if (String(url).includes('plugins.json')) return Response.json({ plugins: [
          { name: 'Valid', url: 'https://github.com/example/valid', install: 'dsh plugin --profile web add github:example/valid' },
          { name: 'Bad', url: 'https://github.com/example/bad', install: 'dsh plugin --profile web add github:example/bad' }
        ] });
        if (String(url).includes('/bad/')) return new Response(${JSON.stringify(mode === 'malformed' ? '{broken' : 'unavailable')}, { status: ${mode === 'malformed' ? 200 : 503} });
        return Response.json({ name: 'valid-tool', exports: { node: { import: './index.js' } }, dsh: { bundle: { patch: './cordis.patch.yml' } } });
      };
    `)
    const run = exec(process.execPath, ['--import', mock, script], { cwd: root, env: { ...process.env, DSH_GITHUB_PAGES: '0' } })
    if (mode === 'outage') {
      await expect(run).rejects.toThrow()
      expect(await readFile(output, 'utf8')).toBe('previous snapshot')
    } else {
      await run
      const snapshot = RegistrySnapshotSchema.parse(JSON.parse(await readFile(output, 'utf8')))
      expect(snapshot.entries.map((entry) => entry.id)).toEqual(['github:example/valid'])
      const before = await readFile(output, 'utf8')
      await exec(process.execPath, ['--import', mock, script], { cwd: root, env: { ...process.env, DSH_GITHUB_PAGES: '0' } })
      expect(await readFile(output, 'utf8')).toBe(before)
    }
  } finally { await rm(root, { recursive: true, force: true }) }
}

describe('registry build publication boundary', () => {
  it('excludes malformed manifests and avoids timestamp-only updates', async () => { await buildWith('malformed') })
  it('preserves the previous snapshot during transport failures', async () => { await buildWith('outage') })
})
