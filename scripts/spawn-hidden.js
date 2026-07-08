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

/**
 * Launch Electron GUI so it survives after the bat/node launcher exits.
 * Do NOT use `cmd /c start` here — with windowsHide it often fails to show the window.
 */
function spawnApp(command, args, options = {}) {
  const cwd = path.resolve(options.cwd || process.cwd())
  const env = options.env || process.env
  const appDir = args[0] === '.' ? cwd : path.resolve(cwd, args[0] || '.')

  const child = spawn(command, [appDir], {
    cwd,
    env,
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
    shell: false,
  })

  child.unref()
  return child
}

module.exports = { spawnHidden, spawnApp, CREATE_NO_WINDOW, isWin }
