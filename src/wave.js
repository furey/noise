export const WAVE_TICK_MS = 50
export const WAVE_GLIDE_S = 0.25

const SHORE = 0
const QUICK_RETURN_S = 0.3
const SWELL_VOLUME = 0.16
const RIPPLE_VOLUME = 0.025
const CRESTS = [
  { weight: 5, from: 0.7, to: 1.4 },
  { weight: 3, from: 1.4, to: 2.1 },
  { weight: 1, from: 2.1, to: 2.8 },
]

export const createWave = ({ seed = Date.now(), from = SHORE, quick = false } = {}) => {
  const random = mulberry32(seed)
  const wave = { random, segments: [], end: 0, ripples: rippleSet(random) }
  const seconds = quick ? QUICK_RETURN_S * from : between(random, 3, 5)
  if (seconds > 0) push(wave, { kind: 'fall', from, to: SHORE, seconds })
  return wave
}

export const waveAt = (wave, seconds) => {
  while (wave.end <= seconds || !wave.segments.length) breathe(wave)
  const segment = wave.segments.find(each => seconds < each.end)
  const t = (seconds - segment.start) / segment.seconds
  const pos = segment.from + (segment.to - segment.from) * easeInOut(t)
  return { pos, volume: volumeAt({ wave, seconds, pos }) }
}

export const forget = (wave, seconds) => {
  wave.segments = wave.segments.filter(segment => segment.end > seconds)
}

const breathe = wave => {
  const { random } = wave
  const crest = pickCrest(random)
  push(wave, { kind: 'rise', from: SHORE, to: crest, seconds: between(random, 4.5, 8) })
  push(wave, { kind: 'hold', from: crest, to: crest + between(random, -0.08, 0.08), seconds: between(random, 0.6, 2.2) })
  if (random() < 0.25) return ripple(wave)
  push(wave, { kind: 'fall', from: lastPos(wave), to: SHORE, seconds: between(random, 5, 9) })
  push(wave, { kind: 'rest', from: SHORE, to: SHORE, seconds: between(random, 1, 4) })
}

const ripple = wave => {
  const { random } = wave
  const trough = between(wave.random, 0.2, 0.45)
  push(wave, { kind: 'fall', from: lastPos(wave), to: trough, seconds: between(random, 3, 4.5) })
  push(wave, { kind: 'rise', from: trough, to: trough + between(random, 0.25, 0.5), seconds: between(random, 2.5, 4) })
  push(wave, { kind: 'fall', from: lastPos(wave), to: SHORE, seconds: between(random, 5, 8) })
  push(wave, { kind: 'rest', from: SHORE, to: SHORE, seconds: between(random, 1.5, 4) })
}

const push = (wave, segment) => {
  const start = wave.end
  wave.end = start + segment.seconds
  wave.segments.push({ ...segment, start, end: wave.end })
}

const lastPos = wave => wave.segments.at(-1).to

const volumeAt = ({ wave, seconds, pos }) => {
  const swell = Math.min(1, pos / CRESTS[1].to)
  const ripples = wave.ripples.reduce((sum, { period, phase }) => sum + Math.sin(seconds / period * Math.PI * 2 + phase), 0)
  return 1 - SWELL_VOLUME + SWELL_VOLUME * swell + RIPPLE_VOLUME * ripples / wave.ripples.length
}

const rippleSet = random => [7.3, 11.9, 17.1].map(period => ({ period: period * between(random, 0.8, 1.2), phase: random() * Math.PI * 2 }))

const pickCrest = random => {
  const total = CRESTS.reduce((sum, crest) => sum + crest.weight, 0)
  let roll = random() * total
  const crest = CRESTS.find(each => (roll -= each.weight) < 0) ?? CRESTS[0]
  return between(random, crest.from, crest.to)
}

const between = (random, low, high) => low + (high - low) * random()

const easeInOut = t => 0.5 - Math.cos(Math.PI * Math.min(1, Math.max(0, t))) / 2

const mulberry32 = seed => {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
