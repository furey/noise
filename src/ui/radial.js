import { fillCell, isReserved } from './grid.js'

export const MORPH_S = 1.8

const SPIN_PER_S = 0.1
const SPRING = 38
const DAMPING = 5.5
const WOBBLES = [{ k: 2, depth: 0.1, speed: 0.31 }, { k: 3, depth: 0.07, speed: -0.47 }, { k: 5, depth: 0.04, speed: 0.73 }]
const BREATH_PERIOD_S = 7
const BREATH_DEPTH = 0.1
const INNER_SCALE = 0.55
const INNER_SPIN = -2.5
const PEAK_HOLD_S = 0.35
const PEAK_FALL_PER_S = 0.5
const PARTICLE_SPEED = 8
const PARTICLE_LIFE_S = 1.3
const EMIT_PER_S = 2.2
const MAX_PARTICLES = 160
const FLIGHT_SHARE = 0.65
const FLOCK_SWIRL = 0.9

export const createRadial = () => ({ radii: [], speeds: [], peaks: [], holds: [], particles: [], spin: 0, morph: 0, delays: [] })

export const stepRadial = (radial, { levels, dt, volume, wave, reducedMotion, t }) => {
  const tips = levels.length
  if (radial.radii.length !== tips) resetTips(radial, tips)
  radial.morph = approach(radial.morph, wave ? 1 : 0, dt / MORPH_S)
  if (!radial.morph) return
  radial.spin += reducedMotion ? 0 : dt * SPIN_PER_S
  const breath = reducedMotion ? 1 : 1 + BREATH_DEPTH * Math.sin(t / BREATH_PERIOD_S * Math.PI * 2)
  for (let i = 0; i < tips; i++) {
    const angle = tipAngle(radial, i, tips)
    const target = bandLevel(levels, angle - radial.spin) * breath * (1 + wobble(angle, t, reducedMotion))
    radial.speeds[i] += (SPRING * (target - radial.radii[i]) - DAMPING * radial.speeds[i]) * dt
    radial.radii[i] = Math.max(0, radial.radii[i] + radial.speeds[i] * dt)
    stepPeak(radial, i, dt)
  }
  if (!reducedMotion && radial.morph === 1) emit(radial, { dt, volume })
  radial.particles = radial.particles.filter(particle => stepParticle(particle, dt))
}

export const radialBloom = radial => smooth((radial.morph - 0.35) / 0.65)

export const linearShare = radial => 1 - smooth(radial.morph / 0.45)

export const drawRadial = ({ g, grid, radial, size, palette, ink }) => {
  const geometry = geometryFor(grid)
  const bloom = radialBloom(radial)
  if (!bloom) return
  const lit = radialGradient({ g, grid, geometry, palette })
  for (let row = 0; row < grid.synthRows; row++) {
    for (let col = 0; col < grid.cols; col++) {
      if (isReserved(grid, size, col, row)) continue
      const { r, angle } = polar(geometry, col, row)
      const edge = radiusAt(radial, angle) * geometry.reach * bloom
      if (r > edge + 0.5) continue
      const inner = radiusAt(radial, angle - radial.spin * INNER_SPIN) * geometry.reach * bloom * INNER_SCALE
      g.fillStyle = Math.abs(r - inner) < 0.5 ? palette.low : lit
      fillCell(g, grid, col, row)
    }
  }
  if (radial.morph === 1) drawTips({ g, grid, radial, geometry, size, ink })
  drawParticles({ g, grid, radial, geometry, size, palette })
}

export const drawFlock = ({ g, grid, radial, chips, size, ink }) => {
  if (radial.morph <= 0 || radial.morph >= 1) return
  const geometry = geometryFor(grid)
  const tips = radial.radii.length
  g.fillStyle = ink
  for (let i = 0; i < tips; i++) {
    const progress = smooth((radial.morph - radial.delays[i]) / FLIGHT_SHARE)
    const from = linearTip({ grid, chips, col: i })
    const to = radialTip({ radial, geometry, i, tips })
    const { col, row } = flight({ from, to, progress, centre: geometry, i })
    if (col < 0 || col >= grid.cols || row < 0 || row >= grid.synthRows || isReserved(grid, size, col, row)) continue
    fillCell(g, grid, col, row)
  }
}

const resetTips = (radial, tips) => {
  Object.assign(radial, {
    radii: Array(tips).fill(0), speeds: Array(tips).fill(0), peaks: Array(tips).fill(0), holds: Array(tips).fill(0),
    delays: Array.from({ length: tips }, (_, i) => (1 - FLIGHT_SHARE) * (0.6 * Math.abs(i / Math.max(1, tips - 1) - 0.5) * 2 + 0.4 * Math.random())),
  })
}

const stepPeak = (radial, i, dt) => {
  if (radial.radii[i] >= radial.peaks[i]) {
    radial.peaks[i] = radial.radii[i]
    radial.holds[i] = PEAK_HOLD_S
    return
  }
  radial.holds[i] -= dt
  if (radial.holds[i] <= 0) radial.peaks[i] = Math.max(radial.radii[i], radial.peaks[i] - PEAK_FALL_PER_S * dt)
}

const emit = (radial, { dt, volume }) => {
  radial.radii.forEach((radius, i) => {
    if (radial.particles.length >= MAX_PARTICLES || Math.random() > radius * volume * EMIT_PER_S * dt) return
    radial.particles.push({ i, from: radial.peaks[i], travel: 0, swirl: (Math.random() - 0.5) * 0.4, life: PARTICLE_LIFE_S, tone: Math.random() < 0.5 ? 'mid' : 'high' })
  })
}

const stepParticle = (particle, dt) => {
  particle.travel += PARTICLE_SPEED * dt * (0.5 + 0.5 * particle.life / PARTICLE_LIFE_S)
  particle.life -= dt
  return particle.life > 0
}

const drawTips = ({ g, grid, radial, geometry, size, ink }) => {
  g.fillStyle = ink
  radial.peaks.forEach((_, i) => {
    const { col, row } = radialTip({ radial, geometry, i, tips: radial.peaks.length })
    if (col < 0 || col >= grid.cols || row < 0 || row >= grid.synthRows || isReserved(grid, size, col, row)) return
    fillCell(g, grid, col, row)
  })
}

const drawParticles = ({ g, grid, radial, geometry, size, palette }) => {
  const tips = radial.peaks.length
  for (const particle of radial.particles) {
    const angle = tipAngle(radial, particle.i, tips) + particle.swirl * particle.travel / geometry.reach
    const r = particle.from * geometry.reach + 1 + particle.travel
    const { col, row } = cartesian(geometry, angle, r)
    if (col < 0 || col >= grid.cols || row < 0 || row >= grid.synthRows || isReserved(grid, size, col, row)) continue
    g.globalAlpha = Math.min(1, particle.life / PARTICLE_LIFE_S * 1.5)
    g.fillStyle = palette[particle.tone]
    fillCell(g, grid, col, row)
  }
  g.globalAlpha = 1
}

const linearTip = ({ grid, chips, col }) => {
  const chip = chips.find(each => each.col === col && each.role === 'cap')
  const row = grid.synthRows - 1 - Math.max(0, Math.min(grid.synthRows - 1, Math.floor((chip?.y ?? 0) * grid.synthRows)))
  return { col, row }
}

const radialTip = ({ radial, geometry, i, tips }) => cartesian(geometry, tipAngle(radial, i, tips), radial.peaks[i] * geometry.reach * radialBloom(radial) + 0.5)

const flight = ({ from, to, progress, centre, i }) => {
  const swirl = FLOCK_SWIRL * Math.sin(progress * Math.PI) * (i % 2 ? 1 : -1)
  const mid = { col: (from.col + to.col) / 2, row: (from.row + to.row) / 2 }
  const bend = { col: (centre.cx - mid.col) * 0.5 + (to.row - from.row) * swirl * 0.3, row: (centre.cy - mid.row) * 0.5 - (to.col - from.col) * swirl * 0.3 }
  const u = 1 - progress
  return {
    col: Math.round(u * u * from.col + 2 * u * progress * (mid.col + bend.col) + progress * progress * to.col),
    row: Math.round(u * u * from.row + 2 * u * progress * (mid.row + bend.row) + progress * progress * to.row),
  }
}

const geometryFor = grid => {
  const aspect = grid.stepY / grid.cellW
  const cx = (grid.cols - 1) / 2
  const cy = (grid.synthRows - 1) / 2
  return { cx, cy, aspect, reach: Math.max(cx, cy * aspect) + 0.5 }
}

const polar = (geometry, col, row) => {
  const dx = col - geometry.cx
  const dy = (row - geometry.cy) * geometry.aspect
  return { r: Math.hypot(dx, dy), angle: Math.atan2(dx, dy) }
}

const cartesian = (geometry, angle, r) => ({
  col: Math.round(geometry.cx + Math.sin(angle) * r),
  row: Math.round(geometry.cy + Math.cos(angle) * r / geometry.aspect),
})

const tipAngle = (radial, i, tips) => i / tips * Math.PI * 2 + radial.spin

const radiusAt = (radial, angle) => {
  const tips = radial.radii.length
  const turn = ((angle - radial.spin) / (Math.PI * 2) % 1 + 1) % 1 * tips
  const lo = Math.floor(turn) % tips
  const hi = (lo + 1) % tips
  const t = turn - Math.floor(turn)
  return radial.radii[lo] * (1 - t) + radial.radii[hi] * t
}

const bandLevel = (levels, angle) => {
  const turn = ((angle / (Math.PI * 2)) % 1 + 1) % 1
  const mirrored = turn <= 0.5 ? turn * 2 : (1 - turn) * 2
  return levels[Math.round(mirrored * (levels.length - 1))] ?? 0
}

const wobble = (angle, t, reducedMotion) => reducedMotion
  ? 0
  : WOBBLES.reduce((sum, { k, depth, speed }) => sum + depth * Math.sin(k * angle + t * speed * Math.PI * 2), 0)

const radialGradient = ({ g, grid, geometry, palette }) => {
  const x = (geometry.cx + 0.5) * grid.cellW * grid.dpr
  const y = (geometry.cy + 0.5) * grid.stepY * grid.dpr
  const gradient = g.createRadialGradient(x, y, 0, x, y, geometry.reach * grid.cellW * grid.dpr)
  gradient.addColorStop(0, palette.high)
  gradient.addColorStop(0.45, palette.mid)
  gradient.addColorStop(1, palette.low)
  return gradient
}

const approach = (value, target, step) => target > value ? Math.min(target, value + step) : Math.max(target, value - step)

const smooth = t => {
  const x = Math.min(1, Math.max(0, t))
  return x * x * (3 - 2 * x)
}
