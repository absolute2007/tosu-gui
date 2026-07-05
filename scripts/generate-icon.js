const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const root = path.join(__dirname, '..')
const svgPath = path.join(root, 'public', 'icon.svg')
const publicPng = path.join(root, 'public', 'icon.png')
const resourcesPng = path.join(root, 'resources', 'icon.png')
const resourcesIco = path.join(root, 'resources', 'icon.ico')

async function main() {
  if (!fs.existsSync(svgPath)) {
    console.log('icon.svg not found, skipping icon generation')
    return
  }

  let sharp
  try {
    sharp = require('sharp')
  } catch {
    console.log('sharp not installed, copying svg only')
    return
  }

  fs.mkdirSync(path.join(root, 'resources'), { recursive: true })

  const pngBuffer = await sharp(svgPath).resize(512, 512).png().toBuffer()
  fs.writeFileSync(publicPng, pngBuffer)
  fs.writeFileSync(resourcesPng, pngBuffer)

  try {
    const pngToIco = require('png-to-ico')
    const icoBuffer = await pngToIco(pngBuffer)
    fs.writeFileSync(resourcesIco, icoBuffer)
    console.log('Generated icon.png and icon.ico')
  } catch {
    console.log('Generated icon.png (png-to-ico unavailable)')
  }
}

main().catch((err) => {
  console.error('Icon generation failed:', err.message)
})