export const TAP_SLOP_PX = 8
export const TAP_MAX_MS = 400

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
    if (press.moved) onDrag({ zone: press.zone, x: e.clientX, dy: e.clientY - press.y, t: e.timeStamp })
  }
  const end = e => {
    if (press.id !== e.pointerId) return
    const kind = classifyRelease({ moved: press.moved, elapsed: e.timeStamp - press.t, cancelled: e.type === 'pointercancel' })
    press.id = null
    onRelease(press)
    if (kind === 'tap') onTap({ zone: press.zone, x: e.clientX, y: e.clientY, t: e.timeStamp })
  }
  const listeners = { pointerdown: down, pointermove: move, pointerup: end, pointercancel: end }
  Object.entries(listeners).forEach(([type, listener]) => surface.addEventListener(type, listener))
  return () => Object.entries(listeners).forEach(([type, listener]) => surface.removeEventListener(type, listener))
}

export const SWEEP_LEGS = 4
export const SWEEP_LEG_MS = 3000
export const SWEEP_EDGE = 0.25

export const createSweep = () => ({ legs: 0, end: null, t: 0 })

export const registerSweep = (sweep, { pos, last, t }) => {
  const end = pos <= SWEEP_EDGE ? 'brown' : pos >= last - SWEEP_EDGE ? 'violet' : null
  if (!end || end === sweep.end) return false
  const fresh = sweep.end === null || t - sweep.t > SWEEP_LEG_MS
  if (fresh) {
    Object.assign(sweep, { legs: 0, end: end === 'brown' ? 'brown' : null, t })
    return false
  }
  Object.assign(sweep, { legs: sweep.legs + 1, end, t })
  if (sweep.legs < SWEEP_LEGS) return false
  Object.assign(sweep, createSweep())
  return true
}

export const hasMoved = (start, x, y) => Math.hypot(x - start.x, y - start.y) > TAP_SLOP_PX

export const classifyRelease = ({ moved, elapsed, cancelled }) => {
  if (cancelled) return 'none'
  if (moved) return 'drag'
  return elapsed < TAP_MAX_MS ? 'tap' : 'none'
}

