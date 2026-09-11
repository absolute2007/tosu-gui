const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const isWin = process.platform === 'win32'
const BIN_DIR = path.join(__dirname, '..', 'resources', 'bin')
const TARGET_EXE = path.join(BIN_DIR, 'osu-audio-controller.exe')
const SOURCE_CS = path.join(__dirname, 'osu-audio-controller.cs')

function findCsc() {
  const candidates = [
    path.join(process.env.WINDIR || 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe'),
    path.join(process.env.WINDIR || 'C:\\Windows', 'Microsoft.NET', 'Framework', 'v4.0.30319', 'csc.exe'),
  ]
  for (const c of candidates) {
    if (fs.existsSync(c)) return c
  }
  return null
}

function build() {
  if (!isWin) {
    console.log('[build-audio-tool] Skipping Windows audio tool build on non-Windows platform.')
    return
  }

  if (!fs.existsSync(SOURCE_CS)) {
    console.error('[build-audio-tool] Source file not found:', SOURCE_CS)
    process.exit(1)
  }

  const csc = findCsc()
  if (!csc) {
    console.warn('[build-audio-tool] csc.exe (.NET Framework 4.0+) not found. Audio muter build skipped.')
    return
  }

  fs.mkdirSync(BIN_DIR, { recursive: true })

  console.log(`[build-audio-tool] Compiling ${SOURCE_CS} -> ${TARGET_EXE}...`)
  const cmd = `"${csc}" /nologo /optimize+ /target:exe /out:"${TARGET_EXE}" "${SOURCE_CS}"`
  execSync(cmd, { stdio: 'inherit' })

  if (fs.existsSync(TARGET_EXE)) {
    const stats = fs.statSync(TARGET_EXE)
    console.log(`[build-audio-tool] Successfully built osu-audio-controller.exe (${stats.size} bytes)`)
  } else {
    throw new Error('Build failed: output binary does not exist')
  }
}

if (require.main === module) {
  try {
    build()
  } catch (err) {
    console.error('[build-audio-tool] Build failed:', err.message)
    process.exit(1)
  }
}

module.exports = { build }
