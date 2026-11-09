export const INTRO_SPREAD_MS = 650
export const INTRO_FADE_MS = 160
export const INTRO_MS = INTRO_SPREAD_MS + INTRO_FADE_MS
export const INTRO_STEPS = 4

export const createIntro = ({ cells, random = Math.random }) => ({
  start: null,
  delays: Float32Array.from({ length: cells }, () => staggerDelay(random())),
})

export const introElapsed = (intro, now) => {
  intro.start ??= now
  return now - intro.start
}

export const isIntroDone = elapsed => elapsed >= INTRO_MS

export const cellReveal = (delay, elapsed) => {
  const t = Math.min(1, Math.max(0, (elapsed - delay) / INTRO_FADE_MS))
  return Math.floor(t * INTRO_STEPS) / INTRO_STEPS
}

const staggerDelay = r => r ** 1.4 * INTRO_SPREAD_MS
