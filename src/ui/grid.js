import { clamp } from './colours.js'

export const COLOUR_ROWS = 3
export const TIMER_MIN_TAP_PX = 44

const CELL_MIN_PX = 22
const CELL_MAX_PX = 30
const CELLS_ACROSS = 44
const MIN_COLS = 12
const MIN_ROWS = 8

export const NO_FRAME = Object.freeze({ top: 0, right: 0, bottom: 0, left: 0 })

export const measureGrid = ({ width, height, dpr, insets, framed = false }) => {
  const totalCols = Math.max(MIN_COLS, Math.round(width / clamp(width / CELLS_ACROSS, CELL_MIN_PX, CELL_MAX_PX)))
  const cellW = width / totalCols
  const usable = framed ? height : height - insets.bottom
  const totalRows = Math.max(MIN_ROWS, Math.round(usable / cellW))
  const stepY = usable / totalRows
  const frame = framed ? frameFor({ insets, cellW, stepY, framed }) : NO_FRAME
  const cols = totalCols - frame.left - frame.right
  const rows = totalRows - frame.top - frame.bottom
  const gap = Math.max(2, Math.round(cellW * 0.09 * dpr))
  const colourTop = rows - COLOUR_ROWS
  const edges = framed ? NO_FRAME : insets
  return {
    dpr, width, height, cols, cellW, stepY, rows, gap, insets, frame,
    ox: frame.left * cellW,
    oy: frame.top * stepY,
    synthRows: colourTop,
    colourTop,
    timerCol: cols - 2 - Math.ceil(edges.right / cellW),
    timerRow: Math.ceil(edges.top / stepY) + 1,
  }
}

const frameFor = ({ insets, cellW, stepY, framed }) => ({
  top: typeof framed === 'number' ? framed : Math.max(1, Math.ceil(insets.top / stepY)),
  right: Math.max(1, Math.ceil(insets.right / cellW)),
  bottom: Math.max(1, Math.ceil(insets.bottom / stepY) - 1),
  left: Math.max(1, Math.ceil(insets.left / cellW)),
})

export const zoneAt = (grid, y) => {
  if (!grid) return 'synth'
  return y - grid.oy >= grid.colourTop * grid.stepY ? 'colour' : 'synth'
}

export const synthHeight = grid => grid.synthRows * grid.stepY

export const posAtX = ({ grid, x, last }) => clamp(((x - grid.ox) / grid.cellW - 0.5) / (grid.cols - 1) * last, 0, last)

export const columnCentreX = (grid, x) => grid.ox + (clamp(Math.floor((x - grid.ox) / grid.cellW), 0, grid.cols - 1) + 0.5) * grid.cellW

export const inTimer = (grid, size, col, row) => {
  const cells = Math.max(1, size)
  return col <= grid.timerCol && col > grid.timerCol - cells && row >= grid.timerRow && row < grid.timerRow + cells
}

export const timerHitBox = (grid, size) => {
  const cells = Math.max(1, size)
  const width = Math.max(TIMER_MIN_TAP_PX, cells * grid.cellW)
  const height = Math.max(TIMER_MIN_TAP_PX, cells * grid.stepY)
  const centreX = grid.ox + (grid.timerCol + 1 - cells / 2) * grid.cellW
  const centreY = grid.oy + (grid.timerRow + cells / 2) * grid.stepY
  return { left: centreX - width / 2, top: centreY - height / 2, width, height }
}

export const fillCell = (g, grid, col, row) => fillScreenCell(g, grid, col + grid.frame.left, row + grid.frame.top)

export const fillScreenCell = (g, grid, col, row) => {
  const { dpr, gap, cellW, stepY } = grid
  const half = gap / 2
  const x = Math.round(col * cellW * dpr + half)
  const y = Math.round(row * stepY * dpr + half)
  const right = Math.round((col + 1) * cellW * dpr + half)
  const bottom = Math.round((row + 1) * stepY * dpr + half)
  g.fillRect(x, y, right - x - gap, bottom - y - gap)
}
