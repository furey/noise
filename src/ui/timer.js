export const TIMER_STEPS = [{ size: 4, minutes: 60 }, { size: 3, minutes: 30 }, { size: 2, minutes: 15 }, { size: 1, minutes: 5 }]
export const TIMER_FADE_MS = 60000
export const TIMER_OFF_ALPHA = 0.33
export const TIMER_BLINK_LOW = 0.66
export const TIMER_BLINK_MS = 1000

export const createTimer = () => ({ left: 0, fading: false })

export const cycleTimer = timer => {
  const size = timerSize(timer)
  const next = size ? TIMER_STEPS.find(step => step.size === size - 1) : TIMER_STEPS[0]
  return { left: (next?.minutes ?? 0) * 60000, fading: false }
}

export const tickTimer = ({ timer, elapsed, playing }) => {
  if (!timer.left || !playing) return { timer, event: null }
  const left = Math.max(0, timer.left - elapsed)
  if (!left) return { timer: createTimer(), event: 'end' }
  const fading = left <= TIMER_FADE_MS
  const event = fading && !timer.fading ? 'fade' : null
  return { timer: { ...timer, left, fading }, event }
}

export const unfade = timer => timer.fading ? { ...timer, fading: false } : timer

export const isTimerOn = timer => timer.left > 0

export const timerSize = timer => {
  if (!isTimerOn(timer)) return 0
  const fits = TIMER_STEPS.findIndex((step, index) => timer.left > (TIMER_STEPS[index + 1]?.minutes ?? 0) * 60000)
  return TIMER_STEPS[fits].size
}

export const timerMinutesLeft = timer => Math.ceil(timer.left / 60000)

export const timerAlpha = ({ timer, playing, now, reducedMotion }) => {
  if (!isTimerOn(timer)) return TIMER_OFF_ALPHA
  if (!playing || reducedMotion) return 1
  return Math.floor(now / TIMER_BLINK_MS) % 2 ? TIMER_BLINK_LOW : 1
}

export const timerLabel = timer => isTimerOn(timer)
  ? `Timer, ${timerMinutesLeft(timer)} minutes left`
  : 'Timer off'
