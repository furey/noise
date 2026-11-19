import { clamp } from './colours.js'
import { measureGrid } from './grid.js'

export const EDGE_PX = 20
export const STRIP_PX = 52
export const STRIP_REACH_PX = 14
export const LINE_PX = 42
export const WATER_GAP = 1.2
export const CONTROL_PX = 36
export const CONTROL_GAP_PX = 14
export const TAP_MIN_PX = 44
export const BAR_SHARE = 0.56
export const DOT_PX = 7
export const DOT_GAP_PX = 6
export const TITLEBAR_MARGIN_PX = 8

export const chromeSizes = (scale = 1) => ({
  scale,
  edgePx: EDGE_PX * scale,
  stripPx: STRIP_PX * scale,
  stripReachPx: STRIP_REACH_PX * scale,
  linePx: LINE_PX * scale,
  controlPx: CONTROL_PX * scale,
  controlGapPx: CONTROL_GAP_PX * scale,
  dotPx: DOT_PX * scale,
  dotGapPx: DOT_GAP_PX * scale,
})

export const FULL_CHROME = Object.freeze(chromeSizes())

export const measureLayout = ({ width, height, dpr, insets, titlebar = 0, mouse = false, scale = 1 }) => {
  const sizes = chromeSizes(scale)
  const { edgePx, stripPx, linePx, controlPx, controlGapPx } = sizes
  const { cols } = measureGrid({ width, height, dpr, insets, titlebar, mouse })
  const left = Math.max(edgePx, insets.left + edgePx / 2)
  const right = width - Math.max(edgePx, insets.right + edgePx / 2)
  const controlTop = Math.max(edgePx, insets.top + edgePx / 2, titlebar + TITLEBAR_MARGIN_PX)
  const stripBottom = height - Math.max(edgePx, insets.bottom + edgePx / 2)
  const strip = { left, top: stripBottom - stripPx, width: right - left, height: stripPx }
  const pitch = (right - left) / cols
  const barW = Math.max(4, Math.round(pitch * BAR_SHARE))
  const base = Math.round(strip.top + (stripPx - linePx) / 2 - left * WATER_GAP)
  const top = controlTop + controlPx + controlGapPx
  return {
    ...sizes, width, height, dpr, insets, cols, left, right, pitch, barW, base, top, strip,
    span: base - top,
    travel: base - top - barW,
    controlY: controlTop + controlPx / 2,
    centre: { x: width / 2, y: (top + base) / 2 },
    reach: Math.max((right - left) / 2, (base - top) / 2),
  }
}

export const columnX = (layout, col) => layout.left + (col + 0.5) * layout.pitch

export const barTop = (layout, level) => layout.base - layout.barW - level * layout.travel

export const zoneAt = (layout, y) => {
  if (!layout) return 'synth'
  const { strip: { top, height }, stripReachPx } = layout
  return y >= top - stripReachPx && y <= top + height + stripReachPx ? 'colour' : 'synth'
}

export const synthHeight = layout => layout.span

export const thumbX = (layout, pos, last) => {
  const { strip: { left, width }, linePx } = layout
  return left + linePx / 2 + pos / last * (width - linePx)
}

export const posAtX = ({ grid: layout, x, last }) => {
  const { strip: { left, width }, linePx } = layout
  return clamp((x - left - linePx / 2) / (width - linePx) * last, 0, last)
}

export const columnCentreX = (_layout, x) => x

export const timerWidth = ({ controlPx, dotPx, dotGapPx }, size) => controlPx + (Math.max(1, size) - 1) * (dotPx + dotGapPx)

export const timerBox = (layout, size) => {
  const width = timerWidth(layout, size)
  return { left: layout.right - width, top: controlBoxTop(layout), width, height: layout.controlPx }
}

export const waveBox = layout => controlSquare(layout, layout.left)

export const musicBox = layout => controlSquare(layout, layout.width / 2 - layout.controlPx / 2)

export const timerHitBox = (layout, size) => hitBox(timerBox(layout, size))

export const musicHitBox = layout => hitBox(musicBox(layout))

export const waveHitBox = layout => hitBox(waveBox(layout))

const hitBox = box => {
  const width = Math.max(TAP_MIN_PX, box.width)
  const height = Math.max(TAP_MIN_PX, box.height)
  return { left: box.left + box.width / 2 - width / 2, top: box.top + box.height / 2 - height / 2, width, height }
}

const controlSquare = (layout, left) => ({ left, top: controlBoxTop(layout), width: layout.controlPx, height: layout.controlPx })

const controlBoxTop = layout => layout.controlY - layout.controlPx / 2
