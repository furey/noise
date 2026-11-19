export const INTRO_HOLD_MS = 300
export const INTRO_SPREAD_MS = 650
export const INTRO_FADE_MS = 160
export const INTRO_MS = INTRO_HOLD_MS + INTRO_SPREAD_MS + INTRO_FADE_MS
export const INTRO_STEPS = 4
export const INTRO_JITTER = 0.35

export const INTRO_PATTERNS = {
  scatter: () => null,
  up: ({ y }) => 1 - y,
  down: ({ y }) => y,
  left: ({ x }) => x,
  right: ({ x }) => 1 - x,
  centre: ({ x, y }) => Math.hypot(x - 0.5, y - 0.5) / Math.SQRT1_2,
  edges: ({ x, y }) => 1 - Math.max(Math.abs(x - 0.5), Math.abs(y - 0.5)) * 2,
}

export const createIntro = ({ cols, rows, pattern = pickPattern(Math.random), random = Math.random }) => ({
  elapsed: 0,
  pattern,
  delays: Float32Array.from({ length: cols * rows }, (_, index) => staggerDelay({
    order: orderOf({ pattern, col: index % cols, row: Math.floor(index / cols), cols, rows }),
    jitter: random(),
  })),
})

export const advanceIntro = (intro, dtMs) => {
  intro.elapsed += dtMs
  return intro.elapsed
}

export const isIntroDone = elapsed => elapsed >= INTRO_MS

export const cellReveal = (delay, elapsed) => {
  const t = Math.min(1, Math.max(0, (elapsed - delay) / INTRO_FADE_MS))
  return Math.floor(t * INTRO_STEPS) / INTRO_STEPS
}

export const pickPattern = random => {
  const names = Object.keys(INTRO_PATTERNS)
  return names[Math.floor(random() * names.length)]
}

const orderOf = ({ pattern, col, row, cols, rows }) => INTRO_PATTERNS[pattern]({
  x: cols > 1 ? col / (cols - 1) : 0,
  y: rows > 1 ? row / (rows - 1) : 0,
})

const staggerDelay = ({ order, jitter }) => {
  const scattered = order === null ? jitter ** 1.4 : order * (1 - INTRO_JITTER) + jitter * INTRO_JITTER
  return INTRO_HOLD_MS + scattered * INTRO_SPREAD_MS
}
