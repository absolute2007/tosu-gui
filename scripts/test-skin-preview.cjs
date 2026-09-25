const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const assert = require('node:assert/strict')
const ts = require('typescript')
const source = fs.readFileSync(path.join(__dirname, '../src/pages/SkinCustomizerPage.tsx'), 'utf8')
const ast = ts.createSourceFile('preview.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const names = new Set(['rgbToHsl', 'hslToRgb', 'rgbStringToRgb', 'tintHitcircleSprite', 'tintFollowpointSprite', 'loadSkinPreviewImage', 'FollowPointsInteractivePreview'])
const code = ast.statements.filter(node => ts.isFunctionDeclaration(node) && names.has(node.name?.text)).map(node => node.getText(ast)).join('\n')
let loads = 0, pending = [], raf = new Map(), nextId = 1, drawCalls = []
class ImageMock {
  complete = false; naturalWidth = 0; naturalHeight = 0
  set src(value) {
    this.url = value; loads++
    pending.push(() => {
      this.complete = true
      if (value === 'broken') { this.onerror?.(); return }
      this.naturalWidth = this.width = value === 'line' ? 128 : 64
      this.naturalHeight = this.height = value === 'line' ? 18 : 64
      this.onload?.()
    })
  }
}
function canvas() {
  const result = { width: 0, height: 0 }
  const ctx = new Proxy({
    drawImage(img, ...args) {
      assert.ok(img instanceof ImageMock ? img.complete && img.naturalWidth > 0 : img.width > 0, 'drawImage never receives an undecoded or broken image')
      drawCalls.push([img, ...args])
    },
    getImageData(x, y, w, h) { return { data: new Uint8ClampedArray(w * h * 4).fill(255) } },
    createRadialGradient() { return { addColorStop() {} } },
  }, { get(target, key) { return key in target ? target[key] : () => {} } })
  result.getContext = () => ctx
  return result
}
const mainCanvas = canvas()
const container = { getBoundingClientRect: () => ({ width: 440, height: 280 }) }
let slots = [], cursor = 0, effects = [], dirty = false
const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]))
const context = {
  exports: {},
  Image: ImageMock, HTMLImageElement: ImageMock,
  document: { createElement: canvas }, window: { devicePixelRatio: 1 }, performance: { now: () => 0 },
  requestAnimationFrame: fn => { const id = nextId++; raf.set(id, fn); return id },
  cancelAnimationFrame: id => raf.delete(id),
  useRef(value) { const i = cursor++; return slots[i] ||= { current: value } },
  useState(value) { const i = cursor++; slots[i] ||= { value }; return [slots[i].value, value => { slots[i].value = value; dirty = true }] },
  useMemo(fn, deps) { const i = cursor++; if (!same(slots[i]?.deps, deps)) slots[i] = { deps, value: fn() }; return slots[i].value },
  useEffect(fn, deps) { const i = cursor++; if (!same(slots[i]?.deps, deps)) effects.push(() => { slots[i]?.cleanup?.(); slots[i] = { deps, cleanup: fn() } }) },
  require: () => ({ jsx, jsxs: jsx }),
}
function jsx(type, props) {
  if (props.ref) props.ref.current = type === 'canvas' ? mainCanvas : container
  return { type, props }
}
vm.createContext(context)
vm.runInContext(ts.transpileModule(code, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context)
let props = { hue: 0, scale: 1, opacity: 100, editing: false, recolor: false, frames: [{ image: 'line', originalImage: 'line', pixelRatio: 1 }], hitcircleUrl: 'circle', approachCircleUrl: 'broken', overlayUrl: 'broken', digitImages: { 1: 'broken' } }
function render() {
  cursor = 0; dirty = false; effects = []
  context.FollowPointsInteractivePreview(props)
  effects.forEach(fn => fn())
}
async function decode() {
  pending.splice(0).forEach(fn => fn())
  await new Promise(resolve => setImmediate(resolve))
  if (dirty) render()
}
function tick(time) {
  drawCalls = []
  const callbacks = [...raf.values()]; raf.clear()
  callbacks.forEach(fn => fn(time))
  assert.equal(raf.size, 1, 'render loop remains running')
  return drawCalls.filter(call => call[0] instanceof ImageMock && call[0].url === 'line').map(call => call.slice(1))
}
async function main() {
  render(); tick(0)
  await decode()
  const first = tick(100)
  assert.ok(first.length > 0, 'skin lines render despite broken note textures')
  assert.deepEqual(tick(500), first, 'line frame and geometry are static')
  assert.deepEqual(tick(1500), first, 'transparent animation phases cannot hide lines')
  const before = loads
  for (let hue = 0; hue < 300; hue += 20) {
    props = { ...props, hue, editing: true, recolor: true, opacity: 70, scale: 1.2 }
    render(); tick(1600 + hue)
    assert.ok(drawCalls.some(call => !(call[0] instanceof ImageMock)), 'edited sprite stays visible')
  }
  assert.equal(loads, before, 'sliders do not reload any images')
  props = { ...props, frames: [{ image: 'broken', originalImage: 'broken', pixelRatio: 1 }], hitcircleUrl: 'broken' }
  render(); tick(2000); await decode(); tick(2100)
  props = { ...props, editing: false, frames: [{ image: 'line', originalImage: 'line', pixelRatio: 1 }] }
  render(); await decode(); assert.ok(tick(2200).length > 0, 'preview recovers after switching from a broken skin')
  console.log('PASS: actual preview renderer stays static, survives broken images and skin switching, and keeps sprites while dragging sliders.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
