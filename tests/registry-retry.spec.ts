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

async function buildWithFailure(failure: string, persistent = false) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-registry-retry-'))
  try {
    await mkdir(join(root, 'data'))
    await writeFile(join(root, 'data/verified-overrides.json'), '{}')
    const output = join(root, 'data/registry-v1.json')
    await writeFile(output, 'previous snapshot')
    const mock = join(root, 'network.mjs')
    await writeFile(mock, `
      import { writeFileSync } from 'node:fs';
      let attempts = 0;
      globalThis.fetch = async (url) => {
        if (String(url).includes('plugins.json')) return Response.json({ plugins: [
          { name: 'Valid', url: 'https://github.com/example/valid', install: 'dsh plugin --profile web add github:example/valid' }
        ] });
        writeFileSync('attempts.txt', String(++attempts));
        if (${persistent} || attempts === 1) { ${failure} }
        return Response.json({ name: 'valid-tool', exports: { node: { import: './index.js' } }, dsh: { bundle: { patch: './cordis.patch.yml' } } });
      };
    `)
    let succeeded = true
    try {
      await exec(process.execPath, ['--import', mock, script], {
        cwd: root, env: { ...process.env, DSH_GITHUB_PAGES: '0', DSH_REGISTRY_OUTPUT: output },
      })
    } catch { succeeded = false }
    return {
      succeeded,
      attempts: Number(await readFile(join(root, 'attempts.txt'), 'utf8')),
      snapshot: await readFile(output, 'utf8'),
    }
  } finally { await rm(root, { recursive: true, force: true }) }
}

describe('registry refresh transient failures', () => {
  it.each([
    ['HTTP 500', 'return new Response("unavailable", { status: 500 });'],
    ['HTTP 503', 'return new Response("unavailable", { status: 503 });'],
    ['connection reset', 'throw new TypeError("fetch failed");'],
    ['timeout', 'throw new DOMException("timed out", "TimeoutError");'],
    ['interrupted response body', 'return new Response(new ReadableStream({ start(controller) { controller.error(new TypeError("terminated")); } }));'],
  ])('recovers from %s without dropping the plugin', async (_, failure) => {
    const result = await buildWithFailure(failure)
    expect(result.succeeded).toBe(true)
    expect(result.attempts).toBe(2)
    const snapshot = RegistrySnapshotSchema.parse(JSON.parse(result.snapshot))
    expect(snapshot.entries.map((entry) => entry.id)).toEqual(['github:example/valid'])
  })

  it('stops after three attempts and preserves the previous snapshot during an outage', async () => {
    const result = await buildWithFailure('return new Response("unavailable", { status: 503 });', true)
    expect(result).toEqual({ succeeded: false, attempts: 3, snapshot: 'previous snapshot' })
  })

  it.each([401, 403, 429])('does not retry HTTP %s or overwrite the previous snapshot', async (status) => {
    const result = await buildWithFailure(`return new Response("denied", { status: ${status} });`, true)
    expect(result).toEqual({ succeeded: false, attempts: 1, snapshot: 'previous snapshot' })
  })
})
