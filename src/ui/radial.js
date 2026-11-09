import { fillCell, isReserved } from './grid.js'

const PEAK_HOLD_S = 0.35
const PEAK_FALL_PER_S = 0.55
const PARTICLE_SPEED = 9
const PARTICLE_LIFE_S = 1.4
const EMIT_PER_S = 2.2
const MAX_PARTICLES = 160
const SPIN_PER_S = 0.12

export const createRadial = () => ({ peaks: new Float32Array(0), holds: new Float32Array(0), particles: [], spin: 0 })

export const stepRadial = (radial, { levels, dt, volume, mode, reducedMotion }) => {
  if (radial.peaks.length !== levels.length) Object.assign(radial, createRadial(), { peaks: new Float32Array(levels.length), holds: new Float32Array(levels.length) })
  radial.spin += reducedMotion ? 0 : dt * (mode === 'spin' ? 0.25 : SPIN_PER_S)
  levels.forEach((level, band) => {
    if (level >= radial.peaks[band]) {
      radial.peaks[band] = level
      radial.holds[band] = PEAK_HOLD_S
      return
    }
    radial.holds[band] -= dt
    if (radial.holds[band] <= 0) radial.peaks[band] = Math.max(level, radial.peaks[band] - PEAK_FALL_PER_S * dt)
  })
  if (!reducedMotion) emit(radial, { levels, dt, volume })
  radial.particles = radial.particles.filter(particle => stepParticle(particle, { dt, mode }))
}

export const drawRadial = ({ g, grid, radial, levels, size, mode, palette, ink }) => {
  const geometry = geometryFor(grid, mode)
  const lit = radialGradient({ g, grid, geometry, palette })
  for (let row = 0; row < grid.synthRows; row++) {
    for (let col = 0; col < grid.cols; col++) {
      if (isReserved(grid, size, col, row)) continue
      const { band, r } = polar({ geometry, col, row, spin: radial.spin, bands: levels.length })
      g.fillStyle = cellStyle({ r, level: levels[band] ?? 0, peak: radial.peaks[band] ?? 0, geometry, mode, lit, palette, ink })
      fillCell(g, grid, col, row)
    }
  }
  drawParticles({ g, grid, radial, geometry, size, palette })
}

const cellStyle = ({ r, level, peak, geometry, mode, lit, palette, ink }) => {
  const { hole, reach, ring } = geometry
  const span = reach - hole
  if (mode === 'hole') {
    const inner = reach - level * span
    const tip = reach - peak * span
    if (Math.abs(r - tip) < 0.5) return ink
    return r >= inner ? lit : palette.ghost
  }
  if (mode === 'ring') {
    const half = level * Math.min(ring - hole, reach - ring)
    const tip = peak * Math.min(ring - hole, reach - ring)
    if (Math.abs(Math.abs(r - ring) - tip) < 0.5) return ink
    return Math.abs(r - ring) <= half ? lit : palette.ghost
  }
  const outer = hole + level * span
  const tip = hole + peak * span
  if (Math.abs(r - tip) < 0.5) return ink
  return r <= outer ? lit : palette.ghost
}

const emit = (radial, { levels, dt, volume }) => {
  levels.forEach((level, band) => {
    if (radial.particles.length >= MAX_PARTICLES || Math.random() > level * volume * EMIT_PER_S * dt) return
    radial.particles.push({ band, side: Math.random() < 0.5 ? 1 : -1, offset: Math.random() - 0.5, peak: radial.peaks[band], travel: 0, life: PARTICLE_LIFE_S, tone: Math.random() < 0.5 ? 'mid' : 'high' })
  })
}

const stepParticle = (particle, { dt, mode }) => {
  particle.travel += PARTICLE_SPEED * dt * (0.6 + 0.4 * particle.life / PARTICLE_LIFE_S)
  particle.offset += mode === 'hole' || mode === 'spin' ? dt * 0.6 : 0
  particle.life -= dt
  return particle.life > 0
}

const drawParticles = ({ g, grid, radial, geometry, size, palette }) => {
  const { cx, cy, hole, reach, aspect, mode } = geometry
  const span = reach - hole
  for (const particle of radial.particles) {
    const start = mode === 'hole' ? reach - particle.peak * span : mode === 'ring' ? geometry.ring : hole + particle.peak * span
    const r = mode === 'hole' ? start - particle.travel : start + particle.travel
    if (r < hole) continue
    const angle = bandAngle({ band: particle.band + particle.offset, bands: radial.peaks.length, spin: radial.spin, side: particle.side })
    const col = Math.round(cx + Math.sin(angle) * r)
    const row = Math.round(cy + Math.cos(angle) * r / aspect)
    if (col < 0 || col >= grid.cols || row < 0 || row >= grid.synthRows || isReserved(grid, size, col, row)) continue
    g.globalAlpha = Math.min(1, particle.life / PARTICLE_LIFE_S * 1.5)
    g.fillStyle = palette[particle.tone]
    fillCell(g, grid, col, row)
  }
  g.globalAlpha = 1
}

const geometryFor = (grid, mode) => {
  const aspect = grid.stepY / grid.cellW
  const cx = (grid.cols - 1) / 2
  const cy = (grid.synthRows - 1) / 2
  const reach = Math.max(cx, cy * aspect) + 0.5
  const hole = mode === 'ring' ? 1.5 : 0
  return { cx, cy, aspect, reach, hole, ring: reach * 0.42, mode }
}

const polar = ({ geometry, col, row, spin, bands }) => {
  const dx = col - geometry.cx
  const dy = (row - geometry.cy) * geometry.aspect
  const r = Math.hypot(dx, dy)
  const turn = ((Math.atan2(dx, dy) - spin) / (Math.PI * 2) % 1 + 1) % 1
  const mirrored = turn <= 0.5 ? turn * 2 : (1 - turn) * 2
  return { r, band: Math.round(mirrored * (bands - 1)) }
}

const bandAngle = ({ band, bands, spin, side }) => side * band / (bands - 1) * Math.PI + spin

const radialGradient = ({ g, grid, geometry, palette }) => {
  const x = ((geometry.cx + 0.5) * grid.cellW) * grid.dpr
  const y = ((geometry.cy + 0.5) * grid.stepY) * grid.dpr
  const gradient = g.createRadialGradient(x, y, geometry.hole * grid.cellW * grid.dpr, x, y, geometry.reach * grid.cellW * grid.dpr)
  gradient.addColorStop(0, palette.high)
  gradient.addColorStop(0.45, palette.mid)
  gradient.addColorStop(1, palette.low)
  return gradient
}
