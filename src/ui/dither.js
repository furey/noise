import { COLOURS, layerOpacity } from './colours.js'

export const DITHER_FADE_S = 0.9

const LEVELS = 4
const SUB = 2
const BAND_DEPTH = 0.1
const BAND_ROWS = 0.55
const BAND_SPEED = 2.4
const GAP_FILL = '#050505'
const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]].map(row => row.map(v => (v + 0.5) / 16))
const BACKGROUNDS = {
  brown: ['#744210', '#b7791f', '#ecc94b'],
  pink: ['#b83280', '#ed64a6', '#fbb6ce'],
  white: ['#4a5568', '#a0aec0', '#e2e8f0'],
  blue: ['#1e3a8a', '#3b82f6', '#bfdbfe'],
  violet: ['#4c1d95', '#8b5cf6', '#ddd6fe'],
}

export const createDither = () => ({ amount: 0, cells: null, g: null })

export const stepDither = (dither, { wave, dt }) => {
  const target = wave ? 1 : 0
  const step = dt / DITHER_FADE_S
  dither.amount = target > dither.amount ? Math.min(1, dither.amount + step) : Math.max(0, dither.amount - step)
  return dither.amount > 0
}

export const isDitherSettled = (dither, wave) => dither.amount === (wave ? 1 : 0)

export const paintBackground = ({ g, grid, pos, playing }) => {
  if (!playing) return
  const height = grid.height * grid.dpr
  COLOURS.forEach(({ id }, index) => {
    const opacity = layerOpacity(pos, index)
    if (!opacity) return
    const [low, mid, high] = BACKGROUNDS[id]
    const gradient = g.createLinearGradient(0, height, 0, 0)
    gradient.addColorStop(0, low)
    gradient.addColorStop(0.5, mid)
    gradient.addColorStop(1, high)
    g.globalAlpha = opacity
    g.fillStyle = gradient
    g.fillRect(0, 0, grid.width * grid.dpr, height)
  })
  g.globalAlpha = 1
}

export const applyDither = ({ dither, g, spec, fx, grid, now, reducedMotion }) => {
  const sample = sampleCells({ dither, spec, fx, grid })
  const { dpr, cols, rows, cellW, stepY, gap, ox, oy } = grid
  const t = now / 1000
  g.fillStyle = GAP_FILL
  g.fillRect(ox * dpr, oy * dpr, cols * cellW * dpr, rows * stepY * dpr)
  for (let row = 0; row < rows; row++) {
    const band = reducedMotion ? 0 : BAND_DEPTH * Math.sin(row * BAND_ROWS - t * BAND_SPEED)
    for (let col = 0; col < cols; col++) {
      const i = (row * cols + col) * 4
      const rgb = [sample[i], sample[i + 1], sample[i + 2]]
      for (let sy = 0; sy < SUB; sy++) {
        for (let sx = 0; sx < SUB; sx++) {
          const threshold = BAYER[(row * SUB + sy) % 4][(col * SUB + sx) % 4]
          const shown = threshold < dither.amount ? quantise(rgb, band, threshold) : rgb
          g.fillStyle = `rgb(${shown[0]},${shown[1]},${shown[2]})`
          fillSub({ g, dpr, gap, x: ox + col * cellW, y: oy + row * stepY, w: cellW, h: stepY, sx, sy })
        }
      }
    }
  }
}

const sampleCells = ({ dither, spec, fx, grid }) => {
  const { dpr, cols, rows, cellW, stepY, ox, oy } = grid
  if (!dither.g || dither.cells.width !== cols || dither.cells.height !== rows) {
    dither.cells = new OffscreenCanvas(cols, rows)
    dither.g = dither.cells.getContext('2d', { willReadFrequently: true })
    dither.g.imageSmoothingEnabled = false
  }
  const source = [ox * dpr, oy * dpr, cols * cellW * dpr, rows * stepY * dpr]
  dither.g.clearRect(0, 0, cols, rows)
  dither.g.drawImage(spec, ...source, 0, 0, cols, rows)
  dither.g.drawImage(fx, ...source, 0, 0, cols, rows)
  return dither.g.getImageData(0, 0, cols, rows).data
}

const quantise = (rgb, band, threshold) => rgb.map(value => {
  const level = Math.floor(Math.min(1, Math.max(0, value / 255 + band)) * (LEVELS - 1) + threshold)
  return Math.round(Math.min(LEVELS - 1, level) * 255 / (LEVELS - 1))
})

const fillSub = ({ g, dpr, gap, x, y, w, h, sx, sy }) => {
  const half = gap / 2
  const left = Math.round(x * dpr + half)
  const top = Math.round(y * dpr + half)
  const width = Math.round((x + w) * dpr + half) - left - gap
  const height = Math.round((y + h) * dpr + half) - top - gap
  const subLeft = left + Math.round(width * sx / SUB)
  const subTop = top + Math.round(height * sy / SUB)
  g.fillRect(subLeft, subTop, left + Math.round(width * (sx + 1) / SUB) - subLeft, top + Math.round(height * (sy + 1) / SUB) - subTop)
}
