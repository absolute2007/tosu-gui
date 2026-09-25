const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')
const { PNG } = require('pngjs')

const filename = path.resolve(__dirname, '../electron/skins-customizer.ts')
const compiled = new Module(filename, module)
compiled.filename = filename
compiled.paths = module.paths
compiled._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, filename)
const { readFollowPointFrames, selectFollowPointPreviewFrame, customizeSkinFollowPoints } = compiled.exports
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tosu-followpoints-'))
const makePng = (width, height, rgba) => {
  const png = new PNG({ width, height })
  for (let i = 0; i < png.data.length; i += 4) png.data.set(rgba, i)
  return PNG.sync.write(png)
}
const decode = (url) => Buffer.from(url.split(',')[1], 'base64')

async function main() {
  const skin = path.join(root, 'skin')
  const backup = path.join(skin, '.tosu-backup', 'files')
  fs.mkdirSync(backup, { recursive: true })
  fs.writeFileSync(path.join(skin, 'skin.ini'), '[General]\nName: Test\n')
  const transparent = makePng(1, 1, [0, 0, 0, 0])
  const line = makePng(128, 50, [255, 255, 255, 26])
  const original = makePng(128, 50, [17, 120, 231, 80])
  fs.writeFileSync(path.join(skin, 'followpoint-0.png'), transparent)
  fs.writeFileSync(path.join(skin, 'followpoint-1.png'), line)
  fs.writeFileSync(path.join(backup, 'followpoint-1.png'), original)
  fs.writeFileSync(path.join(skin, 'followpoint-3.png'), line)
  let frames = readFollowPointFrames(skin, backup)
  assert.equal(frames.length, 3, 'static preview includes frames after numbering gaps')
  assert.equal(selectFollowPointPreviewFrame(frames).fileName, 'followpoint-1.png', 'static preview skips transparent lead-in frames')
  assert.deepEqual(decode(frames[0].image), transparent, 'transparent first frame is preserved')
  assert.deepEqual(decode(frames[1].image), line, 'initial preview uses current PNG bytes')
  assert.deepEqual(decode(frames[1].originalImage), original, 'backup is used only for editing')

  const staticSkin = path.join(root, 'static')
  fs.mkdirSync(staticSkin)
  fs.writeFileSync(path.join(staticSkin, 'skin.ini'), '[General]\nName: Static\n')
  fs.writeFileSync(path.join(staticSkin, 'followpoint.png'), line)
  const hd = makePng(256, 100, [255, 255, 255, 26])
  fs.writeFileSync(path.join(staticSkin, 'followpoint@2x.png'), hd)
  frames = readFollowPointFrames(staticSkin)
  assert.equal(frames[0].pixelRatio, 2)
  assert.deepEqual(decode(frames[0].image), hd)
  await customizeSkinFollowPoints(staticSkin, { hue: 200, scale: 1.5, opacity: 100, recolor: false })
  let changed = PNG.sync.read(fs.readFileSync(path.join(staticSkin, 'followpoint.png')))
  assert.equal(changed.width, 192)
  assert.equal(changed.height, 75)
  assert.deepEqual(Array.from(changed.data.subarray(0, 4)), [255, 255, 255, 26], 'size edits preserve colour and alpha')
  await customizeSkinFollowPoints(staticSkin, { hue: 0, scale: 1, opacity: 50, recolor: true })
  changed = PNG.sync.read(fs.readFileSync(path.join(staticSkin, 'followpoint.png')))
  assert.equal(changed.width, 128, 'subsequent edits use the original size')
  assert.equal(changed.data[3], 13, 'opacity applied once to original pixels')
  assert.ok(changed.data[0] - changed.data[1] > 150, 'explicit colour choice tints white pixels')
  const data = await customizeSkinFollowPoints(staticSkin, { hue: 0, scale: 1, opacity: 100, recolor: false })
  changed = PNG.sync.read(fs.readFileSync(path.join(staticSkin, 'followpoint.png')))
  assert.deepEqual(Array.from(changed.data.subarray(0, 4)), [255, 255, 255, 26])
  assert.equal(data.tweaks.find(t => t.id === 'follow-points').meta.recolor, false)

  if (process.argv[2]) {
    const actual = readFollowPointFrames(path.resolve(process.argv[2]))
    assert.ok(actual.length > 0)
    for (const frame of actual) assert.deepEqual(decode(frame.image), fs.readFileSync(path.join(process.argv[2], frame.fileName)))
    console.log('Real skin: ' + actual.length + ' frames, exact PNG bytes verified.')
  }
  console.log('PASS: original PNGs, transparent frames, animation order, HD resolution, colour-preserving scaling, recolour and opacity.')
}
main().catch(error => { console.error(error); process.exitCode = 1 }).finally(() => {
  assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()))
  assert.ok(path.basename(root).startsWith('tosu-followpoints-'))
  fs.rmSync(root, { recursive: true, force: true })
})
