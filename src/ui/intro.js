export const INTRO_HOLD_MS = 300
export const INTRO_SPREAD_MS = 650
export const INTRO_FADE_MS = 160
export const INTRO_MS = INTRO_HOLD_MS + INTRO_SPREAD_MS + INTRO_FADE_MS
export const INTRO_STEPS = 4

export const createIntro = ({ cells, random = Math.random }) => ({
  elapsed: 0,
  delays: Float32Array.from({ length: cells }, () => staggerDelay(random())),
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

const staggerDelay = r => INTRO_HOLD_MS + r ** 1.4 * INTRO_SPREAD_MS
