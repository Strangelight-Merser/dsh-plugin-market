import { mkdir, open, readFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'

export class ProfileLockedError extends Error {
  override readonly name = 'ProfileLockedError'
}

export async function withProfileLock<T>(dshHome: string, profile: string, operation: () => Promise<T>): Promise<T> {
  const lockDir = join(dshHome, '.dsh-plugin-market', 'locks')
  const lockPath = join(lockDir, `${profile}.lock`)
  await mkdir(lockDir, { recursive: true })

  let handle
  try {
    handle = await open(lockPath, 'wx', 0o600)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    let owner = 'unknown owner'
    try {
      owner = (await readFile(lockPath, 'utf8')).trim() || owner
    } catch {
      // A concurrent owner may have completed between open and read.
    }
    throw new ProfileLockedError(`profile ${profile} is locked by ${owner}`)
  }

  try {
    await handle.writeFile(`${JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() })}\n`)
    return await operation()
  } finally {
    await handle.close()
    await unlink(lockPath).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error
    })
  }
}
