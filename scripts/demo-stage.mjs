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
const STAGE = { glow: '#1d1d24', deskTop: '#1e1e24', deskBottom: '#0a0a0c', spill: 0.06, deskRise: 1 / 6 }

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
    bounds: { top: y, bottom: y + h },
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
    bounds: { top: outer.y, bottom: outer.y + outer.h },
    under: `<path fill-rule="evenodd" fill="${RIM}" d="${roundedRect({ x: outer.x - rim, y: outer.y - rim, w: outer.w + rim * 2, h: outer.h + rim * 2, r: outer.r + rim })}${roundedRect(outer)}"/>`,
    body: `<path fill-rule="evenodd" fill="${BEZEL}" d="${roundedRect(outer)}${roundedRect({ x, y, w, h, r: screenRadius })}"/>`
      + `<circle cx="${x + w / 2}" cy="${y - bezel / 2}" r="${Math.max(2, bezel / 7)}" fill="#141417"/>`,
    outline: roundedRect({ x: outer.x - rim, y: outer.y - rim, w: outer.w + rim * 2, h: outer.h + rim * 2, r: outer.r + rim }),
  }
}

export const frameSvg = ({ width, height, shapes, stage = false }) => {
  const room = `M0 0H${width}V${height}H0Z${shapes.map(shape => shape.outline).join('')}`
  const backdrop = stage
    ? stageSvg({ width, height, room, deskY: deskLine(shapes) })
    : `<path fill-rule="evenodd" fill="${BACKDROP}" d="${room}"/>`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`
    + backdrop
    + shapes.map(shape => shape.under + shape.body).join('')
    + '</svg>'
}

const deskLine = shapes => {
  const base = Math.max(...shapes.map(({ bounds }) => bounds.bottom))
  const tallest = Math.max(...shapes.map(({ bounds }) => bounds.bottom - bounds.top))
  return Math.round(base - tallest * STAGE.deskRise)
}

const stageSvg = ({ width, height, room, deskY }) => {
  const cx = width / 2
  const oval = (cy, ry) => `gradientUnits="userSpaceOnUse" cx="${cx}" cy="${cy}" r="${width / 2}" `
    + `gradientTransform="translate(${cx} ${cy}) scale(1 ${ry}) translate(${-cx} ${-cy})"`
  return '<defs>'
    + `<radialGradient id="glow" ${oval(deskY * 0.62, 0.5)}><stop offset="0" stop-color="${STAGE.glow}"/><stop offset="1" stop-color="${BACKDROP}"/></radialGradient>`
    + `<linearGradient id="desk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${STAGE.deskTop}"/><stop offset="1" stop-color="${STAGE.deskBottom}"/></linearGradient>`
    + `<radialGradient id="spill" ${oval(deskY, 0.18)}><stop offset="0" stop-color="#fff" stop-opacity="${STAGE.spill}"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>`
    + `<clipPath id="room"><path clip-rule="evenodd" d="${room}"/></clipPath>`
    + '</defs><g clip-path="url(#room)">'
    + `<rect width="${width}" height="${deskY}" fill="url(#glow)"/>`
    + `<rect y="${deskY}" width="${width}" height="${height - deskY}" fill="url(#desk)"/>`
    + `<rect y="${deskY}" width="${width}" height="${height - deskY}" fill="url(#spill)"/>`
    + '</g>'
}

export const launchBrowser = () => chromium.launch({ executablePath: CHROME, headless: true, args: ['--disable-gpu'] })

export const openApp = async ({ browser, url, viewport, dpr, settings, insets, touch = false }) => {
  const context = await browser.newContext({ viewport, deviceScaleFactor: dpr, hasTouch: touch, bypassCSP: true, serviceWorkers: 'block' })
  await addHarness({ context, settings, insets })
  const page = await context.newPage()
  await page.goto(url)
  await page.waitForFunction(() => globalThis.document.getElementById('spec')?.width > 0)
  await page.evaluate(() => globalThis.demo.step(0, null))
  return { context, page }
}

export const addHarness = async ({ context, settings, insets, mac = false, song = null }) => {
  const worklets = { noise: await workletSource('noise'), music: await workletSource('music') }
  await context.addInitScript(installHarness, { worklets, settings, insets, mac, song })
}

export const workletSource = name => fs.readFile(path.join(appRoot, 'src', 'audio', `${name}.worklet.js`), 'utf8')

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

const installHarness = ({ worklets, settings, insets, mac, song }) => {
  const { document, localStorage, dispatchEvent } = globalThis
  if (globalThis.location.pathname.startsWith('/__scene')) return
  const SAMPLE_RATE = 48000
  const BLOCK = 128
  const RANDOM_SEED = 0x6e6f6973
  const EPOCH_MS = Date.UTC(2026, 0, 1)
  const GAIN_NAMES = ['noise-gain', 'master-gain', 'music-gain']
  const seededRandom = seed => {
    let state = seed >>> 0
    return () => {
      state = (state + 0x6d2b79f5) >>> 0
      let t = state
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }
  const clock = { now: 0 }
  const log = []
  const frames = new Map()
  const seen = new WeakMap()
  const nodes = []
  const analysers = []
  const mediaNodes = []
  let frameId = 0
  Math.random = seededRandom(RANDOM_SEED)
  Date.now = () => EPOCH_MS + clock.now
  Object.defineProperty(Event.prototype, 'timeStamp', { get: () => clock.now })
  if (settings) localStorage.setItem('noise-settings', JSON.stringify(settings))
  performance.now = () => clock.now
  globalThis.requestAnimationFrame = callback => {
    frameId += 1
    frames.set(frameId, callback)
    return frameId
  }
  globalThis.cancelAnimationFrame = id => frames.delete(id)
  const timers = new Map()
  let timerId = 0
  const addTimer = (callback, delay, every) => {
    timerId += 1
    timers.set(timerId, { callback, at: clock.now + Math.max(0, delay || 0), every })
    return timerId
  }
  globalThis.setTimeout = (callback, delay) => addTimer(callback, delay, 0)
  globalThis.setInterval = (callback, delay) => addTimer(callback, delay, Math.max(1, delay || 0))
  globalThis.clearTimeout = globalThis.clearInterval = id => timers.delete(id)
  const runTimers = () => {
    for (;;) {
      const due = [...timers.entries()].filter(([, timer]) => timer.at <= clock.now).sort((a, b) => a[1].at - b[1].at)[0]
      if (!due) return
      const [id, timer] = due
      if (timer.every) timer.at += timer.every
      else timers.delete(id)
      timer.callback()
    }
  }
  if (mac) {
    document.addEventListener('readystatechange', () => {
      if (document.readyState !== 'interactive') return
      document.documentElement.classList.add('desktop', 'mac')
      const strip = document.createElement('div')
      strip.className = 'titlebar'
      document.body.prepend(strip)
    })
  }
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
      setValueAtTime: (target, time) => push({ time, target, tc: 0 }),
      cancelScheduledValues: () => {},
    }
  }
  const connectable = extra => ({ ...extra, connect: target => target, disconnect: () => {} })
  const loadProcessor = (name, options) => {
    let Processor
    new Function('AudioWorkletProcessor', 'registerProcessor', 'sampleRate', worklets[name])(class {}, (_name, cls) => { Processor = cls }, SAMPLE_RATE)
    return new Processor(options)
  }
  class FakeContext {
    constructor() {
      this.sampleRate = SAMPLE_RATE
      this.state = 'running'
      this.destination = connectable({})
      this.audioWorklet = { addModule: async () => {} }
      this.gains = 0
      log.push({ param: 'context', time: seconds() })
    }
    get currentTime() { return seconds() }
    addEventListener() {}
    createGain() {
      const name = GAIN_NAMES[this.gains] ?? `gain-${this.gains}`
      this.gains += 1
      return connectable({ gain: createParam(name, 1), name })
    }
    createAnalyser() {
      const analyser = createAnalyser()
      analysers.push(analyser)
      return analyser
    }
    createMediaElementSource(element) {
      const node = { element, output: null }
      node.connect = target => {
        node.output = target
        return target
      }
      node.disconnect = () => {
        node.output = null
      }
      mediaNodes.push(node)
      return node
    }
    createDynamicsCompressor() {
      const knob = () => ({ value: 0 })
      return connectable({ threshold: knob(), knee: knob(), ratio: knob(), attack: knob(), release: knob() })
    }
    async resume() { this.state = 'running' }
    async suspend() { this.state = 'suspended' }
    async close() { this.state = 'closed' }
  }
  const graph = { time: null }
  const paramName = (node, key) => node === 'noise' ? key : `${node}-${key}`
  class FakeWorkletNode {
    constructor(_ctx, name, options) {
      const { parameterData, processorOptions } = options
      this.parameters = new Map(Object.entries(parameterData).map(([key, value]) => [key, createParam(paramName(name, key), value)]))
      log.push(name === 'noise'
        ? { param: 'node', time: seconds(), target: parameterData.position }
        : { param: `${name}-node`, time: seconds(), initial: parameterData, options: processorOptions })
      this.processor = loadProcessor(name, { processorOptions })
      this.output = null
      graph.time ??= seconds()
      nodes.push(this)
    }
    connect(target) {
      this.output = target
      return target
    }
  }
  const ring = { data: new Float32Array(32768), write: 0 }
  const blockParameters = (node, time) => Object.fromEntries(
    [...node.parameters].map(([key, param]) => [key, new Float32Array([param.valueAt(time)])]),
  )
  const addNode = ({ node, time, mix }) => {
    const level = node.output?.gain?.valueAt(time) ?? 0
    const output = [[new Float32Array(BLOCK), new Float32Array(BLOCK)]]
    node.processor.process([], output, blockParameters(node, time))
    for (let i = 0; i < BLOCK; i++) mix[i] += (output[0][0][i] + output[0][1][i]) / 2 * level
  }
  const pushSamples = samples => {
    for (const sample of samples) {
      ring.data[ring.write] = sample
      ring.write = (ring.write + 1) % ring.data.length
    }
  }
  const addSong = ({ node, time, mix }) => {
    const { element, output } = node
    if (!output || element.paused || !songSamples) return
    const level = output.gain.valueAt(time)
    for (let i = 0; i < BLOCK; i++) mix[i] += (songSamples[element.position + i] ?? 0) * level
    element.position += BLOCK
  }
  const generate = until => {
    if (!nodes.length) return
    while (graph.time + BLOCK / SAMPLE_RATE <= until) {
      const mix = new Float32Array(BLOCK)
      for (const node of nodes) addNode({ node, time: graph.time, mix })
      for (const node of mediaNodes) addSong({ node, time: graph.time, mix })
      pushSamples(mix)
      graph.time += BLOCK / SAMPLE_RATE
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
  const decodeSong = base64 => {
    const bytes = Uint8Array.from(globalThis.atob(base64), char => char.charCodeAt(0))
    const pcm = new Int16Array(bytes.buffer)
    return Float32Array.from(pcm, sample => sample / 32768)
  }

  const installSong = ({ song, log, seconds, mediaNodes, SAMPLE_RATE }) => {
    const gainOf = element => mediaNodes.find(node => node.element === element)?.output?.name ?? null
    class DemoAudio extends EventTarget {
      constructor() {
        super()
        Object.assign(this, { preload: '', paused: true, position: 0, duration: song.durationS, source: '' })
      }
      get src() { return this.source }
      set src(value) {
        this.source = value
        globalThis.setTimeout(() => this.dispatchEvent(new Event('loadedmetadata')), 0)
      }
      get currentTime() { return this.position / SAMPLE_RATE }
      set currentTime(value) { this.position = Math.max(0, Math.round(value * SAMPLE_RATE)) }
      play() {
        if (!this.paused) return Promise.resolve()
        this.paused = false
        log.push({ param: 'track-play', time: seconds(), from: this.position / SAMPLE_RATE, gain: gainOf(this) })
        globalThis.setTimeout(() => this.dispatchEvent(new Event('playing')), 0)
        return Promise.resolve()
      }
      pause() {
        if (this.paused) return
        this.paused = true
        log.push({ param: 'track-pause', time: seconds() })
      }
      load() { this.pause() }
      removeAttribute() { this.source = '' }
      setAttribute() {}
    }
    globalThis.Audio = DemoAudio
    const later = (value, ms) => new Promise(resolve => globalThis.setTimeout(() => resolve(value), ms))
    const [best] = song.catalogue
    globalThis.noiseDesktop = {
      onAutoHide: () => {},
      setChromeHidden: () => {},
      pointerEntered: () => {},
      onCommand: () => {},
      setMenuState: () => {},
      music: {
        onStatus: listener => { globalThis.setTimeout(() => listener({ ready: true }), 0) },
        search: query => later({ tracks: query.trim().length > 1 ? song.catalogue : [] }, song.searchMs),
        play: track => later({ url: 'demo:song', track: track.id === best.id ? best : track, cached: false }, song.loadMs),
        cached: () => later({ entries: [] }, 0),
        advance: () => later({ error: { code: 'not-found', message: 'Demo ends here' } }, 0),
        prepare: () => later({ ok: true }, 0),
        setSearchOpen: () => {},
      },
    }
  }
  const songSamples = song ? decodeSong(song.samples) : null
  if (song) installSong({ song, log, seconds, mediaNodes, SAMPLE_RATE })
  globalThis.AudioContext = FakeContext
  globalThis.webkitAudioContext = undefined
  globalThis.MediaStreamAudioDestinationNode = undefined
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
    runTimers()
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

