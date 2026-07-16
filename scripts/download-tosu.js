const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const RESOURCES_DIR = path.join(__dirname, '..', 'resources', 'tosu')
const isWin = process.platform === 'win32'
const EXE_NAME = isWin ? 'tosu.exe' : 'tosu'
const TARGET = path.join(RESOURCES_DIR, EXE_NAME)

async function getLatestRelease() {
  const res = await fetch('https://api.github.com/repos/tosuapp/tosu/releases/latest', {
    headers: { 'User-Agent': 'tosu-gui' },
  })
  if (!res.ok) throw new Error(`GitHub API error: ${res.status}`)
  return res.json()
}

async function download(url, dest) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'tosu-gui' },
    redirect: 'follow',
  })
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText}`)
  const buffer = Buffer.from(await res.arrayBuffer())
  fs.writeFileSync(dest, buffer)
  return buffer.length
}

function extractZip(zipPath, destDir) {
  if (isWin) {
    execSync(
      `powershell -NoProfile -Command "Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force"`,
      { stdio: 'inherit' }
    )
  } else {
    execSync(`unzip -o "${zipPath}" -d "${destDir}"`, { stdio: 'inherit' })
  }
}

function findExe(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isFile() && (entry.name === EXE_NAME || entry.name.endsWith('.exe'))) {
      return full
    }
    if (entry.isDirectory()) {
      const found = findExe(full)
      if (found) return found
    }
  }
  return null
}

const LOCAL_SEARCH_PATHS = [
  path.join(process.env.USERPROFILE || '', 'Desktop', 'Folders', 'Tosu'),
  path.join(process.env.USERPROFILE || '', 'Documents', 'dev-projects', 'osu-auto', 'tosu_bin'),
]

function tryCopyLocal() {
  for (const dir of LOCAL_SEARCH_PATHS) {
    const exe = path.join(dir, EXE_NAME)
    if (!fs.existsSync(exe)) continue

    fs.mkdirSync(RESOURCES_DIR, { recursive: true })
    fs.copyFileSync(exe, TARGET)

    for (const extra of ['tosu.env', 'static', 'settings', 'game-overlay']) {
      const src = path.join(dir, extra)
      const dst = path.join(RESOURCES_DIR, extra)
      if (fs.existsSync(src)) {
        if (fs.statSync(src).isDirectory()) {
          fs.cpSync(src, dst, { recursive: true })
        } else {
          fs.copyFileSync(src, dst)
        }
      }
    }

    console.log(`Copied tosu from ${dir}`)
    return true
  }
  return false
}

async function installOverlayAsset(release, version) {
  if (!isWin) {
    console.log('In-game overlay is Windows-only; skipping overlay download')
    return
  }

  const overlayDir = path.join(RESOURCES_DIR, 'game-overlay')
  const versionFile = path.join(overlayDir, 'version')
  if (
    fs.existsSync(path.join(overlayDir, 'tosu-ingame-overlay.exe')) &&
    fs.existsSync(versionFile) &&
    fs.readFileSync(versionFile, 'utf8').trim() === version
  ) {
    console.log(`game-overlay ${version} already present`)
    return
  }

  const tag = release.tag_name
  const asset =
    release.assets.find((a) => a.name === `tosu-overlay-${tag}.zip`) ||
    release.assets.find((a) => a.name.includes('tosu-overlay') && a.name.endsWith('.zip'))

  if (!asset) {
    console.warn(
      'Overlay asset not found. Available:',
      release.assets.map((a) => a.name).join(', ')
    )
    return
  }

  const zipPath = path.join(RESOURCES_DIR, asset.name)
  const extractDir = path.join(RESOURCES_DIR, '.overlay-extract')
  console.log(`Downloading ${asset.name} (${(asset.size / 1024 / 1024).toFixed(1)} MB)...`)
  const size = await download(asset.browser_download_url, zipPath)
  if (size < 10_000) throw new Error(`Overlay zip too small (${size} bytes)`)

  fs.rmSync(extractDir, { recursive: true, force: true })
  fs.mkdirSync(extractDir, { recursive: true })
  extractZip(zipPath, extractDir)
  fs.unlinkSync(zipPath)

  const hasExe = fs.existsSync(path.join(extractDir, 'tosu-ingame-overlay.exe'))
  const nested = path.join(extractDir, 'game-overlay')
  const sourceRoot = hasExe
    ? extractDir
    : fs.existsSync(path.join(nested, 'tosu-ingame-overlay.exe'))
      ? nested
      : null

  if (!sourceRoot) {
    console.warn('tosu-ingame-overlay.exe not found in overlay archive')
    fs.rmSync(extractDir, { recursive: true, force: true })
    return
  }

  fs.rmSync(overlayDir, { recursive: true, force: true })
  fs.cpSync(sourceRoot, overlayDir, { recursive: true })
  fs.rmSync(extractDir, { recursive: true, force: true })

  if (!fs.existsSync(path.join(overlayDir, 'version'))) {
    fs.writeFileSync(path.join(overlayDir, 'version'), version, 'utf8')
  }

  console.log(`game-overlay ${version} ready at ${overlayDir}`)
}

async function main() {
  const force = process.argv.includes('--force')
  if (fs.existsSync(TARGET) && !force) {
    console.log(`tosu binary already exists: ${TARGET}`)
    // Still try to ensure overlay is present for current version file
    const versionPath = path.join(RESOURCES_DIR, 'version')
    if (fs.existsSync(versionPath)) {
      try {
        const release = await getLatestRelease()
        const version = fs.readFileSync(versionPath, 'utf8').trim()
        await installOverlayAsset(release, version)
      } catch (err) {
        console.warn('Overlay check skipped:', err.message)
      }
    }
    return
  }

  if (!force && tryCopyLocal()) return

  fs.mkdirSync(RESOURCES_DIR, { recursive: true })

  console.log('Fetching latest tosu release...')
  const release = await getLatestRelease()
  const tag = release.tag_name
  const version = tag.replace(/^v/i, '')

  const assetName = isWin ? `tosu-windows-${tag}.zip` : `tosu-linux-${tag}.zip`
  const asset = release.assets.find((a) => a.name === assetName)
  if (!asset) {
    console.error('Asset not found:', assetName)
    console.error(
      'Available:',
      release.assets.map((a) => a.name).join(', ')
    )
    process.exit(1)
  }

  const zipPath = path.join(RESOURCES_DIR, asset.name)
  console.log(`Downloading ${asset.name} (${(asset.size / 1024 / 1024).toFixed(1)} MB)...`)
  const size = await download(asset.browser_download_url, zipPath)

  if (size < 10000) {
    throw new Error(`Downloaded file too small (${size} bytes), likely a redirect error`)
  }

  console.log('Extracting...')
  extractZip(zipPath, RESOURCES_DIR)
  fs.unlinkSync(zipPath)

  const found = findExe(RESOURCES_DIR)
  if (!found) {
    console.error('tosu binary not found after extraction. Contents:', fs.readdirSync(RESOURCES_DIR))
    process.exit(1)
  }

  if (found !== TARGET) {
    fs.copyFileSync(found, TARGET)
  }

  fs.writeFileSync(path.join(RESOURCES_DIR, 'version'), version, 'utf8')
  console.log(`tosu ${tag} ready at ${TARGET}`)

  await installOverlayAsset(release, version)
}

main().catch((err) => {
  console.error('Failed to download tosu:', err.message)
  process.exit(1)
})
