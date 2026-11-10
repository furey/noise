export const FOCUS_CLICK_MS = 150

export const isFocusClick = ({ focusedAt, now }) => now - focusedAt < FOCUS_CLICK_MS

export const ignoreFocusClicks = (target, clock = performance) => {
  const guard = { focusedAt: -Infinity, pressing: false, swallowClick: false }
  const swallow = e => {
    e.stopImmediatePropagation()
    e.preventDefault()
  }
  const listeners = {
    focus: e => {
      if (e.target === target) guard.focusedAt = clock.now()
    },
    pointerdown: e => {
      guard.swallowClick = false
      guard.pressing = isFocusClick({ focusedAt: guard.focusedAt, now: clock.now() })
      if (guard.pressing) swallow(e)
    },
    pointermove: e => guard.pressing && swallow(e),
    pointerup: e => {
      if (!guard.pressing) return
      guard.pressing = false
      guard.swallowClick = true
      swallow(e)
    },
    pointercancel: () => {
      guard.pressing = false
    },
    click: e => {
      if (!guard.swallowClick) return
      guard.swallowClick = false
      swallow(e)
    },
  }
  Object.entries(listeners).forEach(([type, listener]) => target.addEventListener(type, listener, type !== 'focus'))
  return () => Object.entries(listeners).forEach(([type, listener]) => target.removeEventListener(type, listener, type !== 'focus'))
}
