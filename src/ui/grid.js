import { clamp } from './colours.js'

export const COLOUR_ROWS = 3
export const TIMER_MIN_TAP_PX = 44

const CELL_MIN_PX = 22
const CELL_MAX_PX = 30
const CELLS_ACROSS = 44
const MIN_COLS = 12
const MIN_ROWS = 8

export const measureGrid = ({ width, height, dpr, insets }) => {
  const cols = Math.max(MIN_COLS, Math.round(width / clamp(width / CELLS_ACROSS, CELL_MIN_PX, CELL_MAX_PX)))
  const cellW = width / cols
  const usable = height - insets.bottom
  const rows = Math.max(MIN_ROWS, Math.round(usable / cellW))
  const stepY = usable / rows
  const gap = Math.max(2, Math.round(cellW * 0.09 * dpr))
  const colourTop = rows - COLOUR_ROWS
  return {
    dpr, width, height, cols, cellW, stepY, rows, gap, insets,
    synthRows: colourTop,
    colourTop,
    timerCol: cols - 2 - Math.ceil(insets.right / cellW),
    timerRow: Math.ceil(insets.top / stepY) + 1,
  }
}

export const zoneAt = (grid, y) => {
  if (!grid) return 'synth'
  return y >= grid.colourTop * grid.stepY ? 'colour' : 'synth'
}

export const synthHeight = grid => grid.synthRows * grid.stepY

export const posAtX = ({ grid, x, last }) => clamp((x / grid.cellW - 0.5) / (grid.cols - 1) * last, 0, last)

export const columnCentreX = (grid, x) => (clamp(Math.floor(x / grid.cellW), 0, grid.cols - 1) + 0.5) * grid.cellW

export const inTimer = (grid, size, col, row) => {
  const cells = Math.max(1, size)
  return col <= grid.timerCol && col > grid.timerCol - cells && row >= grid.timerRow && row < grid.timerRow + cells
}

export const timerHitBox = (grid, size) => {
  const cells = Math.max(1, size)
  const width = Math.max(TIMER_MIN_TAP_PX, cells * grid.cellW)
  const height = Math.max(TIMER_MIN_TAP_PX, cells * grid.stepY)
  const centreX = (grid.timerCol + 1 - cells / 2) * grid.cellW
  const centreY = (grid.timerRow + cells / 2) * grid.stepY
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
