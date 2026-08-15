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
  ) {}

  run(args: readonly string[]): Promise<CommandResult> {
    if (args.some((argument) => argument.includes('\0'))) return Promise.reject(new Error('DSH argument contains NUL'))
    return new Promise((resolve, reject) => {
      const child = spawn(this.executable, [...args], {
        env: { ...process.env, ...this.environment, DSH_HOME: this.dshHome },
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      const stdout: Buffer[] = []
      const stderr: Buffer[] = []
      let bytes = 0

      const collect = (target: Buffer[], chunk: Buffer): void => {
        bytes += chunk.length
        if (bytes > MAX_OUTPUT_BYTES) {
          child.kill()
          reject(new Error('DSH command exceeded the output limit'))
          return
        }
        target.push(chunk)
      }

      child.stdout.on('data', (chunk: Buffer) => collect(stdout, chunk))
      child.stderr.on('data', (chunk: Buffer) => collect(stderr, chunk))
      child.once('error', reject)
      child.once('close', (code) => resolve({
        code: code ?? 1,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
      }))
    })
  }
}
