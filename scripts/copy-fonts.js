const fs = require('fs')
const path = require('path')

const srcDir = path.join(__dirname, '..', 'node_modules', 'sf-pro', 'font', 'woff2')
const destDirs = [
  path.join(__dirname, '..', 'public', 'fonts'),
  // In-game Maps Browser overlay — same family as the desktop GUI
  path.join(__dirname, '..', 'resources', 'maps-counter', 'fonts'),
]

if (!fs.existsSync(srcDir)) {
  console.log('sf-pro fonts not found, skipping')
  process.exit(0)
}

const files = fs.readdirSync(srcDir).filter((file) => file.endsWith('.woff2'))
for (const destDir of destDirs) {
  fs.mkdirSync(destDir, { recursive: true })
  for (const file of files) {
    fs.copyFileSync(path.join(srcDir, file), path.join(destDir, file))
  }
}

console.log('SF Pro fonts copied to public/fonts and resources/maps-counter/fonts')
