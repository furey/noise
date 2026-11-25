export const TIERS = 6
export const SPRITE_PX = 48
export const GLOW_SCALE = 3.4
export const SHUTTER_S = 1 / 34
export const MAX_STRETCH = 1

const DRAG_PER_S = 2.1
const FLOW_PX_PER_S = 64
const FLOW_CELL_PX = 210
const FLOW_DRIFT = 0.24
const SPARK_SWAY = 0.2
const FADE_IN = 0.05
const FLICKER_DEPTH = 0.3
const STREAK_FROM_PX_PER_S = 70
const FIELDS = 8

export const pickBudget = ({ cores, pixels }) => {
  if (cores && cores <= 4) return 960
  return pixels > 2_500_000 ? 1920 : 2400
}

export const createEmbers = capacity => ({
  capacity, budget: capacity, count: 0, clock: 0,
  data: new Float32Array(capacity * FIELDS),
})

export const clearEmbers = embers => {
  embers.count = 0
}

export const spawnEmber = (embers, x, y, vx, vy, span, size, drift) => {
  if (embers.count >= embers.budget) return false
  const { data } = embers
  const o = embers.count * FIELDS
  data[o] = x
  data[o + 1] = y
  data[o + 2] = vx
  data[o + 3] = vy
  data[o + 4] = 0
  data[o + 5] = span
  data[o + 6] = size
  data[o + 7] = drift
  embers.count += 1
  return true
}

export const stepEmbers = (embers, dt) => {
  const { data } = embers
  embers.clock += dt
  const t = embers.clock
  const k = 2 * Math.PI / FLOW_CELL_PX
  const pull = 1 - Math.exp(-DRAG_PER_S * dt)
  const a1 = t * FLOW_DRIFT * 2.1
  const a2 = t * FLOW_DRIFT * 1.3
  const a3 = t * FLOW_DRIFT * -2.9 + 1.7
  const a4 = t * FLOW_DRIFT * 1.9 + 0.6
  let i = 0
  while (i < embers.count) {
    const o = i * FIELDS
    const age = data[o + 4] + dt
    if (age >= data[o + 5]) {
      embers.count -= 1
      data.copyWithin(o, embers.count * FIELDS, embers.count * FIELDS + FIELDS)
      continue
    }
    const x = data[o]
    const y = data[o + 1]
    const drift = data[o + 7]
    const sway = FLOW_PX_PER_S * (drift < 0 ? 1 : SPARK_SWAY)
    const flowX = sway * (-0.8 * Math.sin(k * x + a1) * Math.sin(k * 0.8 * y + a2) - 0.41 * Math.sin(k * 2.3 * x + a3) * Math.sin(k * 1.9 * y + a4))
    const flowY = sway * (-Math.cos(k * x + a1) * Math.cos(k * 0.8 * y + a2) - 0.5 * Math.cos(k * 2.3 * x + a3) * Math.cos(k * 1.9 * y + a4))
    const vx = data[o + 2] + (flowX - data[o + 2]) * pull
    const vy = data[o + 3] + (flowY + drift - data[o + 3]) * pull
    data[o] = x + vx * dt
    data[o + 1] = y + vy * dt
    data[o + 2] = vx
    data[o + 3] = vy
    data[o + 4] = age
    i += 1
  }
  return embers.count
}

export const drawEmbers = ({ g, embers, atlas, dpr, additive }) => {
  const { data, count, clock } = embers
  if (!count) return
  g.globalCompositeOperation = additive ? 'lighter' : 'source-over'
  for (let i = 0; i < count; i++) {
    const o = i * FIELDS
    const life = data[o + 4] / data[o + 5]
    const fade = life < FADE_IN ? life / FADE_IN : Math.min(1, (1 - life) * 2.2)
    const flicker = 1 - FLICKER_DEPTH * (0.5 + 0.5 * Math.sin(clock * (19 + data[o + 6] * 7) + i * 2.4))
    const alpha = fade * flicker
    if (alpha < 0.012) continue
    const vx = data[o + 2]
    const vy = data[o + 3]
    const speed = Math.sqrt(vx * vx + vy * vy)
    const half = data[o + 6] * GLOW_SCALE * (1 - life * 0.35) * dpr
    const stretch = Math.min(MAX_STRETCH, 1 + Math.max(0, speed - STREAK_FROM_PX_PER_S) * SHUTTER_S / (data[o + 6] * 1.6))
    const ux = speed > 1 ? vx / speed : 1
    const uy = speed > 1 ? vy / speed : 0
    const tier = Math.min(TIERS - 1, Math.floor(Math.pow(life, 0.8) * TIERS))
    g.globalAlpha = alpha
    g.setTransform(ux * half * stretch, uy * half * stretch, -uy * half, ux * half, data[o] * dpr, data[o + 1] * dpr)
    g.drawImage(atlas, tier * SPRITE_PX, 0, SPRITE_PX, SPRITE_PX, -1, -1, 2, 2)
  }
  g.setTransform(1, 0, 0, 1, 0, 0)
  g.globalAlpha = 1
  g.globalCompositeOperation = 'source-over'
}

export const buildAtlas = ({ doc, ramp, halo }) => {
  const canvas = doc.createElement('canvas')
  canvas.width = SPRITE_PX * TIERS
  canvas.height = SPRITE_PX
  const g = canvas.getContext('2d')
  const half = SPRITE_PX / 2
  ramp.forEach((core, tier) => {
    const x = tier * SPRITE_PX + half
    const glow = g.createRadialGradient(x, half, 0, x, half, half)
    glow.addColorStop(0, colour(core, 1))
    glow.addColorStop(0.2, colour(core, 1))
    glow.addColorStop(0.3, colour(mix(core, halo, 0.55), 0.8))
    glow.addColorStop(0.46, colour(halo, 0.4))
    glow.addColorStop(0.72, colour(halo, 0.12))
    glow.addColorStop(1, colour(halo, 0))
    g.fillStyle = glow
    g.fillRect(tier * SPRITE_PX, 0, SPRITE_PX, SPRITE_PX)
  })
  return canvas
}

export const buildDotAtlas = ({ doc, rgb }) => {
  const canvas = doc.createElement('canvas')
  canvas.width = SPRITE_PX * TIERS
  canvas.height = SPRITE_PX
  const g = canvas.getContext('2d')
  const half = SPRITE_PX / 2
  g.fillStyle = colour(rgb, 1)
  for (let tier = 0; tier < TIERS; tier++) {
    g.beginPath()
    g.arc(tier * SPRITE_PX + half, half, half / GLOW_SCALE * (1 - tier * 0.12), 0, Math.PI * 2)
    g.fill()
  }
  return canvas
}

export const heatRamp = ({ hot, mid, cool }) => [
  hot, hot, mix(hot, mid, 0.35), mix(hot, mid, 0.7), mid, mix(mid, cool, 0.6),
]

const mix = (a, b, t) => a.map((value, i) => Math.round(value + (b[i] - value) * t))

const colour = (rgb, alpha) => `rgba(${rgb.join(',')},${alpha})`
