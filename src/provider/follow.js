export const SLOPE_LOW_HZ = 60
export const SLOPE_HIGH_HZ = 10000
export const SILENT_DB = -90
export const SMOOTHING_S = 3
export const INK_EDGES = Object.freeze([1.5, 2.5])
export const INK_MARGIN = 0.12
export const CALIBRATION = Object.freeze({ brownDbPerOctave: -9.3, violetDbPerOctave: -2.6 })
export const LAST_POS = 4
export const REPORT_EVERY_S = 0.1
export const RETURN_S = 0.4
export const FOLLOW_EVERY_S = 1 / 15

export const thirdOctaveBands = ({ low = SLOPE_LOW_HZ, high = SLOPE_HIGH_HZ } = {}) => {
  const count = Math.floor(Math.log2(high / low) * 3) + 1
  return Array.from({ length: count }, (_, index) => {
    const centre = low * 2 ** (index / 3)
    return { centre, from: centre * 2 ** (-1 / 6), to: centre * 2 ** (1 / 6) }
  })
}

export const spectralSlope = ({ db, sampleRate, bands = BANDS }) => {
  const binHz = sampleRate / 2 / db.length
  const points = bands.map(band => ({ octave: Math.log2(band.centre), level: bandLevel({ db, binHz, band }) }))
    .filter(({ level }) => Number.isFinite(level))
  if (points.length < MIN_BANDS || Math.max(...points.map(({ level }) => level)) < SILENT_DB) return null
  return regressionSlope(points)
}

export const slopeToPos = (slope, { brownDbPerOctave, violetDbPerOctave } = CALIBRATION) => {
  const share = (slope - brownDbPerOctave) / (violetDbPerOctave - brownDbPerOctave)
  return Math.max(0, Math.min(LAST_POS, share * LAST_POS))
}

export const posToSlope = (pos, { brownDbPerOctave, violetDbPerOctave } = CALIBRATION) =>
  brownDbPerOctave + (pos / LAST_POS) * (violetDbPerOctave - brownDbPerOctave)

export const shownPos = state => state.track?.status !== 'idle' && Number.isFinite(state.track?.pos) ? state.track.pos : state.pos

export const createFollow = ({ calibration = CALIBRATION } = {}) => ({
  follower: createFollower({ calibration }), trackId: null, db: null, sinceReport: 0, sinceStep: 0, glide: { value: null, returning: false },
})

export const followSong = ({ follow, state, analyser, sampleRate, dt, report }) => {
  const { track } = state
  if (track.status !== 'active' || !analyser) return
  if (follow.trackId !== track.current.id) {
    follow.trackId = track.current.id
    follow.follower.start(Number.isFinite(track.pos) ? track.pos : state.pos)
  }
  follow.sinceStep += dt
  if (follow.sinceStep < FOLLOW_EVERY_S) return
  const stepDt = follow.sinceStep
  follow.sinceStep = 0
  if (follow.db?.length !== analyser.frequencyBinCount) follow.db = new Float32Array(analyser.frequencyBinCount)
  analyser.getFloatFrequencyData(follow.db)
  const pos = follow.follower.step({ db: follow.db, sampleRate, dt: stepDt })
  follow.sinceReport += stepDt
  if (pos === null || follow.sinceReport < REPORT_EVERY_S) return
  follow.sinceReport = 0
  report(pos)
}

export const glidePos = ({ follow, state, target, dt }) => {
  const { glide } = follow
  if (state.track.status !== 'idle') {
    Object.assign(glide, { value: target, returning: true })
    return target
  }
  follow.trackId = null
  if (!glide.returning || glide.value === null) return target
  glide.value += (target - glide.value) * (1 - Math.exp(-dt / RETURN_S))
  if (Math.abs(target - glide.value) > RETURN_CLOSE) return glide.value
  glide.returning = false
  return target
}

export const holdInk = ({ previous, next, edges = INK_EDGES, margin = INK_MARGIN }) => {
  if (previous === null) return next
  const edge = edges.find(at => (previous < at) !== (next < at))
  if (edge === undefined || Math.abs(next - edge) >= margin) return next
  return previous < edge ? Math.min(next, edge - EDGE_GAP) : Math.max(next, edge)
}

export const createFollower = ({ calibration = CALIBRATION, smoothingS = SMOOTHING_S } = {}) => {
  const follower = { slope: null, pos: null }
  return {
    step: ({ db, sampleRate, dt }) => step(follower, { db, sampleRate, dt, calibration, smoothingS }),
    start: pos => Object.assign(follower, { slope: posToSlope(pos, calibration), pos }),
    reset: () => Object.assign(follower, { slope: null, pos: null }),
    pos: () => follower.pos,
  }
}

const step = (follower, { db, sampleRate, dt, calibration, smoothingS }) => {
  const slope = spectralSlope({ db, sampleRate })
  if (slope === null) return follower.pos
  follower.slope = follower.slope === null ? slope : follower.slope + (slope - follower.slope) * (1 - Math.exp(-dt / smoothingS))
  follower.pos = holdInk({ previous: follower.pos, next: slopeToPos(follower.slope, calibration) })
  return follower.pos
}

const bandLevel = ({ db, binHz, band }) => {
  const first = Math.max(1, Math.ceil(band.from / binHz))
  const last = Math.min(db.length - 1, Math.floor(band.to / binHz))
  if (last < first) return Number.NaN
  let power = 0
  for (let bin = first; bin <= last; bin++) power += 10 ** (db[bin] / 10)
  return 10 * Math.log10(power / (last - first + 1))
}

const regressionSlope = points => {
  const meanX = points.reduce((sum, { octave }) => sum + octave, 0) / points.length
  const meanY = points.reduce((sum, { level }) => sum + level, 0) / points.length
  const covariance = points.reduce((sum, { octave, level }) => sum + (octave - meanX) * (level - meanY), 0)
  const variance = points.reduce((sum, { octave }) => sum + (octave - meanX) ** 2, 0)
  return covariance / variance
}

const BANDS = thirdOctaveBands()
const MIN_BANDS = 6
const EDGE_GAP = 1e-6
const RETURN_CLOSE = 0.002
