import { COLOUR_ROW_SHADES, LAST, LIGHT_INK, colourAt, inkRgb, isDarkInk, paletteFor, rgba, shadeRgb } from './colours.js'
import { COLOUR_ROWS, fillCell, isReserved, waveCol } from './grid.js'
import { chipSegment, reassignChips, stepChips } from './chips.js'
import { createRadial, drawFlock, drawRadial, linearShare, stepRadial } from './radial.js'
import { clearPixels, createPixels, emitPixels, pixelAlpha, stepPixels } from './pixels.js'
import { createSpectrum, decaySpectrum, readSpectrum, resizeSpectrum } from './spectrum.js'
import { TIMER_BLINK_LOW, TIMER_OFF_ALPHA, timerAlpha, timerSize } from './timer.js'

const INK_TINT_S = 0.4
const INK_STEPS = 20
const INK_ALPHAS = [1, TIMER_BLINK_LOW, TIMER_OFF_ALPHA]
const SELECTOR_HALF = 1
const SELECTOR_FILL = rgba(LIGHT_INK, 1)

export const createSynth = ({ spec, fx }) => {
  const view = {
    spec, fx,
    radial: createRadial(),
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
  const { radial } = view
  stepRadial(radial, { levels: view.spectrum.levels, dt: frame.dt, volume: frame.volume, wave: frame.wave, playing: frame.playing, linearEmpty: isLinearEmpty(view), reducedMotion: frame.reducedMotion, t: frame.now / 1000 })
  const linear = radial.morph === 0
  const ink = inkStyle(view, 1)
  view.g.clearRect(0, 0, view.spec.width, view.spec.height)
  drawBars({ view, palette, size, playing: frame.playing, scale: linearShare(radial) })
  if (linear) drawChips(view, size)
  else drawRadial({ g: view.g, grid, radial, size, palette, ink })
  drawFlock({ g: view.g, grid, radial, chips, size, ink, playing: frame.playing })
  drawColourRows(view, frame.pos)
  drawTimer({ view, frame, palette, size })
  drawWaveDot({ view, frame, palette })
  const pixelCount = linear ? drawPixels({ view, frame, palette, size }) : 0
  if (!linear) hidePixels(view)
  return (radial.morph > 0 && radial.morph < 1) || frame.playing || levelsActive || chips.length > 0 || pixelCount > 0 || !tintSettled
}

const isLinearEmpty = ({ spectrum, chips }) => spectrum.levels.every(level => level < 0.02) && chips.every(chip => chip.y <= 0)

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

const drawBars = ({ view, palette, size, playing, scale }) => {
  const { g, grid, spectrum } = view
  const lit = gradientFor(view, palette)
  let current = null
  for (let col = 0; col < grid.cols; col++) {
    const litSegments = Math.round(spectrum.levels[col] * scale * grid.synthRows)
    const restSegment = playing || litSegments > 0 ? -1 : 0
    for (let seg = 0; seg < grid.synthRows; seg++) {
      const row = grid.synthRows - 1 - seg
      if (isReserved(grid, size, col, row)) continue
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
    if (!isReserved(grid, size, chip.col, row)) fillCell(g, grid, chip.col, row)
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

const drawWaveDot = ({ view, frame, palette }) => {
  const { g, grid } = view
  g.fillStyle = frame.wave ? inkStyle(view, 1) : frame.playing ? inkStyle(view, TIMER_OFF_ALPHA) : palette.rest
  fillCell(g, grid, waveCol(grid), grid.timerRow)
}

const drawTimer = ({ view, frame, palette, size }) => {
  const { g, grid } = view
  g.fillStyle = size || frame.playing ? inkStyle(view, timerAlpha(frame)) : palette.rest
  for (let col = grid.timerCol - Math.max(1, size) + 1; col <= grid.timerCol; col++) fillCell(g, grid, col, grid.timerRow)
}

const hidePixels = view => {
  clearPixels(view.pixels)
  view.fg.clearRect(0, 0, view.fx.width, view.fx.height)
}

const drawPixels = ({ view, frame, palette, size }) => {
  const { fx, fg, grid, pixels } = view
  if (frame.playing && !frame.reducedMotion) {
    emitPixels({ pixels, chips: view.chips, segments: grid.synthRows, volume: frame.volume })
  }
  const count = stepPixels({ pixels, dt: frame.dt })
  fg.clearRect(0, 0, fx.width, fx.height)
  for (const p of pixels.pool) {
    if (!p.active || p.row < 0 || isReserved(grid, size, p.col, p.row)) continue
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
  const gradient = g.createLinearGradient(0, grid.synthRows * grid.stepY * grid.dpr, 0, 0)
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
