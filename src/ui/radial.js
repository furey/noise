export const MORPH_S = 1.8

const SPIN_PER_S = 0.1
const SPRING = 38
const DAMPING = 5.5
const WOBBLES = [{ k: 2, depth: 0.1, speed: 0.31 }, { k: 3, depth: 0.07, speed: -0.47 }, { k: 5, depth: 0.04, speed: 0.73 }]
const BREATH_PERIOD_S = 7
const BREATH_DEPTH = 0.1
const INNER_SCALE = 0.55
const INNER_SPIN = -2.5
const INNER_ROUNDING = 0.62
const PEAK_HOLD_S = 0.35
const PEAK_FALL_PER_S = 0.5
const STOPPED_FALL_SCALE = 3
const EMPTY_PEAK = 0.03
const EMIT_PER_S = 2.2
const FLIGHT_SHARE = 0.65
const FLOCK_SWIRL = 0.9
const EMIT_SPEED_GAIN = 4

export const createRadial = () => ({ radii: [], speeds: [], peaks: [], holds: [], spin: 0, morph: 0, delays: [] })

export const stepRadial = (radial, { levels, dt, volume, wave, playing, linearEmpty, reducedMotion, t, onEmit }) => {
  const tips = levels.length
  if (radial.radii.length !== tips) resetTips(radial, tips)
  if (wave && !radial.morph && linearEmpty) radial.morph = 1
  if (wave && !radial.wave && radial.morph > 0 && radial.morph < 1) restartFromCentre(radial, tips)
  radial.wave = wave
  if (!wave && radial.morph === 1 && isRadialEmpty(radial)) resetTips(radial, tips)
  radial.morph = approach(radial.morph, wave ? 1 : 0, dt / MORPH_S)
  if (!radial.morph) return
  radial.spin += reducedMotion ? 0 : dt * SPIN_PER_S
  const breath = reducedMotion ? 1 : 1 + BREATH_DEPTH * Math.sin(t / BREATH_PERIOD_S * Math.PI * 2)
  for (let i = 0; i < tips; i++) {
    const angle = tipAngle(radial, i, tips)
    const target = bandLevel(levels, angle - radial.spin) * breath * (1 + wobble(angle, t, reducedMotion))
    radial.speeds[i] += (SPRING * (target - radial.radii[i]) - DAMPING * radial.speeds[i]) * dt
    radial.radii[i] = Math.max(0, radial.radii[i] + radial.speeds[i] * dt)
    stepPeak(radial, i, dt * (playing ? 1 : STOPPED_FALL_SCALE))
  }
  if (playing && !reducedMotion && radial.morph === 1) emit(radial, { dt, volume, onEmit })
}

export const radialBloom = radial => smooth((radial.morph - 0.35) / 0.65)

export const linearShare = radial => 1 - smooth(radial.morph / 0.45)

export const isRadialSettled = radial => radial.morph === 0 || (isRadialEmpty(radial) && radial.radii.every(radius => radius < EMPTY_PEAK))

export const tipAngle = (radial, i, tips) => i / tips * Math.PI * 2 + radial.spin

export const innerRadiusAt = (radial, angle, mean) => (mean * INNER_ROUNDING + radiusAt(radial, angle - radial.spin * INNER_SPIN) * (1 - INNER_ROUNDING)) * INNER_SCALE

export const meanRadius = radial => radial.radii.reduce((sum, radius) => sum + radius, 0) / Math.max(1, radial.radii.length)

export const flockProgress = (radial, i) => smooth((radial.morph - radial.delays[i]) / FLIGHT_SHARE)

export const flight = ({ from, to, progress, centre, i }) => {
  const swirl = FLOCK_SWIRL * Math.sin(progress * Math.PI) * (i % 2 ? 1 : -1)
  const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }
  const bend = { x: (centre.x - mid.x) * 0.5 + (to.y - from.y) * swirl * 0.3, y: (centre.y - mid.y) * 0.5 - (to.x - from.x) * swirl * 0.3 }
  const u = 1 - progress
  return {
    x: u * u * from.x + 2 * u * progress * (mid.x + bend.x) + progress * progress * to.x,
    y: u * u * from.y + 2 * u * progress * (mid.y + bend.y) + progress * progress * to.y,
  }
}

const isRadialEmpty = radial => radial.peaks.every(peak => peak < EMPTY_PEAK)

const restartFromCentre = (radial, tips) => {
  const morph = radial.morph
  resetTips(radial, tips)
  radial.morph = morph
}

const resetTips = (radial, tips) => {
  Object.assign(radial, {
    morph: 0,
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

const emit = (radial, { dt, volume, onEmit }) => {
  for (let i = 0; i < radial.radii.length; i++) {
    const outward = Math.max(0, radial.speeds[i])
    if (Math.random() > radial.radii[i] * volume * EMIT_PER_S * dt * (1 + outward * EMIT_SPEED_GAIN)) continue
    onEmit(i, outward)
  }
}

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

const wobble = (angle, t, reducedMotion) => {
  if (reducedMotion) return 0
  let sum = 0
  for (const { k, depth, speed } of WOBBLES) sum += depth * Math.sin(k * angle + t * speed * Math.PI * 2)
  return sum
}

const approach = (value, target, step) => target > value ? Math.min(target, value + step) : Math.max(target, value - step)

const smooth = t => {
  const x = Math.min(1, Math.max(0, t))
  return x * x * (3 - 2 * x)
}
