import { clamp } from './colours.js'

export const COLOUR_ROWS = 3
export const TIMER_MIN_TAP_PX = 44

const CELL_MIN_PX = 22
const SMALL_CELL_MIN_PX = 11
const SHRINK_FROM_PX = 440
const SHRINK_TO_PX = 220
const MOUSE_TAP_CELLS = 2
const CELL_MAX_PX = 30
const CELLS_ACROSS = 44
const MIN_COLS = 12
const MIN_ROWS = 8

const ROUNDED_TOP_ROWS = 3
const TITLEBAR_MARGIN_PX = 8

export const measureGrid = ({ width, height, dpr, insets, titlebar = 0, mouse = false }) => {
  const minCell = mouse ? smallestCell(Math.min(width, height)) : CELL_MIN_PX
  const cols = Math.max(MIN_COLS, Math.round(width / clamp(width / CELLS_ACROSS, minCell, CELL_MAX_PX)))
  const cellW = width / cols
  const rows = Math.max(MIN_ROWS, Math.round(height / cellW))
  const stepY = height / rows
  const rounded = insets.top > 0 || insets.bottom > 0
  const gap = Math.max(2, Math.round(cellW * 0.09 * dpr))
  const colourTop = rows - COLOUR_ROWS - (rounded ? homeBarRows(insets.bottom, stepY) : 0)
  return {
    dpr, width, height, cols, cellW, stepY, rows, gap, insets, rounded,
    tapMin: mouse ? MOUSE_TAP_CELLS * cellW : TIMER_MIN_TAP_PX,
    synthRows: colourTop,
    colourTop,
    timerCol: cols - 2 - Math.ceil(insets.right / cellW),
    timerRow: dotRow({ rounded, insets, titlebar, stepY }),
  }
}

const dotRow = ({ rounded, insets, titlebar, stepY }) => {
  const clearTitlebar = titlebar > 0 ? Math.ceil((titlebar + TITLEBAR_MARGIN_PX) / stepY) : 1
  if (!rounded) return clearTitlebar
  return Math.max(ROUNDED_TOP_ROWS, clearTitlebar, Math.ceil(insets.top / stepY))
}

const smallestCell = shortSide => {
  const t = clamp((shortSide - SHRINK_TO_PX) / (SHRINK_FROM_PX - SHRINK_TO_PX), 0, 1)
  return SMALL_CELL_MIN_PX + (CELL_MIN_PX - SMALL_CELL_MIN_PX) * t
}

const homeBarRows = (bottomInset, stepY) => Math.max(1, Math.ceil(bottomInset / stepY))

export const zoneAt = (grid, y) => {
  if (!grid) return 'synth'
  const row = Math.floor(y / grid.stepY)
  return row >= grid.colourTop && row < grid.colourTop + COLOUR_ROWS ? 'colour' : 'synth'
}

export const synthHeight = grid => grid.synthRows * grid.stepY

export const posAtX = ({ grid, x, last }) => clamp((x / grid.cellW - 0.5) / (grid.cols - 1) * last, 0, last)

export const columnCentreX = (grid, x) => (clamp(Math.floor(x / grid.cellW), 0, grid.cols - 1) + 0.5) * grid.cellW

export const inTimer = (grid, size, col, row) => row === grid.timerRow && col <= grid.timerCol && col > grid.timerCol - Math.max(1, size)

export const isReserved = (grid, size, col, row) => inTimer(grid, size, col, row) || inWaveDot(grid, col, row)

export const inWaveDot = (grid, col, row) => col === waveCol(grid) && row === grid.timerRow

export const waveCol = grid => grid.cols - 1 - grid.timerCol

export const waveHitBox = grid => {
  const timer = timerHitBox(grid, 0)
  return { ...timer, left: grid.width - timer.left - timer.width }
}

export const timerHitBox = (grid, size) => {
  const cells = Math.max(1, size)
  const width = Math.max(grid.tapMin, cells * grid.cellW)
  const height = Math.max(grid.tapMin, grid.stepY)
  const centreX = (grid.timerCol + 1 - cells / 2) * grid.cellW
  const centreY = (grid.timerRow + 0.5) * grid.stepY
  return { left: centreX - width / 2, top: centreY - height / 2, width, height }
}

export const fillCell = (g, grid, col, row) => {
  const { dpr, gap, cellW, stepY } = grid
  const half = gap / 2
  const x = Math.round(col * cellW * dpr + half)
  const y = Math.round(row * stepY * dpr + half)
  const right = Math.round((col + 1) * cellW * dpr + half)
  const bottom = Math.round((row + 1) * stepY * dpr + half)
  g.fillRect(x, y, right - x - gap, bottom - y - gap)
}
