const { execSync, spawn } = require('child_process')
const fs = require('fs')
const path = require('path')
const { spawnApp, isWin } = require('./spawn-hidden')

const root = path.join(__dirname, '..')
const APP_NAME = 'tosu GUI'

function needsBuild() {
  const mainJs = path.join(root, 'dist-electron', 'main.js')
  const indexHtml = path.join(root, 'dist', 'index.html')
  if (!fs.existsSync(mainJs) || !fs.existsSync(indexHtml)) {
    return true
  }

  const buildTime = Math.min(
    fs.statSync(mainJs).mtimeMs,
    fs.statSync(indexHtml).mtimeMs
  )

  const checkDirs = ['src', 'electron', 'public']
  function checkDir(dirPath) {
    if (!fs.existsSync(dirPath)) return false
    const entries = fs.readdirSync(dirPath, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name)
      if (entry.isDirectory()) {
        if (checkDir(fullPath)) return true
      } else if (entry.isFile()) {
        if (fs.statSync(fullPath).mtimeMs > buildTime) {
          return true
        }
      }
    }
    return false
  }

  for (const dir of checkDirs) {
    if (checkDir(path.join(root, dir))) return true
  }

  const topFiles = ['index.html', 'vite.config.ts', 'package.json']
  for (const file of topFiles) {
    const fullPath = path.join(root, file)
    if (fs.existsSync(fullPath) && fs.statSync(fullPath).mtimeMs > buildTime) {
      return true
    }
  }

  return false
}

function runBuild() {
  try {
    const viteBin = path.join(root, 'node_modules', '.bin', isWin ? 'vite.cmd' : 'vite')
    const cmd = fs.existsSync(viteBin) ? `"${viteBin}" build` : 'npx vite build'
    execSync(cmd, {
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

/** Kill previous instances quickly without slow WMI / PowerShell queries. */
function killPreviousInstances() {
  if (!isWin) return

  const images = ['tosu-gui.exe', 'electron.exe', 'tosu.exe', 'tosu-ingame-overlay.exe']
  for (const image of images) {
    try {
      execSync(`taskkill /F /IM ${image} /T`, { stdio: 'ignore', windowsHide: true })
    } catch {
      /* none */
    }
  }
}

function ensureBrandedElectron() {
  return require('electron')
}

function launchApp() {
  const electronPath = ensureBrandedElectron()
  const mainJs = path.join(root, 'dist-electron', 'main.js')
  if (!fs.existsSync(mainJs)) {
    console.error('[start] missing', mainJs)
    process.exit(1)
  }

  console.log('[start] launching electron...')

  spawnApp(electronPath, [root], {
    cwd: root,
    env: {
      ...process.env,
      ELECTRON_APP_NAME: APP_NAME,
      ELECTRON_RUN_AS_NODE: undefined,
    },
  })
}

const args = process.argv.slice(2)
const forceBuild = args.includes('--build') || args.includes('-b') || args.includes('--force')

console.log('[start] closing previous instances…')
killPreviousInstances()

if (forceBuild || needsBuild()) {
  console.log('[start] building…')
  runBuild()
} else {
  console.log('[start] build up-to-date, launching immediately…')
}

launchApp()
console.log('[start] launched!')
process.exit(0)
