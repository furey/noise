export const VISUALISERS = {
  rays: ({ grid, levels, col, row }) => {
    const { dx, dy, reach } = fromCentre(grid, col, row)
    const band = Math.abs(Math.atan2(dy, dx)) / Math.PI
    return Math.hypot(dx, dy) / reach < 0.12 + 0.88 * level(levels, band)
  },
  rings: ({ grid, levels, col, row, t }) => {
    const { dx, dy, reach } = fromCentre(grid, col, row)
    const r = Math.hypot(dx, dy) / reach
    const ring = (r * 7 - t * 1.6) % 1
    return r < 1 && (ring + 1) % 1 < level(levels, r) * 0.9
  },
  horizon: ({ grid, levels, col, row, t }) => {
    const { dy } = fromCentre(grid, col, row)
    const band = col / (grid.cols - 1)
    const swell = 0.55 + 0.45 * Math.sin(col * 0.42 - t * 2.2)
    return Math.abs(dy) < 0.5 + level(levels, band) * swell * grid.synthRows * 0.48
  },
  swell: ({ grid, levels, col, row }) => {
    const { dx, dy } = fromCentre(grid, col, row)
    const band = Math.abs(dx) / ((grid.cols - 1) / 2)
    return Math.abs(dy) < 0.5 + level(levels, band) * grid.synthRows * 0.48
  },
}

const fromCentre = (grid, col, row) => {
  const cx = (grid.cols - 1) / 2
  const cy = (grid.synthRows - 1) / 2
  const dx = col - cx
  const dy = (row - cy) * grid.stepY / grid.cellW
  return { dx, dy, reach: Math.hypot(cx, cy * grid.stepY / grid.cellW) }
}

const level = (levels, band) => levels[Math.round(Math.min(1, Math.max(0, band)) * (levels.length - 1))] ?? 0
