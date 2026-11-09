import { COLOUR_ROW_SHADES, LAST, LIGHT_INK, colourAt, inkRgb, isDarkInk, paletteFor, rgba, shadeRgb } from './colours.js'
import { COLOUR_ROWS, fillCell, fillScreenCell, inTimer } from './grid.js'
import { drawBurst, isBurstLive } from './burst.js'
import { chipSegment, reassignChips, stepChips } from './chips.js'
import { clearPixels, createPixels, emitPixels, pixelAlpha, stepPixels } from './pixels.js'
import { createSpectrum, decaySpectrum, readSpectrum, resizeSpectrum } from './spectrum.js'
import { TIMER_BLINK_LOW, TIMER_OFF_ALPHA, timerAlpha, timerSize } from './timer.js'

const INK_TINT_S = 0.4
const INK_STEPS = 20
const INK_ALPHAS = [1, TIMER_BLINK_LOW, TIMER_OFF_ALPHA]
const SELECTOR_HALF = 1
const SELECTOR_FILL = rgba(LIGHT_INK, 1)
const FRAME_FILL = '#050505'
const FRAME_CELL = 'rgba(255,255,255,.04)'

export const createSynth = ({ spec, fx, burstKind = 'breaker' }) => {
  const view = {
    spec, fx, burstKind,
    burst: null,
    wasWave: false,
    g: spec.getContext('2d'),
    fg: fx.getContext('2d'),
    grid: null,
    chips: [],
    pixels: createPixels(),
    spectrum: createSpectrum(),
    bins: new Float32Array(0),
    tint: 0,
    wasPlaying: null,
    rowFills: [],
    gradients: new Map(),
    inks: buildInks(),
  }
  return {
    resize: grid => resize(view, grid),
    draw: frame => draw(view, frame),
  }
}

const resize = (view, grid) => {
  sizeCanvas(view.spec, grid)
  sizeCanvas(view.fx, grid)
  if (view.grid?.cols !== grid.cols) resetColumns(view)
  resizeSpectrum(view.spectrum, grid.cols)
  view.grid = grid
  view.rowFills = buildRowFills(grid)
  view.gradients.clear()
}

const draw = (view, frame) => {
  const { grid, chips } = view
  if (!grid) return false
  const levelsActive = updateLevels(view, frame)
  if (view.wasPlaying !== frame.playing) {
    view.wasPlaying = frame.playing
    reassignChips({ chips, cols: grid.cols, playing: frame.playing })
  }
  stepChips({ chips, levels: view.spectrum.levels, dt: frame.dt, segments: grid.synthRows, reducedMotion: frame.reducedMotion })
  const tintSettled = stepTint(view, frame)
  const palette = paletteFor(frame)
  const size = timerSize(frame.timer)
  view.g.clearRect(0, 0, view.spec.width, view.spec.height)
  drawBars({ view, palette, size, playing: frame.playing })
  drawChips(view, size)
  drawColourRows(view, frame.pos)
  drawTimer({ view, frame, palette, size })
  drawFrame(view)
  const pixelCount = drawPixels({ view, frame, palette, size })
  const bursting = stepBurst(view, frame)
  return bursting || frame.playing || levelsActive || chips.length > 0 || pixelCount > 0 || !tintSettled
}

const updateLevels = (view, { analyser, playing, sampleRate, volume }) => {
  if (!(analyser && playing)) return decaySpectrum(view.spectrum)
  if (view.bins.length !== analyser.frequencyBinCount) view.bins = new Float32Array(analyser.frequencyBinCount)
  analyser.getFloatFrequencyData(view.bins)
  readSpectrum({ spectrum: view.spectrum, bins: view.bins, nyquist: sampleRate / 2, volume })
  return true
}

const stepTint = (view, frame) => {
  const target = isDarkInk(frame) ? 1 : 0
  view.tint += (target - view.tint) * Math.min(1, frame.dt / INK_TINT_S)
  if (Math.abs(target - view.tint) < 0.01) view.tint = target
  return view.tint === target
}

const drawBars = ({ view, palette, size, playing }) => {
  const { g, grid, spectrum } = view
  const lit = gradientFor(view, palette)
  let current = null
  for (let col = 0; col < grid.cols; col++) {
    const litSegments = Math.round(spectrum.levels[col] * grid.synthRows)
    const restSegment = playing || litSegments > 0 ? -1 : 0
    for (let seg = 0; seg < grid.synthRows; seg++) {
      const row = grid.synthRows - 1 - seg
      if (inTimer(grid, size, col, row)) continue
      const style = seg < litSegments ? lit : seg === restSegment ? palette.rest : palette.ghost
      if (style !== current) g.fillStyle = current = style
      fillCell(g, grid, col, row)
    }
  }
}

const drawChips = (view, size) => {
  const { g, grid, chips } = view
  g.fillStyle = inkStyle(view, 1)
  for (const chip of chips) {
    if (chip.y <= 0) continue
    const row = grid.synthRows - 1 - chipSegment(chip, grid.synthRows)
    if (!inTimer(grid, size, chip.col, row)) fillCell(g, grid, chip.col, row)
  }
}

const drawColourRows = (view, pos) => {
  const { g, grid, rowFills } = view
  for (let k = 0; k < COLOUR_ROWS; k++) {
    for (let col = 0; col < grid.cols; col++) {
      g.fillStyle = rowFills[k][col]
      fillCell(g, grid, col, grid.colourTop + k)
    }
  }
  drawSelector({ g, grid, pos })
}

const drawSelector = ({ g, grid, pos }) => {
  const centre = Math.round(pos / LAST * (grid.cols - 1))
  const clamped = Math.max(SELECTOR_HALF, Math.min(grid.cols - 1 - SELECTOR_HALF, centre))
  g.fillStyle = SELECTOR_FILL
  for (let col = clamped - SELECTOR_HALF; col <= clamped + SELECTOR_HALF; col++) {
    for (let k = 0; k < COLOUR_ROWS; k++) fillCell(g, grid, col, grid.colourTop + k)
  }
}

const drawTimer = ({ view, frame, palette, size }) => {
  const { g, grid } = view
  g.fillStyle = size || frame.playing ? inkStyle(view, timerAlpha(frame)) : palette.rest
  const cells = Math.max(1, size)
  for (let row = grid.timerRow; row < grid.timerRow + cells; row++) {
    for (let col = grid.timerCol - cells + 1; col <= grid.timerCol; col++) fillCell(g, grid, col, row)
  }
}

const stepBurst = (view, frame) => {
  if (frame.wave && !view.wasWave) view.burst = { kind: view.burstKind, start: frame.now }
  view.wasWave = frame.wave
  if (!isBurstLive(view.burst, frame.now)) return false
  drawBurst({ g: view.fg, grid: view.grid, burst: view.burst, now: frame.now, pos: frame.pos })
  return true
}

const drawFrame = ({ g, grid }) => {
  const { frame, dpr, width, height, ox, oy, cols, rows, cellW, stepY } = grid
  if (!frame.top && !frame.left) return
  const inner = { x: ox * dpr, y: oy * dpr, w: cols * cellW * dpr, h: rows * stepY * dpr }
  g.fillStyle = FRAME_FILL
  g.fillRect(0, 0, width * dpr, inner.y)
  g.fillRect(0, inner.y + inner.h, width * dpr, height * dpr - inner.y - inner.h)
  g.fillRect(0, inner.y, inner.x, inner.h)
  g.fillRect(inner.x + inner.w, inner.y, width * dpr - inner.x - inner.w, inner.h)
  g.fillStyle = FRAME_CELL
  const totalCols = cols + frame.left + frame.right
  const totalRows = rows + frame.top + frame.bottom
  for (let row = 0; row < totalRows; row++) {
    for (let col = 0; col < totalCols; col++) {
      const inside = col >= frame.left && col < frame.left + cols && row >= frame.top && row < frame.top + rows
      if (!inside) fillScreenCell(g, grid, col, row)
    }
  }
}

const drawPixels = ({ view, frame, palette, size }) => {
  const { fx, fg, grid, pixels } = view
  if (frame.playing && !frame.reducedMotion) {
    emitPixels({ pixels, chips: view.chips, segments: grid.synthRows, volume: frame.volume })
  }
  const count = stepPixels({ pixels, dt: frame.dt })
  fg.clearRect(0, 0, fx.width, fx.height)
  for (const p of pixels.pool) {
    if (!p.active || p.row < 0 || inTimer(grid, size, p.col, p.row)) continue
    fg.globalAlpha = pixelAlpha(p)
    fg.fillStyle = palette[p.tone]
    fillCell(fg, grid, p.col, p.row)
  }
  fg.globalAlpha = 1
  return count
}

const gradientFor = (view, palette) => {
  const cached = view.gradients.get(palette)
  if (cached) return cached
  const { g, grid } = view
  const gradient = g.createLinearGradient(0, (grid.oy + grid.synthRows * grid.stepY) * grid.dpr, 0, grid.oy * grid.dpr)
  gradient.addColorStop(0, palette.low)
  gradient.addColorStop(0.55, palette.mid)
  gradient.addColorStop(1, palette.high)
  view.gradients.set(palette, gradient)
  return gradient
}

const inkStyle = (view, alpha) => view.inks[Math.round(view.tint * INK_STEPS)][alpha]

const buildInks = () => Array.from({ length: INK_STEPS + 1 }, (_, step) => {
  const rgb = inkRgb(step / INK_STEPS)
  return Object.fromEntries(INK_ALPHAS.map(alpha => [alpha, rgba(rgb, alpha)]))
})

const buildRowFills = grid => COLOUR_ROW_SHADES.map(shade => Array.from({ length: grid.cols }, (_, col) => {
  const base = colourAt(col / (grid.cols - 1) * LAST)
  return rgba(shadeRgb(base, shade), 1)
}))

const resetColumns = view => {
  view.chips.length = 0
  view.wasPlaying = null
  clearPixels(view.pixels)
}

const sizeCanvas = (canvas, grid) => {
  const width = Math.round(grid.width * grid.dpr)
  const height = Math.round(grid.height * grid.dpr)
  if (canvas.width !== width || canvas.height !== height) Object.assign(canvas, { width, height })
}
