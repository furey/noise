import fs from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

export const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const mediaDir = path.join(appRoot, 'docs', 'media')
export const FPS = 30
export const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

export const BACKDROP = '#0c0c0e'
const BEZEL = '#000000'
const RIM = '#2a2a2f'
const CHROME_BAR = '#1c1c1f'
const CHROME_DOT = '#3b3b41'
const CHROME_PILL = '#26262a'

export const desktopFrame = ({ x, y, w, h, bar }) => {
  const r = 12
  const hole = [
    `M${x} ${y + bar}H${x + w}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}`,
    `H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}Z`,
  ].join('')
  const scale = bar / 40
  const dots = [0, 1, 2].map(i => `<circle cx="${x + (20 + i * 20) * scale}" cy="${y + bar / 2}" r="${6 * scale}" fill="${CHROME_DOT}"/>`)
  const pillW = Math.min(420 * scale, w * 0.4)
  return {
    under: `<path fill-rule="evenodd" fill="${RIM}" d="${roundedRect({ x: x - 1, y: y - 1, w: w + 2, h: h + 2, r: r + 1 })}${roundedRect({ x, y, w, h, r })}"/>`,
    body: `<path fill-rule="evenodd" fill="${CHROME_BAR}" d="${roundedRect({ x, y, w, h, r })}${hole}"/>`
      + dots.join('')
      + `<rect x="${x + (w - pillW) / 2}" y="${y + bar * 0.22}" width="${pillW}" height="${bar * 0.56}" rx="${bar * 0.28}" fill="${CHROME_PILL}"/>`,
    outline: roundedRect({ x: x - 1, y: y - 1, w: w + 2, h: h + 2, r: r + 1 }),
  }
}

export const deviceFrame = ({ x, y, w, h, bezel, screenRadius }) => {
  const outer = { x: x - bezel, y: y - bezel, w: w + bezel * 2, h: h + bezel * 2, r: screenRadius + bezel }
  const rim = Math.max(1, bezel / 14)
  return {
    under: `<path fill-rule="evenodd" fill="${RIM}" d="${roundedRect({ x: outer.x - rim, y: outer.y - rim, w: outer.w + rim * 2, h: outer.h + rim * 2, r: outer.r + rim })}${roundedRect(outer)}"/>`,
    body: `<path fill-rule="evenodd" fill="${BEZEL}" d="${roundedRect(outer)}${roundedRect({ x, y, w, h, r: screenRadius })}"/>`
      + `<circle cx="${x + w / 2}" cy="${y - bezel / 2}" r="${Math.max(2, bezel / 7)}" fill="#141417"/>`,
    outline: roundedRect({ x: outer.x - rim, y: outer.y - rim, w: outer.w + rim * 2, h: outer.h + rim * 2, r: outer.r + rim }),
  }
}

export const frameSvg = ({ width, height, shapes }) => {
  const outlines = shapes.map(shape => shape.outline).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`
    + `<path fill-rule="evenodd" fill="${BACKDROP}" d="M0 0H${width}V${height}H0Z${outlines}"/>`
    + shapes.map(shape => shape.under + shape.body).join('')
    + '</svg>'
}

export const launchBrowser = () => chromium.launch({ executablePath: CHROME, headless: true })

export const openApp = async ({ browser, url, viewport, dpr, settings, insets }) => {
  const context = await browser.newContext({ viewport, deviceScaleFactor: dpr, bypassCSP: true, serviceWorkers: 'block' })
  const workletSource = await fs.readFile(path.join(appRoot, 'src', 'audio', 'noise.worklet.js'), 'utf8')
  await context.addInitScript(installHarness, { workletSource, settings, insets })
  const page = await context.newPage()
  await page.goto(url)
  await page.waitForFunction(() => globalThis.document.getElementById('spec')?.width > 0)
  await page.evaluate(() => globalThis.demo.step(0, null))
  return { context, page }
}

export const stepApp = (page, { dt, pointer }) => page.evaluate(([ms, look]) => globalThis.demo.step(ms, look), [dt, pointer])

export const automationLog = page => page.evaluate(() => globalThis.demo.log)

export const virtualNow = page => page.evaluate(() => globalThis.demo.now())

export const renderSvg = async ({ browser, svg, width, height, out }) => {
  const page = await browser.newPage({ viewport: { width, height } })
  await page.setContent(`<!doctype html><style>html,body{margin:0;background:transparent}svg{display:block}</style>${svg}`)
  await page.screenshot({ path: out, omitBackground: true })
  await page.close()
}

export const run = promisify(execFile)

export const ffmpeg = args => run('ffmpeg', ['-y', '-v', 'error', ...args], { maxBuffer: 1 << 26 })

export const roundedRect = ({ x, y, w, h, r }) => [
  `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}`,
  `A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}`,
  `V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`,
].join('')

export const ensureDir = dir => fs.mkdir(dir, { recursive: true })

const installHarness = ({ workletSource, settings, insets }) => {
  const { document, localStorage, dispatchEvent } = globalThis
  const SAMPLE_RATE = 48000
  const BLOCK = 128
  const clock = { now: 0 }
  const log = []
  const frames = new Map()
  const seen = new WeakMap()
  const nodes = []
  const analysers = []
  let frameId = 0
  if (settings) localStorage.setItem('noise-settings', JSON.stringify(settings))
  performance.now = () => clock.now
  globalThis.requestAnimationFrame = callback => {
    frameId += 1
    frames.set(frameId, callback)
    return frameId
  }
  globalThis.cancelAnimationFrame = id => frames.delete(id)
  const seconds = () => clock.now / 1000
  const createParam = (name, initial) => {
    const segments = [{ time: 0, target: initial, tc: 0, from: initial }]
    const valueAt = time => {
      let value = initial
      for (const segment of segments) {
        if (segment.time > time) break
        value = segment.tc
          ? segment.target + (segment.from - segment.target) * Math.exp(-(time - segment.time) / segment.tc)
          : segment.target
      }
      return value
    }
    const push = segment => {
      const from = valueAt(segment.time)
      while (segments.length && segments.at(-1).time > segment.time) segments.pop()
      segments.push({ ...segment, from })
      log.push({ param: name, ...segment })
    }
    return {
      valueAt,
      get value() { return valueAt(seconds()) },
      set value(target) { push({ time: seconds(), target, tc: 0 }) },
      setTargetAtTime: (target, time, tc) => push({ time, target, tc }),
      cancelScheduledValues: () => {},
    }
  }
  const connectable = extra => ({ ...extra, connect: target => target, disconnect: () => {} })
  const loadProcessor = () => {
    let Processor
    new Function('AudioWorkletProcessor', 'registerProcessor', workletSource)(class {}, (_name, cls) => { Processor = cls })
    return new Processor()
  }
  class FakeContext {
    constructor() {
      this.sampleRate = SAMPLE_RATE
      this.state = 'running'
      this.destination = connectable({})
      this.audioWorklet = { addModule: async () => {} }
      log.push({ param: 'context', time: seconds() })
    }
    get currentTime() { return seconds() }
    createGain() { return connectable({ gain: createParam('gain', 1) }) }
    createAnalyser() {
      const analyser = createAnalyser()
      analysers.push(analyser)
      return analyser
    }
    createDynamicsCompressor() {
      const knob = () => ({ value: 0 })
      return connectable({ threshold: knob(), knee: knob(), ratio: knob(), attack: knob(), release: knob() })
    }
    async resume() { this.state = 'running' }
    async suspend() { this.state = 'suspended' }
    async close() { this.state = 'closed' }
  }
  class FakeWorkletNode {
    constructor(_ctx, _name, options) {
      const position = createParam('position', options.parameterData.position)
      log.push({ param: 'node', time: seconds(), target: options.parameterData.position })
      this.parameters = new Map([['position', position]])
      this.processor = loadProcessor()
      this.time = seconds()
      nodes.push(this)
    }
    connect(target) { return target }
  }
  const ring = { data: new Float32Array(32768), write: 0 }
  const pushSamples = (left, right) => {
    for (let i = 0; i < left.length; i++) {
      ring.data[ring.write] = (left[i] + right[i]) / 2
      ring.write = (ring.write + 1) % ring.data.length
    }
  }
  const generate = until => {
    for (const node of nodes) {
      while (node.time + BLOCK / SAMPLE_RATE <= until) {
        const output = [[new Float32Array(BLOCK), new Float32Array(BLOCK)]]
        const position = node.parameters.get('position').valueAt(node.time)
        node.processor.process([], output, { position: new Float32Array([position]) })
        pushSamples(output[0][0], output[0][1])
        node.time += BLOCK / SAMPLE_RATE
      }
    }
  }
  const swap = (re, im, i, j) => {
    const r = re[i]
    const m = im[i]
    re[i] = re[j]
    im[i] = im[j]
    re[j] = r
    im[j] = m
  }
  const fft = (re, im) => {
    const n = re.length
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1
      for (; j & bit; bit >>= 1) j ^= bit
      j ^= bit
      if (i < j) swap(re, im, i, j)
    }
    for (let size = 2; size <= n; size <<= 1) {
      const angle = -2 * Math.PI / size
      for (let start = 0; start < n; start += size) {
        for (let k = 0; k < size / 2; k++) {
          const cos = Math.cos(angle * k)
          const sin = Math.sin(angle * k)
          const a = start + k
          const b = a + size / 2
          const tre = re[b] * cos - im[b] * sin
          const tim = re[b] * sin + im[b] * cos
          re[b] = re[a] - tre
          im[b] = im[a] - tim
          re[a] += tre
          im[a] += tim
        }
      }
    }
  }
  const createAnalyser = () => {
    const analyser = connectable({ fftSize: 2048, smoothingTimeConstant: 0.8, minDecibels: -100, maxDecibels: -30 })
    const state = { smooth: null, at: -1, db: null }
    Object.defineProperty(analyser, 'frequencyBinCount', { get: () => analyser.fftSize / 2 })
    analyser.getFloatFrequencyData = out => {
      const n = analyser.fftSize
      if (state.at !== clock.now || !state.db || state.db.length !== n / 2) {
        if (!state.smooth || state.smooth.length !== n / 2) state.smooth = new Float64Array(n / 2)
        const re = new Float64Array(n)
        const im = new Float64Array(n)
        for (let i = 0; i < n; i++) {
          const sample = ring.data[(ring.write - n + i + ring.data.length) % ring.data.length]
          const window = 0.42 - 0.5 * Math.cos(2 * Math.PI * i / n) + 0.08 * Math.cos(4 * Math.PI * i / n)
          re[i] = sample * window
        }
        fft(re, im)
        const tau = analyser.smoothingTimeConstant
        state.db = new Float32Array(n / 2)
        for (let k = 0; k < n / 2; k++) {
          const magnitude = Math.hypot(re[k], im[k]) / n
          state.smooth[k] = tau * state.smooth[k] + (1 - tau) * magnitude
          state.db[k] = 20 * Math.log10(state.smooth[k] || 1e-12)
        }
        state.at = clock.now
      }
      out.set(state.db.subarray(0, out.length))
    }
    return analyser
  }
  globalThis.AudioContext = FakeContext
  globalThis.webkitAudioContext = undefined
  globalThis.AudioWorkletNode = FakeWorkletNode
  globalThis.MediaStreamAudioDestinationNode = undefined
  const overlay = { dot: null, ring: null }
  const buildOverlay = () => {
    const make = css => {
      const el = document.createElement('div')
      el.style.cssText = `position:fixed;left:0;top:0;pointer-events:none;z-index:99;border-radius:50%;opacity:0;${css}`
      document.body.append(el)
      return el
    }
    overlay.ring = make('border:2px solid #fff;box-sizing:border-box;box-shadow:0 0 0 1px rgba(0,0,0,.25)')
    overlay.dot = make('background:#fff;box-shadow:0 0 0 2px rgba(0,0,0,.45),0 2px 10px rgba(0,0,0,.4)')
    if (insets) {
      const style = document.createElement('style')
      style.textContent = `#insets{padding:${insets.top}px ${insets.right}px ${insets.bottom}px ${insets.left}px !important}`
      document.head.append(style)
      dispatchEvent(new Event('resize'))
    }
  }
  const place = (el, { x, y, size, alpha }) => {
    el.style.width = el.style.height = `${size}px`
    el.style.transform = `translate(${x - size / 2}px,${y - size / 2}px)`
    el.style.opacity = String(alpha)
  }
  const drawPointer = look => {
    if (!overlay.dot) return
    if (!look) {
      overlay.dot.style.opacity = overlay.ring.style.opacity = '0'
      return
    }
    place(overlay.dot, { x: look.x, y: look.y, size: look.size, alpha: look.alpha })
    place(overlay.ring, { x: look.x, y: look.y, size: look.ringSize, alpha: look.ringAlpha })
  }
  const settleAnimations = () => {
    for (const animation of document.getAnimations()) {
      if (!seen.has(animation)) seen.set(animation, clock.now)
      animation.pause()
      animation.currentTime = clock.now - seen.get(animation)
    }
  }
  const step = (ms, look) => {
    clock.now += ms
    generate(seconds())
    settleAnimations()
    const callbacks = [...frames.values()]
    frames.clear()
    callbacks.forEach(callback => callback(clock.now))
    settleAnimations()
    drawPointer(look)
  }
  document.addEventListener('DOMContentLoaded', buildOverlay)
  globalThis.demo = { step, log, now: () => clock.now }
}
