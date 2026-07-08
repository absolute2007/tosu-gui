const { execSync, spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const { spawnApp, isWin } = require('./spawn-hidden')

const root = path.join(__dirname, '..')
const APP_NAME = 'tosu GUI'

function runBuild() {
  try {
    execSync('npx vite build', {
      cwd: root,
      stdio: 'inherit',
      env: process.env,
      ...(isWin ? { windowsHide: true } : {}),
    })
  } catch {
    console.error('[start] vite build failed — aborting launch')
    process.exit(1)
  }

}

/** Kill project + installed GUI so single-instance never reuses an old window. */
function killPreviousInstances() {
  if (!isWin) return

  const images = ['tosu-gui.exe', 'electron.exe']
  for (const image of images) {
    try {
      execSync(`taskkill /F /IM ${image} /T`, { stdio: 'ignore', windowsHide: true })
    } catch {
      /* none */
    }
  }

  // Extra pass: anything whose command line points at this repo or product name
  const script = `
$root = ${JSON.stringify(root)}
Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
  Where-Object {
    $_.CommandLine -and (
      $_.CommandLine -like ("*" + $root + "*") -or
      $_.CommandLine -like '*tosu-gui*' -or
      $_.CommandLine -like '*tosu GUI*' -or
      $_.Name -eq 'tosu-gui.exe'
    )
  } |
  Where-Object { $_.Name -match 'electron|tosu-gui' } |
  ForEach-Object {
    try {
      Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop
      Write-Host ("[start] killed " + $_.Name + " pid " + $_.ProcessId)
    } catch {}
  }
`
  const result = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script],
    { encoding: 'utf8', windowsHide: true }
  )
  if (result.stdout) process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)

  // Brief pause so the single-instance lock is released
  spawnSync('powershell.exe', ['-NoProfile', '-Command', 'Start-Sleep -Milliseconds 400'], {
    windowsHide: true,
  })
}

function ensureBrandedElectron() {
  // Always use stock electron for dev launches — branded .cache copy is often stale
  // and confused with the installed product name.
  return require('electron')
}

function launchApp() {
  const electronPath = ensureBrandedElectron()
  const mainJs = path.join(root, 'dist-electron', 'main.js')
  if (!fs.existsSync(mainJs)) {
    console.error('[start] missing', mainJs)
    process.exit(1)
  }

  console.log('[start] electron:', electronPath)
  console.log('[start] app dir :', root)
  console.log('[start] main.js :', mainJs, 'mtime', fs.statSync(mainJs).mtime.toISOString())

  const child = spawnApp(electronPath, [root], {
    cwd: root,
    env: {
      ...process.env,
      ELECTRON_APP_NAME: APP_NAME,
      // Force this project path as the app
      ELECTRON_RUN_AS_NODE: undefined,
    },
  })

  child.on('error', (err) => {
    console.error('[start] failed to launch electron:', err)
  })
}

console.log('[start] stopping previous instances…')
killPreviousInstances()
console.log('[start] building…')
runBuild()
launchApp()
console.log('[start] launched — if you still see an old UI, close ALL tosu windows and run start-gui.bat again')
process.exit(0)
