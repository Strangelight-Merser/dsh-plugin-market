import { access, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { DetachedRuntimeRestarter, launchDetachedRestart } from '../src/host/runtime-restart.ts'

describe('detached DSH restart', () => {
  it('arms one restart and terminates only after the response delay', () => {
    vi.useFakeTimers()
    const launch = vi.fn()
    const terminate = vi.fn()
    const restarter = new DetachedRuntimeRestarter(500, launch, terminate)

    restarter.schedule()
    restarter.schedule()

    expect(launch).toHaveBeenCalledTimes(1)
    expect(terminate).not.toHaveBeenCalled()
    vi.advanceTimersByTime(500)
    expect(terminate).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it('relaunches the exact executable and arguments after the parent is gone', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-market-restart-'))
    const marker = join(root, 'started.txt')
    try {
      launchDetachedRestart({
        parentPid: 2_147_483_647,
        executable: process.execPath,
        args: ['-e', `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'started')`],
        cwd: root,
        environment: process.env,
      })

      await vi.waitFor(async () => {
        await expect(access(marker)).resolves.toBeUndefined()
      }, { timeout: 5_000, interval: 50 })
      expect(await readFile(marker, 'utf8')).toBe('started')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
