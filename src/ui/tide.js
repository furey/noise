import { COLOURS, LAST, LIGHT_INK, colourAt, inkRgb, isDarkInk, mixRgb, paletteFor, rgba } from './colours.js'
import { reassignChips, stepChips } from './chips.js'
import { buildDotAtlas, clearEmbers, createEmbers, drawEmbers, pickBudget, spawnEmber, stepEmbers } from './embers.js'
import { createGlEmbers, drawGlEmbers } from './embers-gl.js'
import { INTRO_FADE_MS, INTRO_HOLD_MS, INTRO_JITTER, INTRO_MS, INTRO_PATTERNS, INTRO_SPREAD_MS, pickPattern } from './intro.js'
import { glyphStroke, traceNoteGlyph, tracePlus, traceWaveGlyph } from './glyphs.js'
import { thumbX, musicBox, timerBox, timerWidth, waveBox } from './layout.js'
import {
  createRadial, flight, flockProgress, innerRadiusAt, isRadialSettled, linearShare, meanRadius, radialBloom, stepRadial, tipAngle,
} from './radial.js'
import { createSpectrum, decaySpectrum, readSpectrum, resizeSpectrum } from './spectrum.js'
import { createStrip, stepStrip, STRIP_REVEAL_MS } from './strip.js'
import { timerAlpha, timerSize } from './timer.js'
import { clearGlWater, createGlWater, drawGlWater } from './water-gl.js'

const INK_TINT_S = 0.4
const ATTACK_PER_S = 40
const RELEASE_PER_S = 18
const ENERGY_S = 0.6
const ENERGY_DROP_S = 0.25
const MEAN_PER_S = 0.45
const MEAN_CATCH_PER_S = 6
const MEAN_CATCH_GAP = 0.03
const CREST_DRIFT = 1.4
const IDLE_SETTLE = 30
const LAYER_SNAP = 0.002
const SWELL_PER_S = 3
const SWELL_DROP_PER_S = 8
const MAX_DRIFT = 0.04
const DRIFT_SIGMA = 0.014
const RING_LIFT = 0.45
const SPLASH_PX = 3
const CREST_PX = 4
const IDLE_CREST_PX = 2
const PEAK_LINE_PX = 1.5
const FOAM_ALPHA = 0.3
const IDLE_CREST_ALPHA = 0.18
const IDLE_SWELL = 0.35
const QUIET_SPREAD = 1.5
const QUIET_DRIFT_FLOOR = 0.6
const BODY_SHADE = 'rgba(0,0,0,.08)'
const DEEP_DARKEN = 0.86
const DEEP_ALPHA = 0.96
const SNAP_READY = 0.05
const GRAVITY_PER_S2 = 6
const BOUNCE_KEEP = 0.28
const BOUNCE_FROM_PER_S = 0.5
const LINE_BULGE_PX = 10
const BULGE_WIDTH_PX = 36
const BULGE_PER_S = 14
const LINE_STEP_PX = 2
const THUMB_RING_PX = 2.5
const SURFACE_ALPHA = 0.04
const CORE_ALPHA = 0.16
const RING_DRIFT = 0.45
const FLOCK_DOT_PX = 2.6
const SETTLE_FROM = 0.97
const SETTLE_STAGGER = 0.02
const BULGE_GROW = 0.4
const LAYERS = [
  { alpha: 0.22, rest: 8, lift: 0.064, gain: 5.4, rate: 7, blur: 1 },
  { alpha: 0.17, rest: 24, lift: 0.12, gain: 12, rate: 3.2, blur: 2 },
  { alpha: 0.13, rest: 55, lift: 0.19, gain: 21.6, rate: 1.6, blur: 2 },
]
const MASK_STOPS = 12
const STRIP_RISE_PX = 16
const CONTAINER_ALPHA = 0.22
const DISABLED_ALPHA = 0.4
const BOUNDS_MARGIN_PX = 1

const SPARK_FLOOR = 0.12
const SPARK_CURVE = 1.4
const DARK_DOT = [15, 23, 42]
const BURST_PER_PX = 0.8
const SIMMER_PER_S = 12
const MAX_BURST = 4
const REFERENCE_COLS = 18
const FLASH_PER_PX = 0.16
const FLASH_FADE_PER_S = 7
const SPARK_SIZE_PX = { min: 0.9, spread: 1.1 }
const EMBER_SPAN_S = { min: 1.1, spread: 2.2 }
const EMBER_SIZE_PX = { min: 1.4, spread: 2.2 }
const EMBER_RISE_PX_PER_S = { min: 50, spread: 80 }
const RADIAL_LAUNCH = { min: 170, spread: 190 }
const GOVERNOR = { slowMs: 7, fastMs: 3.5, floor: 0.3 }

export const createSynth = ({ spec, fx, water: waterCanvas = null, options = {} }) => {
  const view = {
    spec, fx, waterCanvas, options,
    gl: null,
    waterGl: null,
    glDirty: false,
    doc: spec.ownerDocument,
    g: spec.getContext('2d'),
    layout: null,
    radial: createRadial(),
    chips: [],
    spectrum: createSpectrum(),
    bins: new Float32Array(0),
    water: null,
    embers: null,
    atlases: new Map(),
    tint: 0,
    energy: 0,
    snapping: true,
    swell: 0,
    wasPlaying: null,
    intro: null,
    introDone: false,
    strip: createStrip({ locked: false }),
    stripGradient: null,
    controls: {},
    bulge: 0,
    flashSprite: null,
    timerWidth: 0,
    perf: { ms: 0, samples: new Float32Array(600), at: 0, embers: 0 },
  }
  return {
    resize: layout => resize(view, layout),
    draw: frame => draw(view, frame),
    replayIntro: () => replayIntro(view),
  }
}

const replayIntro = view => {
  if (!view.layout) return
  view.introDone = false
  view.intro = { ...createIntro(view.layout.cols, view.options.intro), elapsed: INTRO_HOLD_MS }
}

const resize = (view, layout) => {
  const width = Math.round(layout.width * layout.dpr)
  const height = Math.round(layout.height * layout.dpr)
  if (view.spec.width !== width || view.spec.height !== height) Object.assign(view.spec, { width, height })
  if (view.fx.width !== width || view.fx.height !== height) Object.assign(view.fx, { width, height })
  if (view.waterCanvas && (view.waterCanvas.width !== width || view.waterCanvas.height !== height)) Object.assign(view.waterCanvas, { width, height })
  if (view.layout?.cols !== layout.cols) resetColumns(view, layout.cols)
  resizeSpectrum(view.spectrum, layout.cols)
  view.layout = layout
  view.stripGradient = buildStripGradient(view)
  view.embers ??= createEmbers(view.options.budget ?? pickBudget({ cores: navigator.hardwareConcurrency, pixels: width * height }))
  if (view.options.fx !== '2d') view.gl ??= createGlEmbers({ canvas: view.fx, capacity: view.embers.capacity })
  if (view.options.water === 'gl' && view.waterCanvas) view.waterGl ??= createGlWater({ canvas: view.waterCanvas })
  if (!view.introDone && view.intro?.jitters.length !== layout.cols) {
    view.intro = { ...createIntro(layout.cols, view.intro?.pattern ?? view.options.intro), elapsed: view.intro?.elapsed ?? 0 }
  }
}

const draw = (view, frame) => {
  const { layout, chips, g, radial, water } = view
  if (!layout) return false
  const started = performance.now()
  const linearEmpty = isLinearEmpty(view)
  const levelsActive = updateLevels(view, frame)
  const following = followLevels(view, frame)
  if (view.wasPlaying !== frame.playing) {
    view.wasPlaying = frame.playing
    reassignChips({ chips, cols: layout.cols, playing: frame.playing, levels: water.levels })
    syncPeaks(view)
  }
  stepChips({ chips, levels: water.levels, dt: frame.dt, segments: Math.round(layout.travel), reducedMotion: frame.reducedMotion })
  const swelling = stepSwells(view, frame)
  const tintSettled = stepTint(view, frame)
  const stripRevealing = stepStrip({ strip: view.strip, locked: frame.stripLocked, cols: layout.cols, dt: frame.dt, reducedMotion: frame.reducedMotion })
  const palette = paletteFor(frame)
  const ink = inkRgb(view.tint)
  const sparks = sparkIntensity(frame.volume) * view.embers.budget / view.embers.capacity * Math.sqrt(REFERENCE_COLS / layout.cols)
  stepRadial(radial, {
    levels: water.levels, dt: frame.dt, volume: frame.volume, wave: frame.wave, playing: frame.playing, linearEmpty,
    reducedMotion: frame.reducedMotion, t: frame.now / 1000,
    onEmit: (i, outward) => launchFromTip({ view, i, outward }),
  })
  const linear = radial.morph === 0
  const introRunning = stepIntro(view, frame)
  measureSurface({ view, share: linearShare(radial), introRunning })
  if (linear && frame.playing && !frame.reducedMotion) emitFromPeaks({ view, dt: frame.dt, sparks })
  else syncPeaks(view)
  const emberCount = frame.reducedMotion ? 0 : stepEmbers(view.embers, frame.dt)
  if (linear) splashEmbers(view)
  g.setTransform(layout.dpr, 0, 0, layout.dpr, 0, 0)
  g.clearRect(0, 0, layout.width, layout.height)
  g.lineCap = 'round'
  g.lineJoin = 'round'
  if (linearShare(radial) > 0) drawWater({ view, ink, share: linearShare(radial), pos: frame.pos, playing: frame.playing, introRunning })
  else if (view.waterGl) clearGlWater(view.waterGl)
  if (linear) drawFlashes({ view, ink, dt: frame.dt })
  else {
    drawDeepBackdrop({ view, pos: frame.pos, strength: (1 - linearShare(radial)) * view.energy * (frame.playing ? 1 : 0) })
    drawRing({ view, ink })
  }
  drawFlock({ view, ink, playing: frame.playing })
  if (introRunning) maskWater(view)
  drawStrip({ view, frame })
  if (introRunning) maskStrip(view)
  drawControls({ view, frame, palette, ink, introRunning })
  paintEmbers({ view, frame, emberCount })
  const widthSettled = Math.abs(view.timerWidth - timerWidth(view.layout, timerSize(frame.timer))) < 0.2
  recordPerf(view, performance.now() - started, emberCount)
  return introRunning || stripRevealing || !isRadialSettled(radial) || (radial.morph > 0 && radial.morph < 1) || frame.playing
    || levelsActive || following || swelling || chips.length > 0 || emberCount > 0 || !tintSettled || !widthSettled
    || frame.chromeAlpha < 1
}

const isLinearEmpty = ({ water, chips }) => water.levels.every(level => level < 0.02) && chips.every(chip => chip.y <= 0)

const updateLevels = (view, { analyser, playing, sampleRate, volume }) => {
  if (!(analyser && playing)) return decaySpectrum(view.spectrum)
  if (view.bins.length !== analyser.frequencyBinCount) view.bins = new Float32Array(analyser.frequencyBinCount)
  analyser.getFloatFrequencyData(view.bins)
  readSpectrum({ spectrum: view.spectrum, bins: view.bins, nyquist: sampleRate / 2, volume })
  return true
}

const followLevels = (view, { dt, playing, reducedMotion }) => {
  if (!playing && !reducedMotion) {
    view.snapping = true
    return dropLevels(view.water, dt)
  }
  view.water.fall.fill(0)
  if (view.snapping && snapToSound(view)) return true
  const { levels, raw } = view.water
  const source = view.spectrum.levels
  const cols = levels.length
  const up = 1 - Math.exp(-ATTACK_PER_S * dt)
  const down = 1 - Math.exp(-RELEASE_PER_S * dt)
  let moving = false
  for (let col = 0; col < cols; col++) {
    raw[col] = Math.max(0, 0.25 * source[Math.max(0, col - 1)] + 0.5 * source[col] + 0.25 * source[Math.min(cols - 1, col + 1)] + view.water.drift[col] * CREST_DRIFT)
    const gap = raw[col] - levels[col]
    levels[col] = Math.abs(gap) < 0.0005 ? raw[col] : levels[col] + gap * (gap > 0 ? up : down)
    moving ||= levels[col] !== raw[col]
  }
  return moving
}

const snapToSound = view => {
  const { water, spectrum } = view
  const source = spectrum.levels
  if (Math.max(...source) < SNAP_READY) return false
  const cols = source.length
  for (let col = 0; col < cols; col++) {
    water.raw[col] = Math.max(0, 0.25 * source[Math.max(0, col - 1)] + 0.5 * source[col] + 0.25 * source[Math.min(cols - 1, col + 1)])
    water.levels[col] = water.raw[col]
    water.mean[col] = source[col]
  }
  water.layers.forEach(layer => layer.set(water.levels))
  Object.assign(view, { snapping: false, energy: 1, swell: Math.max(...water.levels) })
  return true
}

const dropLevels = (water, dt) => {
  const { levels, raw, fall } = water
  let moving = false
  for (let col = 0; col < levels.length; col++) {
    if (!levels[col] && !fall[col]) continue
    fall[col] += GRAVITY_PER_S2 * dt
    levels[col] -= fall[col] * dt
    if (levels[col] <= 0) {
      const bounce = fall[col] > BOUNCE_FROM_PER_S ? -fall[col] * BOUNCE_KEEP : 0
      levels[col] = bounce ? 0.0001 : 0
      fall[col] = bounce
    }
    raw[col] = levels[col]
    moving = true
  }
  return moving
}

const stepSwells = (view, { dt, playing, reducedMotion }) => {
  const { water } = view
  const source = view.spectrum.levels
  const cols = source.length
  const target = playing ? 1 : 0
  view.energy = reducedMotion ? target : approach(view.energy, target, dt / (target ? ENERGY_S : ENERGY_DROP_S))
  let loudest = 0
  const meanPull = 1 - Math.exp(-MEAN_PER_S * dt)
  const catchPull = 1 - Math.exp(-MEAN_CATCH_PER_S * dt)
  for (let col = 0; col < cols; col++) {
    loudest = Math.max(loudest, water.levels[col])
    const before = source[col] - water.mean[col]
    water.mean[col] += before * (Math.abs(before) > MEAN_CATCH_GAP ? catchPull : meanPull)
    const gap = source[col] - water.mean[col]
    water.spread[col] += (Math.min(gap * gap, MEAN_CATCH_GAP ** 2) - water.spread[col]) * meanPull
    const steady = Math.abs(gap) > MEAN_CATCH_GAP ? 0 : gap / Math.sqrt(water.spread[col] + 1e-5)
    water.drift[col] = Math.max(-MAX_DRIFT, Math.min(MAX_DRIFT, steady * DRIFT_SIGMA)) * Math.max(QUIET_DRIFT_FLOOR, Math.min(1, view.swell * 1.6)) * view.energy
  }
  view.swell += (loudest - view.swell) * (1 - Math.exp(-(playing ? SWELL_PER_S : SWELL_DROP_PER_S) * dt))
  let moving = view.energy !== target || Math.abs(loudest - view.swell) > 0.002
  LAYERS.forEach((layer, k) => {
    const state = water.layers[k]
    const pull = 1 - Math.exp(-layer.rate * (playing ? 1 : IDLE_SETTLE) * dt)
    for (let col = 0; col < cols; col++) {
      let sum = 0
      let weight = 0
      for (let d = -layer.blur; d <= layer.blur; d++) {
        const at = Math.max(0, Math.min(cols - 1, col + d))
        const w = layer.blur + 1 - Math.abs(d)
        sum += ((playing ? source : water.levels)[at] + water.drift[at] * layer.gain) * w
        weight += w
      }
      const goal = Math.max(0, sum / weight)
      const step = (goal - state[col]) * pull
      state[col] = !playing && Math.abs(goal - state[col] - step) < LAYER_SNAP ? goal : state[col] + step
      moving ||= state[col] !== goal && Math.abs(step) > 0.0004
    }
  })
  return moving
}

const approach = (value, target, step) => target > value ? Math.min(target, value + step) : Math.max(target, value - step)

const stepTint = (view, frame) => {
  const target = isDarkInk(frame) ? 1 : 0
  view.tint += (target - view.tint) * Math.min(1, frame.dt / INK_TINT_S)
  if (Math.abs(target - view.tint) < 0.01) view.tint = target
  return view.tint === target
}

const sparkIntensity = volume => SPARK_FLOOR + (1 - SPARK_FLOOR) * Math.pow(volume, SPARK_CURVE)

const measureSurface = ({ view, share, introRunning }) => {
  const { layout, water, chips, intro } = view
  const cols = layout.cols
  const { xs, crest, peak, tops, reveal } = water
  peak.fill(0)
  for (const chip of chips) peak[chip.col + 1] = Math.max(peak[chip.col + 1], chip.y)
  for (let col = 0; col < cols; col++) {
    const x = (col + 0.5) / cols
    reveal[col] = introRunning ? 0.25 + 0.75 * revealAt({ intro, col, jitter: intro.jitters[col], x, y: 0.5 }) : 1
    const scale = share * reveal[col] * layout.travel
    xs[col + 1] = x * layout.width
    crest[col + 1] = layout.base - water.levels[col] * scale
    peak[col + 1] = Math.min(crest[col + 1], layout.base - peak[col + 1] * scale)
    for (let k = 0; k < LAYERS.length; k++) {
      const layer = LAYERS[k]
      const rise = (water.layers[k][col] * (1 + layer.lift * view.energy) + layer.lift * 0.3 * view.swell * view.energy) * scale + layer.rest * view.energy * (1 + QUIET_SPREAD * (1 - view.swell) * view.energy) * share * reveal[col]
      tops[k][col + 1] = Math.min(crest[col + 1], layout.base - rise)
    }
  }
  xs[0] = 0
  xs[cols + 1] = layout.width
  for (const line of water.lines) {
    line[0] = line[1] - (line[2] - line[1]) / 2
    line[cols + 1] = line[cols] + (line[cols] - line[cols - 1]) / 2
  }
}

const drawDeepBackdrop = ({ view, pos, strength }) => {
  const { g, layout } = view
  if (strength <= 0) return
  const top = layout.centre.y * 0.6
  const deep = mixRgb(colourAt(pos), [0, 0, 0], DEEP_DARKEN)
  const fill = g.createLinearGradient(0, top, 0, layout.height)
  fill.addColorStop(0, rgba(deep, 0))
  fill.addColorStop(1, rgba(deep, DEEP_ALPHA * strength))
  g.fillStyle = fill
  g.fillRect(0, top, layout.width, layout.height - top)
}

const lowest = ys => ys.reduce((top, y) => Math.min(top, y), Infinity)

const drawWater = ({ view, ink, share, pos, playing, introRunning }) => {
  const { g, layout, water, energy } = view
  const { xs, crest, peak } = water
  const count = xs.length
  const idle = IDLE_SWELL + (1 - IDLE_SWELL) * energy
  const bands = waterBands({ view, ink, share, pos, playing, idle })
  const lines = [
    { ys: peak, width: PEAK_LINE_PX, rgb: ink, alpha: 0.9 * energy * share },
    { ys: crest, width: IDLE_CREST_PX + (CREST_PX - IDLE_CREST_PX) * energy, rgb: ink, alpha: (IDLE_CREST_ALPHA + (1 - IDLE_CREST_ALPHA) * energy) * share },
  ]
  if (view.waterGl && !introRunning && !view.waterGl.lost) {
    return drawGlWater({ renderer: view.waterGl, xs, count, dpr: layout.dpr, height: layout.height, bands, lines })
  }
  if (view.waterGl) clearGlWater(view.waterGl)
  bands.forEach(band => fillBand({ g, xs, count, layout, band }))
  g.beginPath()
  traceLine({ g, xs, ys: peak, count, reverse: false, start: true })
  g.lineWidth = PEAK_LINE_PX
  g.strokeStyle = rgba(ink, 0.9 * energy * share)
  g.stroke()
  g.beginPath()
  traceLine({ g, xs, ys: crest, count, reverse: false, start: true })
  g.lineWidth = IDLE_CREST_PX + (CREST_PX - IDLE_CREST_PX) * energy
  g.strokeStyle = rgba(ink, (IDLE_CREST_ALPHA + (1 - IDLE_CREST_ALPHA) * energy) * share)
  g.stroke()
}

const waterBands = ({ view, ink, share, pos, playing, idle }) => {
  const { layout, water, energy } = view
  const { crest, peak, tops } = water
  const strength = playing ? share * energy : 0
  const deep = mixRgb(colourAt(pos), [0, 0, 0], DEEP_DARKEN)
  return [
    {
      top: crest, bottom: null, rgb: deep, alpha: SURFACE_ALPHA + 0.04 * (1 - strength),
      fade: { from: lowest(crest), to: layout.height, alpha: Math.max(0.08, DEEP_ALPHA * strength) },
    },
    ...LAYERS.map((layer, k) => ({ top: tops[k], bottom: crest, rgb: LIGHT_INK, alpha: layer.alpha * idle * share })).reverse(),
    { top: peak, bottom: crest, rgb: ink, alpha: FOAM_ALPHA * share * energy },
  ]
}

const fillBand = ({ g, xs, count, layout, band }) => {
  g.beginPath()
  traceLine({ g, xs, ys: band.top, count, reverse: false, start: true })
  if (band.bottom) traceLine({ g, xs, ys: band.bottom, count, reverse: true, start: false })
  else {
    g.lineTo(layout.width, layout.height)
    g.lineTo(0, layout.height)
  }
  g.closePath()
  g.fillStyle = band.fade ? fadeFill({ g, band }) : rgba(band.rgb, band.alpha)
  fillWater(g, layout)
}

const fadeFill = ({ g, band }) => {
  const fill = g.createLinearGradient(0, band.fade.from, 0, band.fade.to)
  fill.addColorStop(0, rgba(band.rgb, band.alpha))
  fill.addColorStop(1, rgba(band.rgb, band.fade.alpha))
  return fill
}

const fillWater = (g, { width, height }) => {
  g.moveTo(-BOUNDS_MARGIN_PX, -BOUNDS_MARGIN_PX)
  g.lineTo(-BOUNDS_MARGIN_PX, -BOUNDS_MARGIN_PX)
  g.moveTo(width + BOUNDS_MARGIN_PX, height + BOUNDS_MARGIN_PX)
  g.lineTo(width + BOUNDS_MARGIN_PX, height + BOUNDS_MARGIN_PX)
  g.fill()
}

const traceLine = ({ g, xs, ys, count, reverse, start }) => {
  const first = reverse ? count - 1 : 0
  const step = reverse ? -1 : 1
  if (start) g.moveTo(xs[first], ys[first])
  else g.lineTo(xs[first], ys[first])
  for (let n = 1; n < count - 1; n++) {
    const i = first + n * step
    const next = i + step
    g.quadraticCurveTo(xs[i], ys[i], (xs[i] + xs[next]) / 2, (ys[i] + ys[next]) / 2)
  }
  const last = first + (count - 1) * step
  g.lineTo(xs[last], ys[last])
}

const syncPeaks = view => {
  const { peakY } = view.water
  peakY.fill(0)
  for (const chip of view.chips) peakY[chip.col] = Math.max(0, chip.y)
}

const emitFromPeaks = ({ view, dt, sparks }) => {
  const { chips, layout, water } = view
  const { peakY, spawnDebt, emberDebt, flashes, levels, xs, peak } = water
  for (const chip of chips) {
    if (chip.role !== 'cap' || chip.y <= 0) continue
    const col = chip.col
    const risePx = Math.max(0, chip.y - peakY[col]) * layout.travel
    peakY[col] = chip.y
    flashes[col] = Math.min(1, flashes[col] + risePx * FLASH_PER_PX)
    spawnDebt[col] = Math.min(MAX_BURST, spawnDebt[col] + risePx * BURST_PER_PX * sparks)
    emberDebt[col] += levels[col] * SIMMER_PER_S * dt * sparks
    const x = xs[col + 1]
    const y = peak[col + 1]
    spawnDebt[col] = 0
    if (emberDebt[col] < 1) continue
    emberDebt[col] -= 1
    releaseEmber(view, x, y)
  }
}

const splashEmbers = view => {
  const { embers, layout, water } = view
  const { data } = embers
  const pitch = layout.width / layout.cols
  for (let i = 0; i < embers.count; i++) {
    const o = i * 8
    if (data[o + 3] <= 0) continue
    const at = Math.max(0, Math.min(layout.cols, data[o] / pitch + 0.5))
    const lo = Math.floor(at)
    const surface = water.crest[lo] + (water.crest[lo + 1] - water.crest[lo]) * (at - lo)
    if (data[o + 1] > surface + SPLASH_PX) data[o + 4] = data[o + 5]
  }
}

const releaseEmber = (view, x, y) => {
  const size = EMBER_SIZE_PX.min + EMBER_SIZE_PX.spread * Math.random() ** 2.2
  const span = view.layout.width / view.layout.cols
  spawnEmber(
    view.embers,
    x + (Math.random() - 0.5) * span,
    y - Math.random() * 4,
    (Math.random() - 0.5) * 60,
    -(20 + Math.random() * 60),
    EMBER_SPAN_S.min + EMBER_SPAN_S.spread * Math.random() ** 1.8,
    size,
    -(EMBER_RISE_PX_PER_S.min + EMBER_RISE_PX_PER_S.spread * Math.random()) / (0.5 + size * 0.25),
  )
}

const launchFromTip = ({ view, i, outward }) => {
  const { radial, layout, embers } = view
  if (Math.random() > embers.budget / embers.capacity) return
  const tips = radial.radii.length
  const angle = tipAngle(radial, i, tips)
  const tip = tipPoint({ view, i, tips })
  const speed = RADIAL_LAUNCH.min + RADIAL_LAUNCH.spread * Math.random() + outward * layout.reach * 0.8
  const swirl = (Math.random() - 0.5) * 0.9
  const bursts = 2 + Math.floor(Math.random() * 3)
  for (let n = 0; n < bursts; n++) {
    const fan = angle + swirl * (0.4 + Math.random()) + (Math.random() - 0.5) * 0.9
    const kick = speed * (0.55 + 0.45 * Math.random())
    spawnEmber(
      embers, tip.x, tip.y, Math.sin(fan) * kick, Math.cos(fan) * kick,
      0.6 + 1.3 * Math.random() ** 1.6,
      SPARK_SIZE_PX.min + EMBER_SIZE_PX.spread * Math.random() ** 2.4,
      n ? -1 : 1,
    )
  }
}

const paintEmbers = ({ view, frame, emberCount }) => {
  const { g, gl, embers, layout } = view
  if (!emberCount && !view.glDirty) return
  const atlas = atlasFor(view, frame)
  const dark = isDarkInk(frame)
  if (!gl) return drawEmbers({ g, embers, atlas, dpr: layout.dpr, additive: view.options.blend === 'add' && !dark })
  drawGlEmbers({ renderer: gl, embers, atlas, dpr: layout.dpr, glow: 0 })
  view.glDirty = emberCount > 0
}

const drawFlashes = ({ view, ink, dt }) => {
  const { g, water, chips } = view
  const { flashes, xs, peak } = water
  view.flashSprite ??= buildFlash(view.doc)
  const fade = Math.exp(-FLASH_FADE_PER_S * dt)
  const half = 22
  g.globalCompositeOperation = ink[0] > 128 ? 'lighter' : 'source-over'
  for (const chip of chips) {
    const flash = flashes[chip.col] *= fade
    if (flash < 0.03 || chip.y <= 0) continue
    g.globalAlpha = flash * 0.8
    g.drawImage(view.flashSprite, xs[chip.col + 1] - half, peak[chip.col + 1] - half, half * 2, half * 2)
  }
  g.globalAlpha = 1
  g.globalCompositeOperation = 'source-over'
}

const buildFlash = doc => {
  const canvas = doc.createElement('canvas')
  canvas.width = canvas.height = 64
  const g = canvas.getContext('2d')
  const gradient = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  gradient.addColorStop(0, 'rgba(255,255,255,.9)')
  gradient.addColorStop(0.3, 'rgba(255,255,255,.34)')
  gradient.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = gradient
  g.fillRect(0, 0, 64, 64)
  return canvas
}

const drawRing = ({ view, ink }) => {
  const { g, layout, radial, water, energy } = view
  const bloom = radialBloom(radial)
  if (!bloom) return
  const tips = radial.radii.length
  const reach = layout.reach * bloom
  const mean = meanRadius(radial)
  const rim = i => radial.radii[i] * reach
  const idle = IDLE_SWELL + (1 - IDLE_SWELL) * energy
  for (let k = LAYERS.length - 1; k >= 0; k--) {
    const layer = LAYERS[k]
    const turn = radial.spin * RING_DRIFT * (k + 1) * (k % 2 ? -1 : 1)
    g.beginPath()
    traceRing({ g, view, tips, turn, radiusAt: i => {
      const band = bandOf(i, tips, water.levels.length)
      const lift = (radial.radii[i] * layer.lift + layer.lift * 0.3 * view.swell) * RING_LIFT + Math.max(0, water.layers[k][band] - water.levels[band])
      return rim(i) + lift * reach + layer.rest * bloom
    } })
    traceRing({ g, view, tips, turn: 0, radiusAt: rim })
    g.fillStyle = rgba(LIGHT_INK, layer.alpha * idle * bloom)
    g.fill('evenodd')
  }
  g.beginPath()
  traceRing({ g, view, tips, turn: 0, radiusAt: rim })
  g.fillStyle = BODY_SHADE
  g.fill()
  g.beginPath()
  traceRing({ g, view, tips, turn: 0, radiusAt: i => innerRadiusAt(radial, tipAngle(radial, i, tips), mean) * reach })
  g.fillStyle = rgba(LIGHT_INK, CORE_ALPHA * idle * bloom)
  g.fill()
  g.beginPath()
  traceRing({ g, view, tips, turn: 0, radiusAt: i => innerRadiusAt(radial, tipAngle(radial, i, tips) + 1.3, mean) * reach * 0.56 })
  g.fill()
  if (radial.morph === 1) {
    g.beginPath()
    traceRing({ g, view, tips, turn: 0, radiusAt: i => Math.max(rim(i), radial.peaks[i] * reach) })
    traceRing({ g, view, tips, turn: 0, radiusAt: rim })
    g.fillStyle = rgba(ink, FOAM_ALPHA)
    g.fill('evenodd')
    g.beginPath()
    traceRing({ g, view, tips, turn: 0, radiusAt: i => Math.max(rim(i), radial.peaks[i] * reach) })
    g.lineWidth = PEAK_LINE_PX
    g.strokeStyle = rgba(ink, 0.9 * energy)
    g.stroke()
  }
  g.beginPath()
  traceRing({ g, view, tips, turn: 0, radiusAt: rim })
  g.lineWidth = CREST_PX
  g.strokeStyle = rgba(ink, (IDLE_CREST_ALPHA + (1 - IDLE_CREST_ALPHA) * energy) * bloom)
  g.stroke()
}

const bandOf = (i, tips, bands) => {
  const turn = i / tips
  const mirrored = turn <= 0.5 ? turn * 2 : (1 - turn) * 2
  return Math.round(mirrored * (bands - 1))
}

const traceRing = ({ g, view, tips, turn, radiusAt }) => {
  const { layout, radial, water } = view
  const { ringX, ringY } = water
  for (let i = 0; i < tips; i++) {
    const angle = tipAngle(radial, i, tips) + turn
    const r = radiusAt(i)
    ringX[i] = layout.centre.x + Math.sin(angle) * r
    ringY[i] = layout.centre.y + Math.cos(angle) * r
  }
  g.moveTo((ringX[tips - 1] + ringX[0]) / 2, (ringY[tips - 1] + ringY[0]) / 2)
  for (let i = 0; i < tips; i++) {
    const next = (i + 1) % tips
    g.quadraticCurveTo(ringX[i], ringY[i], (ringX[i] + ringX[next]) / 2, (ringY[i] + ringY[next]) / 2)
  }
  g.closePath()
}

const drawFlock = ({ view, ink, playing }) => {
  const { g, layout, radial, water } = view
  if (!playing || radial.morph <= 0 || radial.morph >= 1) return
  const tips = radial.radii.length
  g.beginPath()
  for (let i = 0; i < tips; i++) {
    const progress = flockProgress(radial, i)
    const from = { x: water.xs[i + 1], y: layout.base - water.peakY[i] * layout.travel }
    const at = flight({ from, to: tipPoint({ view, i, tips }), progress, centre: layout.centre, i })
    const radius = FLOCK_DOT_PX * settleOut(progress, i)
    if (radius < 0.2) continue
    g.moveTo(at.x + radius, at.y)
    g.arc(at.x, at.y, radius, 0, Math.PI * 2)
  }
  g.fillStyle = rgba(ink, 1)
  g.fill()
}

const settleOut = (progress, i) => {
  const from = SETTLE_FROM - SETTLE_STAGGER * ((i * 0.618) % 1)
  const t = Math.max(0, Math.min(1, (progress - from) / (1 - from)))
  return 1 - t * t * (3 - 2 * t)
}

const tipPoint = ({ view, i, tips }) => {
  const { layout, radial } = view
  const angle = tipAngle(radial, i, tips)
  const r = radial.peaks[i] * layout.reach * radialBloom(radial) + 2
  return { x: layout.centre.x + Math.sin(angle) * r, y: layout.centre.y + Math.cos(angle) * r }
}

const maskWater = view => {
  const { g, layout, intro } = view
  const bottom = layout.strip.top - 6
  const vertical = intro.pattern === 'up' || intro.pattern === 'down'
  const gradient = vertical ? g.createLinearGradient(0, 0, 0, bottom) : g.createLinearGradient(0, 0, layout.width, 0)
  for (let stop = 0; stop <= MASK_STOPS; stop++) {
    const share = stop / MASK_STOPS
    const at = share * (layout.cols - 1)
    const lo = Math.floor(at)
    const hi = Math.min(layout.cols - 1, lo + 1)
    const jitter = vertical ? 0.5 : intro.jitters[lo] + (intro.jitters[hi] - intro.jitters[lo]) * (at - lo)
    const reveal = revealAt({ intro, col: lo, jitter, x: vertical ? 0.5 : share, y: vertical ? share * bottom / layout.height : 0.5 })
    gradient.addColorStop(share, `rgba(0,0,0,${1 - reveal})`)
  }
  g.globalCompositeOperation = 'destination-out'
  g.fillStyle = gradient
  g.fillRect(0, 0, layout.width, bottom)
  g.globalCompositeOperation = 'source-over'
}

const resetColumns = (view, cols) => {
  view.chips.length = 0
  view.wasPlaying = null
  const band = () => new Float32Array(cols)
  const line = () => new Float32Array(cols + 2)
  view.water = {
    levels: band(), raw: band(), fall: band(), mean: band(), spread: band(), drift: band(), reveal: band(),
    layers: LAYERS.map(band),
    peakY: band(), spawnDebt: band(), emberDebt: band(), flashes: band(),
    xs: line(), crest: line(), peak: line(), tops: LAYERS.map(line),
    ringX: band(), ringY: band(),
  }
  view.water.lines = [view.water.crest, view.water.peak, ...view.water.tops]
  if (view.embers) clearEmbers(view.embers)
}

const createIntro = (cols, pattern = pickPattern(Math.random)) => ({
  elapsed: 0,
  pattern,
  jitters: Float32Array.from({ length: cols }, () => Math.random()),
  flips: Array.from({ length: cols }, () => Math.random() < 0.5),
})

const stepIntro = (view, frame) => {
  if (view.introDone) return false
  view.intro.elapsed += frame.dt * 1000
  if (frame.reducedMotion || view.intro.elapsed >= INTRO_MS) {
    Object.assign(view, { intro: null, introDone: true })
    return false
  }
  return true
}

const revealAt = ({ intro, col, jitter, x, y }) => {
  const order = INTRO_PATTERNS[intro.pattern]({ x, y })
  const unit = order === null
    ? jitter * 0.62 + (intro.flips[col] ? y : 1 - y) * 0.38
    : order * (1 - INTRO_JITTER) + jitter * INTRO_JITTER
  const t = Math.min(1, Math.max(0, (intro.elapsed - INTRO_HOLD_MS - unit * INTRO_SPREAD_MS) / INTRO_FADE_MS))
  return t * t * (3 - 2 * t)
}

const maskStrip = view => {
  const { g, layout, intro } = view
  const top = layout.strip.top - 6
  const y = (layout.strip.top + layout.strip.height / 2) / layout.height
  const gradient = g.createLinearGradient(layout.left, 0, layout.right, 0)
  for (let stop = 0; stop <= MASK_STOPS; stop++) {
    const at = stop / MASK_STOPS * (layout.cols - 1)
    const lo = Math.floor(at)
    const hi = Math.min(layout.cols - 1, lo + 1)
    const jitter = intro.jitters[lo] + (intro.jitters[hi] - intro.jitters[lo]) * (at - lo)
    const reveal = revealAt({ intro, col: lo, jitter: intro.pattern === 'scatter' ? 0.5 + (jitter - 0.5) * 0.5 : jitter, x: stop / MASK_STOPS, y: intro.pattern === 'scatter' ? 0.5 : y })
    gradient.addColorStop(stop / MASK_STOPS, `rgba(0,0,0,${1 - reveal})`)
  }
  g.globalCompositeOperation = 'destination-out'
  g.fillStyle = gradient
  g.fillRect(0, top, layout.width, layout.height - top)
  g.globalCompositeOperation = 'source-over'
}

const drawStrip = ({ view, frame }) => {
  const { g, layout, strip } = view
  if (strip.locked || frame.chromeAlpha === 0 || frame.sliderShown === 0) return
  const t = Math.min(1, strip.elapsed / STRIP_REVEAL_MS)
  const shown = 1 - (1 - t) ** 3
  const { scale, linePx } = layout
  const rise = (1 - shown) * STRIP_RISE_PX * scale
  const target = frame.colourDrag && !frame.reducedMotion ? 1 : 0
  view.bulge += (target - view.bulge) * (1 - Math.exp(-BULGE_PER_S * frame.dt))
  if (Math.abs(target - view.bulge) < 0.01) view.bulge = target
  const { left, width, top, height } = layout.strip
  const half = linePx / 2
  const y = top + height / 2 + rise
  const x = thumbX(layout, frame.pos, LAST)
  const swell = view.bulge * LINE_BULGE_PX * scale
  g.globalAlpha = shown * frame.chromeAlpha * (frame.sliderShown ?? 1)
  if (swell) traceBulgingLine({ g, left: left + half, right: left + width - half, y, half, x, swell, spread: BULGE_WIDTH_PX * scale })
  else tracePill(g, left, y - half, width, linePx)
  g.fillStyle = view.stripGradient
  g.fill()
  g.beginPath()
  g.arc(x, y, half + swell * BULGE_GROW, 0, Math.PI * 2)
  g.fillStyle = rgba(colourAt(frame.pos), 1)
  g.fill()
  g.beginPath()
  g.arc(x, y, half + swell * BULGE_GROW - THUMB_RING_PX * scale / 2, 0, Math.PI * 2)
  g.lineWidth = THUMB_RING_PX * scale
  g.strokeStyle = rgba(inkRgb(view.tint), 1)
  g.stroke()
  g.globalAlpha = 1
}

const traceBulgingLine = ({ g, left, right, y, half, x, swell, spread }) => {
  const edge = at => half + swell * Math.exp(-(((at - x) / spread) ** 2))
  g.beginPath()
  g.moveTo(left, y - edge(left))
  const steps = Math.ceil((right - left) / LINE_STEP_PX)
  for (let i = 1; i <= steps; i++) {
    const at = left + (right - left) * i / steps
    g.lineTo(at, y - edge(at))
  }
  g.arc(right, y, edge(right), -Math.PI / 2, Math.PI / 2)
  for (let i = steps - 1; i >= 0; i--) {
    const at = left + (right - left) * i / steps
    g.lineTo(at, y + edge(at))
  }
  g.arc(left, y, edge(left), Math.PI / 2, Math.PI * 1.5)
  g.closePath()
}

const buildStripGradient = view => {
  const { g, layout } = view
  const { left, width, height } = layout.strip
  const gradient = g.createLinearGradient(left + height / 2, 0, left + width - height / 2, 0)
  COLOURS.forEach(({ hex }, index) => gradient.addColorStop(index / LAST, hex))
  return gradient
}

const tracePill = (g, x, y, width, height) => {
  const r = height / 2
  g.beginPath()
  g.moveTo(x + r, y)
  g.lineTo(x + width - r, y)
  g.arc(x + width - r, y + r, r, -Math.PI / 2, Math.PI / 2)
  g.lineTo(x + r, y + height)
  g.arc(x + r, y + r, r, Math.PI / 2, Math.PI * 1.5)
  g.closePath()
}

const drawControls = ({ view, frame, palette, ink, introRunning }) => {
  const { g, layout } = view
  const size = timerSize(frame.timer)
  view.timerWidth = timerWidth(layout, size)
  const timer = timerBox(layout, size)
  const wave = waveBox(layout)
  const container = frame.playing ? rgba(ink, CONTAINER_ALPHA) : palette.ghost
  const solid = rgba(ink, 1)
  const left = layout.right - view.timerWidth
  const { scale, controlPx, dotPx, dotGapPx } = layout
  const dots = Array.from({ length: Math.max(1, size) }, (_, dot) => layout.right - controlPx / 2 - dot * (dotPx + dotGapPx))
    .filter(x => x - dotPx / 2 >= left + (controlPx - dotPx) / 2 - 0.5)
  g.globalAlpha = (introRunning ? controlReveal(view, wave) : 1) * frame.chromeAlpha * (frame.trackOn ? DISABLED_ALPHA : 1)
  drawControl({ view, name: 'wave', shape: 'wave', box: wave, width: wave.width, container, glyph: c => traceWaveGlyph({ g: c, box: wave, scale }), on: frame.waveSaved ?? frame.wave, stroke: true, solid })
  const music = musicBox(layout)
  g.globalAlpha = (introRunning ? controlReveal(view, music) : 1) * frame.chromeAlpha * (frame.trackOn ? DISABLED_ALPHA : 1)
  drawControl({
    view, name: 'music', shape: frame.piece, box: music, width: music.width, stroke: true, solid,
    container,
    on: frame.music !== 'off',
    glyph: c => traceNoteGlyph({ g: c, box: music, rising: frame.piece === 'helix', withPlus: frame.music === 'over', scale }),
    accent: frame.music === 'over' ? c => tracePlus({ g: c, box: music, scale }) : null,
  })
  g.globalAlpha = (introRunning ? controlReveal(view, timer) : 1) * (size ? timerAlpha(frame) : 1) * frame.chromeAlpha
  drawControl({
    view, name: 'timer', shape: size, box: { ...timer, left }, width: view.timerWidth, container, on: size > 0, stroke: false, solid,
    glyph: c => dots.forEach(x => {
      c.moveTo(x + dotPx / 2, layout.controlY)
      c.arc(x, layout.controlY, dotPx / 2, 0, Math.PI * 2)
    }),
  })
  g.globalAlpha = 1
}

const drawControl = ({ view, name, shape, box, width, container, glyph, on, stroke, solid, accent = null }) => {
  const { g, layout } = view
  const { c, painted } = controlCanvas(view, name)
  const accented = Boolean(accent)
  const stale = painted.layout !== layout || painted.shape !== shape || painted.container !== container
    || painted.on !== on || painted.solid !== solid || painted.accented !== accented
  if (stale) {
    paintControl({ c, layout, box, width, container, glyph, on, stroke, solid, accent })
    Object.assign(painted, { layout, shape, container, on, solid, accented })
  }
  g.drawImage(c.canvas, 0, 0, width * layout.dpr, box.height * layout.dpr, box.left, box.top, width, box.height)
}

const paintControl = ({ c, layout, box, width, container, glyph, on, stroke, solid, accent }) => {
  c.setTransform(layout.dpr, 0, 0, layout.dpr, -box.left * layout.dpr, -box.top * layout.dpr)
  c.clearRect(box.left, box.top, width, box.height)
  tracePill(c, box.left, box.top, width, box.height)
  c.fillStyle = container
  c.fill()
  c.globalCompositeOperation = on ? 'source-over' : 'destination-out'
  c.beginPath()
  glyph(c)
  c.fillStyle = c.strokeStyle = on ? solid : '#000'
  c.lineWidth = glyphStroke({ on, scale: layout.scale })
  c.lineCap = c.lineJoin = 'round'
  if (stroke) c.stroke()
  else c.fill()
  if (accent) {
    c.beginPath()
    accent(c)
    c.lineWidth = glyphStroke({ on, plus: true, scale: layout.scale })
    c.stroke()
  }
  c.globalCompositeOperation = 'source-over'
}

const controlCanvas = (view, name) => {
  view.controls[name] ??= { c: view.doc.createElement('canvas').getContext('2d'), painted: {} }
  const { c } = view.controls[name]
  const need = Math.ceil(view.layout.controlPx * 4 * view.layout.dpr)
  if (c.canvas.width < need) c.canvas.width = c.canvas.height = need
  return view.controls[name]
}

const controlReveal = (view, box) => {
  const { layout, intro } = view
  const x = (box.left + box.width / 2) / layout.width
  const col = Math.max(0, Math.min(layout.cols - 1, Math.floor((box.left + box.width / 2 - layout.left) / layout.pitch)))
  return revealAt({ intro, col, jitter: intro.jitters[col], x, y: layout.controlY / layout.height })
}

const atlasFor = (view, frame) => {
  const key = isDarkInk(frame) ? 'dark' : 'light'
  const cached = view.atlases.get(key)
  if (cached) return cached
  const atlas = buildDotAtlas({ doc: view.doc, rgb: key === 'dark' ? DARK_DOT : LIGHT_INK })
  view.atlases.set(key, atlas)
  return atlas
}


const recordPerf = (view, ms, embers) => {
  const { perf } = view
  perf.samples[perf.at % perf.samples.length] = ms
  perf.at += 1
  perf.ms += (ms - perf.ms) * 0.05
  perf.embers = embers
  if (view.options.governor === false) return
  const { embers: pool } = view
  if (perf.ms > GOVERNOR.slowMs) pool.budget = Math.max(pool.capacity * GOVERNOR.floor, pool.budget * 0.985)
  else if (perf.ms < GOVERNOR.fastMs) pool.budget = Math.min(pool.capacity, pool.budget * 1.005 + 0.05)
}

