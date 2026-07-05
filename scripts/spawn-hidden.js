const { spawn } = require('child_process')
const path = require('path')

const CREATE_NO_WINDOW = 0x08000000
const isWin = process.platform === 'win32'

/** For background/console subprocesses (tosu, taskkill). */
function spawnHidden(command, args, options = {}) {
  return spawn(command, args, {
    stdio: 'ignore',
    windowsHide: true,
    ...options,
    ...(isWin ? { creationFlags: CREATE_NO_WINDOW } : {}),
  })
}

/** Launch Electron GUI detached from the launcher terminal. */
function spawnApp(command, args, options = {}) {
  const cwd = path.resolve(options.cwd || process.cwd())
  const env = options.env || process.env
  const appDir = args[0] === '.' ? cwd : path.resolve(cwd, args[0])

  if (isWin) {
    // `start` ignores spawn cwd — must pass /D explicitly.
    return spawn(
      'cmd.exe',
      ['/d', '/c', 'start', '""', '/D', cwd, command, appDir],
      {
        env,
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
        shell: false,
      }
    )
  }

  return spawn(command, [appDir], {
    cwd,
    env,
    stdio: 'ignore',
    detached: true,
    ...options,
  })
}

module.exports = { spawnHidden, spawnApp, CREATE_NO_WINDOW, isWin }