export const FULL_SCALE_SIZE = Object.freeze({ width: 560, height: 420 })
export const MIN_UI_SCALE = 0.7

export const uiScale = ({ width, height }) =>
  Math.min(1, Math.max(MIN_UI_SCALE, Math.min(width / FULL_SCALE_SIZE.width, height / FULL_SCALE_SIZE.height)))
