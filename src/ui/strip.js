import { COLOUR_ROWS } from './grid.js'
import { INTRO_FADE_MS, INTRO_STEPS } from './intro.js'

export const STRIP_ROW_MS = 110
export const STRIP_JITTER_MS = 140
export const STRIP_REVEAL_MS = (COLOUR_ROWS - 1) * STRIP_ROW_MS + STRIP_JITTER_MS + INTRO_FADE_MS

export const createStrip = ({ locked }) => ({ locked, elapsed: STRIP_REVEAL_MS, jitters: [] })

export const stepStrip = ({ strip, locked, cols, dt, reducedMotion }) => {
  if (strip.locked && !locked) Object.assign(strip, { elapsed: reducedMotion ? STRIP_REVEAL_MS : 0, jitters: jittersFor(cols) })
  strip.locked = locked
  if (strip.jitters.length !== cols) strip.jitters = jittersFor(cols)
  strip.elapsed = Math.min(STRIP_REVEAL_MS, strip.elapsed + dt * 1000)
  return isStripRevealing(strip)
}

export const isStripRevealing = strip => !strip.locked && strip.elapsed < STRIP_REVEAL_MS

export const stripCellAlpha = ({ strip, col, k }) => {
  if (strip.locked) return 0
  const fromBottom = COLOUR_ROWS - 1 - k
  const delay = fromBottom * STRIP_ROW_MS + (strip.jitters[col] ?? 0) * STRIP_JITTER_MS
  const t = Math.min(1, Math.max(0, (strip.elapsed - delay) / INTRO_FADE_MS))
  return Math.floor(t * INTRO_STEPS) / INTRO_STEPS
}

const jittersFor = cols => Array.from({ length: cols }, () => Math.random())
