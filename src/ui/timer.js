export const TIMER_MINUTES = [0, 60, 50, 40, 30, 20, 10]
export const TIMER_STEP_MS = 10 * 60000
export const TIMER_FADE_MS = 60000
export const TIMER_OFF_ALPHA = 0.33
export const TIMER_BLINK_LOW = 0.66
export const TIMER_BLINK_MS = 1000

export const createTimer = () => ({ index: 0, left: 0, fading: false })

export const cycleTimer = timer => {
  const index = (timer.index + 1) % TIMER_MINUTES.length
  return { index, left: TIMER_MINUTES[index] * 60000, fading: false }
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

export const timerSquares = timer => Math.ceil(timer.left / TIMER_STEP_MS)

export const timerMinutesLeft = timer => Math.ceil(timer.left / 60000)

export const timerAlpha = ({ timer, playing, now, reducedMotion }) => {
  if (!isTimerOn(timer)) return TIMER_OFF_ALPHA
  if (!playing || reducedMotion) return 1
  return Math.floor(now / (TIMER_BLINK_MS / 2)) % 2 ? TIMER_BLINK_LOW : 1
}

export const timerLabel = timer => isTimerOn(timer)
  ? `Timer, ${timerMinutesLeft(timer)} minutes left`
  : 'Timer off'
