import fs from 'fs'
import path from 'path'

const MARKER_START = '/* tosu-gui-aa-off */'
const MARKER_END = '/* /tosu-gui-aa-off */'

const AA_OFF_CSS = `${MARKER_START}
html, body, * {
  -webkit-font-smoothing: none !important;
  -moz-osx-font-smoothing: unset !important;
  font-smooth: never !important;
  text-rendering: geometricPrecision !important;
}
canvas {
  image-rendering: pixelated !important;
  image-rendering: crisp-edges !important;
}
${MARKER_END}
`

export function getStaticDir(tosuDir: string) {
  return path.join(tosuDir, 'static')
}

function walkCssFiles(dir: string, files: string[] = []): string[] {
  if (!fs.existsSync(dir)) return files
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walkCssFiles(full, files)
    else if (entry.name === 'index.css') files.push(full)
  }
  return files
}

function stripBlock(content: string) {
  const start = content.indexOf(MARKER_START)
  if (start === -1) return content
  const end = content.indexOf(MARKER_END, start)
  if (end === -1) return content.slice(0, start)
  return (content.slice(0, start) + content.slice(end + MARKER_END.length)).trimStart()
}

export function setOverlayAntialiasing(tosuDir: string, enabled: boolean) {
  const staticDir = getStaticDir(tosuDir)
  const cssFiles = walkCssFiles(staticDir)

  for (const file of cssFiles) {
    let content = fs.readFileSync(file, 'utf8')
    content = stripBlock(content)

    if (!enabled) {
      content = `${content.trimEnd()}\n\n${AA_OFF_CSS}\n`
    }

    fs.writeFileSync(file, content, 'utf8')
  }

  return cssFiles.length
}