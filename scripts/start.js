const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const { spawnApp, isWin } = require('./spawn-hidden')

const root = path.join(__dirname, '..')
const APP_NAME = 'tosu GUI'

function runBuild() {
  execSync('npx vite build', {
    cwd: root,
    stdio: isWin ? 'ignore' : 'inherit',
    env: process.env,
    ...(isWin ? { windowsHide: true } : {}),
  })
}

function ensureBrandedElectron() {
  const electronPath = require('electron')
  if (!isWin) return electronPath

  const cacheDir = path.join(root, '.cache')
  const brandedPath = path.join(cacheDir, 'tosu-gui.exe')

  fs.mkdirSync(cacheDir, { recursive: true })

  const electronMtime = fs.statSync(electronPath).mtimeMs
  const brandedMtime = fs.existsSync(brandedPath) ? fs.statSync(brandedPath).mtimeMs : 0
  const metaPath = path.join(cacheDir, 'tosu-gui.meta.json')
  let meta = { electronMtime: 0, appName: '' }

  if (fs.existsSync(metaPath)) {
    try {
      meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'))
    } catch {
      meta = { electronMtime: 0, appName: '' }
    }
  }

  const needsRefresh =
    !fs.existsSync(brandedPath) ||
    brandedMtime < electronMtime ||
    meta.electronMtime !== electronMtime ||
    meta.appName !== APP_NAME

  if (!needsRefresh) return brandedPath

  fs.copyFileSync(electronPath, brandedPath)

  try {
    execSync(
      `npx --yes rcedit "${brandedPath}" --set-version-string FileDescription "${APP_NAME}" --set-version-string ProductName "${APP_NAME}" --set-version-string InternalName "tosu-gui" --set-version-string OriginalFilename "tosu-gui.exe"`,
      {
        cwd: root,
        stdio: 'ignore',
        windowsHide: true,
      }
    )
    fs.writeFileSync(metaPath, JSON.stringify({ electronMtime, appName: APP_NAME }), 'utf8')
    return brandedPath
  } catch (err) {
    console.warn('[start] Could not brand electron launcher, using default electron.exe')
    return electronPath
  }
}

function launchApp() {
  const electronPath = ensureBrandedElectron()
  const child = spawnApp(electronPath, ['.'], {
    cwd: root,
    env: {
      ...process.env,
      ELECTRON_APP_NAME: APP_NAME,
    },
  })
  child.unref()
}

runBuild()
launchApp()
process.exit(0)