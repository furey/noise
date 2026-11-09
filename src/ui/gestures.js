export const TAP_SLOP_PX = 8
export const TAP_MAX_MS = 400
export const DOUBLE_TAP_MS = 350
export const DOUBLE_TAP_PX = 40

export const bindGestures = ({ surface, zoneAt, onPress, onDrag, onRelease, onTap, onHover }) => {
  const press = { id: null, zone: 'synth', x: 0, y: 0, t: 0, moved: false }
  const down = e => {
    if (e.target.closest('button, input') || e.button > 0 || press.id !== null) return
    surface.setPointerCapture(e.pointerId)
    Object.assign(press, { id: e.pointerId, zone: zoneAt(e.clientY), x: e.clientX, y: e.clientY, t: e.timeStamp, moved: false })
    onPress(press)
  }
  const move = e => {
    if (press.id !== e.pointerId) return e.pointerType === 'mouse' && onHover(zoneAt(e.clientY))
    press.moved ||= hasMoved(press, e.clientX, e.clientY)
    if (press.moved) onDrag({ zone: press.zone, x: e.clientX, dy: e.clientY - press.y })
  }
  const end = e => {
    if (press.id !== e.pointerId) return
    const kind = classifyRelease({ moved: press.moved, elapsed: e.timeStamp - press.t, cancelled: e.type === 'pointercancel' })
    press.id = null
    onRelease(press)
    if (kind === 'tap' && press.zone === 'synth') onTap({ x: e.clientX, y: e.clientY, t: e.timeStamp })
  }
  const listeners = { pointerdown: down, pointermove: move, pointerup: end, pointercancel: end }
  Object.entries(listeners).forEach(([type, listener]) => surface.addEventListener(type, listener))
  return () => Object.entries(listeners).forEach(([type, listener]) => surface.removeEventListener(type, listener))
}

export const hasMoved = (start, x, y) => Math.hypot(x - start.x, y - start.y) > TAP_SLOP_PX

export const classifyRelease = ({ moved, elapsed, cancelled }) => {
  if (cancelled) return 'none'
  if (moved) return 'drag'
  return elapsed < TAP_MAX_MS ? 'tap' : 'none'
}

export const createTapTracker = () => ({ t: -Infinity, x: 0, y: 0 })

export const registerTap = (tracker, tap) => {
  const isDouble = tap.t - tracker.t < DOUBLE_TAP_MS && Math.hypot(tap.x - tracker.x, tap.y - tracker.y) < DOUBLE_TAP_PX
  if (isDouble) resetTaps(tracker)
  else Object.assign(tracker, tap)
  return isDouble ? 'double' : 'single'
}

export const resetTaps = tracker => {
  tracker.t = -Infinity
}
