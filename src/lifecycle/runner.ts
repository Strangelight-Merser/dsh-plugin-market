import { spawn } from 'node:child_process'

export interface CommandResult {
  code: number
  stdout: string
  stderr: string
}

export interface DshCommandRunner {
  run(args: readonly string[]): Promise<CommandResult>
}

const MAX_OUTPUT_BYTES = 8 * 1024 * 1024

export class SpawnDshRunner implements DshCommandRunner {
  constructor(
    private readonly dshHome: string,
    private readonly executable = 'dsh',
    private readonly environment: NodeJS.ProcessEnv = {},
    private readonly timeoutMs = 120_000,
  ) {}

  run(args: readonly string[]): Promise<CommandResult> {
    if (args.some((argument) => argument.includes('\0'))) return Promise.reject(new Error('DSH argument contains NUL'))
    return new Promise((resolve, reject) => {
      const child = spawn(this.executable, [...args], {
        env: { ...process.env, ...this.environment, DSH_HOME: this.dshHome },
        shell: false,
        detached: process.platform !== 'win32',
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      const stdout: Buffer[] = []
      const stderr: Buffer[] = []
      let bytes = 0
      let failure: Error | undefined
      let forceKill: ReturnType<typeof setTimeout> | undefined
      const kill = (signal: NodeJS.Signals): void => {
        try {
          if (child.pid !== undefined && process.platform !== 'win32') process.kill(-child.pid, signal)
          else child.kill(signal)
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ESRCH') child.kill(signal)
        }
      }
      const abort = (reason: string): void => {
        if (failure !== undefined) return
        failure = new Error(reason)
        kill('SIGTERM')
        forceKill = setTimeout(() => kill('SIGKILL'), 1_000)
      }
      const timeout = setTimeout(() => abort('DSH command timed out'), this.timeoutMs)

      const collect = (target: Buffer[], chunk: Buffer): void => {
        if (failure !== undefined) return
        bytes += chunk.length
        if (bytes > MAX_OUTPUT_BYTES) {
          abort('DSH command exceeded the output limit')
          return
        }
        target.push(chunk)
      }

      child.stdout.on('data', (chunk: Buffer) => collect(stdout, chunk))
      child.stderr.on('data', (chunk: Buffer) => collect(stderr, chunk))
      child.once('error', (error) => { failure ??= error })
      child.once('close', (code) => {
        clearTimeout(timeout)
        clearTimeout(forceKill)
        if (failure !== undefined) kill('SIGKILL')
        // Never start rollback while the child can still mutate the profile.
        if (failure !== undefined) reject(failure)
        else resolve({
          code: code ?? 1,
          stdout: Buffer.concat(stdout).toString('utf8'),
          stderr: Buffer.concat(stderr).toString('utf8'),
        })
      })
    })
  }
}
