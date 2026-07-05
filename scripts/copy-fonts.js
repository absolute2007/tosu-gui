const fs = require('fs')
const path = require('path')

const srcDir = path.join(__dirname, '..', 'node_modules', 'sf-pro', 'font', 'woff2')
const destDir = path.join(__dirname, '..', 'public', 'fonts')

if (!fs.existsSync(srcDir)) {
  console.log('sf-pro fonts not found, skipping')
  process.exit(0)
}

fs.mkdirSync(destDir, { recursive: true })

for (const file of fs.readdirSync(srcDir)) {
  if (!file.endsWith('.woff2')) continue
  fs.copyFileSync(path.join(srcDir, file), path.join(destDir, file))
}

console.log('SF Pro fonts copied to public/fonts')