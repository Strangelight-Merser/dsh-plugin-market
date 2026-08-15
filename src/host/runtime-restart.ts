import { spawn } from 'node:child_process'

const RESTART_HELPER = String.raw`
const { spawn } = require('node:child_process')
const parentPid = Number(process.argv[1])
const executable = process.argv[2]
const cwd = process.argv[3]
const args = JSON.parse(process.argv[4])
const deadline = Date.now() + 30000

function parentIsAlive() {
  try {
    process.kill(parentPid, 0)
    return true
  } catch {
    return false
  }
}

function restartWhenStopped() {
  if (!parentIsAlive()) {
    const child = spawn(executable, args, {
      cwd,
      env: process.env,
      detached: true,
      shell: false,
      stdio: 'ignore',
      windowsHide: true,
    })
    child.unref()
    return
  }
  if (Date.now() < deadline) setTimeout(restartWhenStopped, 100)
}

restartWhenStopped()
`

export interface RestartLaunch {
  parentPid: number
  executable: string
  args: readonly string[]
  cwd: string
  environment: NodeJS.ProcessEnv
}

export function launchDetachedRestart(launch: RestartLaunch): void {
  if (!Number.isSafeInteger(launch.parentPid) || launch.parentPid <= 0) throw new Error('invalid parent process id')
  if ([launch.executable, launch.cwd, ...launch.args].some((value) => value.includes('\0'))) {
    throw new Error('restart command contains NUL')
  }
  const helper = spawn(process.execPath, [
    '--input-type=commonjs',
    '-e',
    RESTART_HELPER,
    String(launch.parentPid),
    launch.executable,
    launch.cwd,
    JSON.stringify(launch.args),
  ], {
    detached: true,
    env: launch.environment,
    shell: false,
    stdio: 'ignore',
    windowsHide: true,
  })
  helper.unref()
}

export interface RuntimeRestarter {
  schedule(): void
}

export class DetachedRuntimeRestarter implements RuntimeRestarter {
  private scheduled = false

  constructor(
    private readonly delayMs = 500,
    private readonly launch = () => launchDetachedRestart({
      parentPid: process.pid,
      executable: process.execPath,
      args: process.argv.slice(1),
      cwd: process.cwd(),
      environment: process.env,
    }),
    private readonly terminate = () => process.kill(process.pid, 'SIGTERM'),
  ) {}

  schedule(): void {
    if (this.scheduled) return
    this.scheduled = true
    this.launch()
    const timer = setTimeout(this.terminate, this.delayMs)
    timer.unref()
  }
}
