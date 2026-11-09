import { fillCell } from './grid.js'

export const BURST_KINDS = ['breaker', 'tide', 'ripple']

const SECONDS = { breaker: 2.2, tide: 2.4, ripple: 2 }
const FOAM = 'rgba(255,255,255,'
const WATER = 'rgba(30,120,255,'

export const isBurstLive = (burst, now) => Boolean(burst) && (now - burst.start) / 1000 < SECONDS[burst.kind]

export const drawBurst = ({ g, grid, burst, now, pos }) => {
  const t = (now - burst.start) / 1000 / SECONDS[burst.kind]
  if (t >= 1) return
  const rows = grid.rows
  const cells = PAINTERS[burst.kind]({ grid, t, rows, pos })
  for (const { col, row, colour, alpha } of cells) {
    g.fillStyle = `${colour}${alpha.toFixed(3)})`
    fillCell(g, grid, col, row)
  }
}

const breaker = ({ grid, t, rows }) => {
  const cells = []
  const crest = t * (grid.cols + 14) - 4
  for (let col = 0; col < grid.cols; col++) {
    const behind = crest - col
    if (behind < 0 || behind > 12) continue
    const swell = Math.sin(Math.min(1, behind / 3) * Math.PI / 2) * Math.exp(-behind / 7)
    const height = Math.round(swell * rows * 0.75)
    const fade = 1 - behind / 12
    for (let k = 0; k < height; k++) {
      const row = rows - 1 - k
      const top = k === height - 1
      cells.push({ col, row, colour: top ? FOAM : WATER, alpha: (top ? 0.95 : 0.6 + 0.3 * k / height) * fade })
    }
    if (behind < 2 && height > 2) cells.push({ col: col + 1, row: rows - height, colour: FOAM, alpha: 0.7 })
  }
  return cells
}

const tide = ({ grid, t, rows }) => {
  const cells = []
  const level = Math.sin(t * Math.PI) * rows * 0.9
  for (let col = 0; col < grid.cols; col++) {
    const surface = Math.round(level + Math.sin(col * 0.55 + t * 14) * 1.6)
    for (let k = 0; k < surface; k++) {
      const top = k === surface - 1
      cells.push({ col, row: rows - 1 - k, colour: top ? FOAM : WATER, alpha: top ? 0.95 : 0.55 + 0.3 * (1 - k / rows) })
    }
  }
  return cells
}

const ripple = ({ grid, t, rows, pos }) => {
  const cells = []
  const centre = { col: Math.round(pos / 4 * (grid.cols - 1)), row: rows - 2 }
  const reach = t * (grid.cols + rows) * 0.8
  for (let col = 0; col < grid.cols; col++) {
    for (let row = 0; row < rows; row++) {
      const distance = Math.abs(col - centre.col) + Math.abs(row - centre.row)
      for (let ring = 0; ring < 3; ring++) {
        const radius = reach - ring * 5
        if (radius < 0 || Math.abs(distance - radius) > 0.9) continue
        cells.push({ col, row, colour: ring ? WATER : FOAM, alpha: (1 - t * t) * (ring ? 0.85 : 1) })
      }
    }
  }
  return cells
}

const PAINTERS = { breaker, tide, ripple }
