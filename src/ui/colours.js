export const COLOURS = [
  { id: 'brown', name: 'Brown', hex: '#d69e2e' },
  { id: 'pink', name: 'Pink', hex: '#ed64a6' },
  { id: 'white', name: 'White', hex: '#e2e8f0' },
  { id: 'blue', name: 'Blue', hex: '#3b82f6' },
  { id: 'violet', name: 'Violet', hex: '#8b5cf6' },
]

export const LAST = COLOURS.length - 1

export const PALETTES = {
  brown: { low: '#ffd36b', mid: '#ff9a1f', high: '#fff3c9', ghost: 'rgba(255,255,255,.08)' },
  pink: { low: '#ffd6e8', mid: '#ff3d8f', high: '#ffffff', ghost: 'rgba(255,255,255,.1)' },
  white: { low: '#64748b', mid: '#334155', high: '#0f172a', ghost: 'rgba(15,23,42,.07)' },
  blue: { low: '#a5e4ff', mid: '#22b8ff', high: '#e0f7ff', ghost: 'rgba(255,255,255,.08)' },
  violet: { low: '#d8c8ff', mid: '#c45cff', high: '#fde7ff', ghost: 'rgba(255,255,255,.08)' },
}

export const IDLE_PALETTE = {
  low: '#cbd5e0',
  mid: '#a0aec0',
  high: '#edf2f7',
  ghost: 'rgba(255,255,255,.07)',
  rest: 'rgba(255,255,255,.2)',
}

export const LIGHT_INK = [255, 255, 255]
export const DARK_INK = [15, 23, 42]
export const COLOUR_ROW_SHADES = [0.12, 0, -0.12]

export const clampPos = pos => clamp(pos, 0, LAST)

export const nearestColour = pos => COLOURS[Math.round(clampPos(pos))]

export const paletteFor = ({ playing, pos }) => playing ? blendedPalette(pos) : IDLE_PALETTE

const BLEND_STEPS = 20
const blends = new Map()

const blendedPalette = pos => {
  const key = Math.round(clampPos(pos) * BLEND_STEPS)
  if (!blends.has(key)) blends.set(key, blendPalettes(key / BLEND_STEPS))
  return blends.get(key)
}

const blendPalettes = pos => {
  const lo = Math.min(Math.floor(pos), LAST - 1)
  const t = pos - lo
  const [from, to] = [PALETTES[COLOURS[lo].id], PALETTES[COLOURS[lo + 1].id]]
  if (t === 0) return from
  if (t === 1) return to
  const mix = tone => rgba(mixRgb(hexRgb(from[tone]), hexRgb(to[tone]), t), 1)
  return { low: mix('low'), mid: mix('mid'), high: mix('high'), ghost: t < 0.5 ? from.ghost : to.ghost }
}

export const isDarkInk = ({ playing, pos }) => playing && nearestColour(pos).id === 'white'

export const layerOpacity = (pos, index) => {
  const lo = Math.floor(clampPos(pos))
  const t = clampPos(pos) - lo
  if (index === lo) return 1
  return index === lo + 1 ? t : 0
}

export const colourAt = pos => {
  const clamped = clampPos(pos)
  const lo = Math.min(Math.floor(clamped), LAST - 1)
  return mixRgb(hexRgb(COLOURS[lo].hex), hexRgb(COLOURS[lo + 1].hex), clamped - lo)
}

export const shadeRgb = (rgb, shade) => shade >= 0
  ? mixRgb(rgb, LIGHT_INK, shade)
  : mixRgb(rgb, [0, 0, 0], -shade)

export const slopeDb = pos => (clampPos(pos) - 2) * 3

export const slopeText = pos => {
  const value = slopeDb(pos)
  const sign = value < 0 ? 'minus ' : value > 0 ? 'plus ' : ''
  return `${sign}${Math.abs(value).toFixed(1)}`
}

export const inkRgb = tint => mixRgb(LIGHT_INK, DARK_INK, tint)

export const hexRgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))

export const mixRgb = (a, b, t) => a.map((value, i) => Math.round(value + (b[i] - value) * t))

export const rgba = (rgb, alpha) => `rgba(${rgb.join(',')},${alpha})`

export const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
