export const MAX_PIXELS = 80

const PIXEL_FLOOR = 0.12
const PIXEL_CURVE = 1.4
const RISE_S = { min: 0.07, spread: 0.1 }
const FADE = { min: 0.1, spread: 0.15 }
const CHANCE = { rose: 0.08, steady: 0.012 }
const MID_SHARE = 0.7

export const createPixels = () => ({
  count: 0,
  pool: Array.from({ length: MAX_PIXELS }, () => ({
    active: false, col: 0, row: 0, interval: 0, wait: 0, decay: 0, life: 0, tone: 'mid',
  })),
})

export const emitPixels = ({ pixels, chips, segments, volume, random = Math.random }) => {
  const intensity = PIXEL_FLOOR + (1 - PIXEL_FLOOR) * Math.pow(volume, PIXEL_CURVE)
  for (const chip of chips) {
    if (pixels.count >= MAX_PIXELS) return
    if (chip.role !== 'cap' || chip.y <= 0) continue
    const chance = (chip.rose ? CHANCE.rose : CHANCE.steady) * intensity
    if (random() > chance) continue
    const segment = Math.max(0, Math.min(segments - 1, Math.floor(chip.y * segments)))
    spawn({ pixels, col: chip.col, row: segments - 2 - segment, random })
  }
}

export const stepPixels = ({ pixels, dt }) => {
  for (const p of pixels.pool) {
    if (!p.active || !rise(p, dt)) continue
    p.active = false
    pixels.count -= 1
  }
  return pixels.count
}

export const clearPixels = pixels => {
  for (const p of pixels.pool) p.active = false
  pixels.count = 0
}

export const pixelAlpha = p => Math.ceil(p.life * 4) / 4

const spawn = ({ pixels, col, row, random }) => {
  const p = pixels.pool.find(slot => !slot.active)
  if (!p) return
  p.active = true
  p.col = col
  p.row = row
  p.interval = RISE_S.min + random() * RISE_S.spread
  p.wait = p.interval
  p.decay = FADE.min + random() * FADE.spread
  p.life = 1
  p.tone = random() < MID_SHARE ? 'mid' : 'low'
  pixels.count += 1
}

const rise = (p, dt) => {
  p.wait -= dt
  if (p.wait > 0) return false
  p.wait += p.interval
  p.row -= 1
  p.life -= p.decay
  return p.row < 0 || p.life <= 0
}
