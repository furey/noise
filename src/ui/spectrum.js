const LOW_HZ = 20
const SPAN = 1000
const DB_FLOOR = -118
const DB_RANGE = 84
const CREST_HEIGHT = 0.94
const CREST_FLOOR_GAIN = 0.15
const CREST_REF_DECAY = 0.02
const LEVEL_DECAY = 0.88
const SILENT = 0.01

export const createSpectrum = () => ({
  cols: 0, levels: new Float32Array(0), raw: new Float32Array(0),
  lo: new Int32Array(0), hi: new Int32Array(0), bandsKey: '', crestRef: 0.5,
})

export const resizeSpectrum = (spectrum, cols) => {
  if (spectrum.cols === cols) return
  Object.assign(spectrum, {
    cols, levels: new Float32Array(cols), raw: new Float32Array(cols),
    lo: new Int32Array(cols), hi: new Int32Array(cols), bandsKey: '',
  })
}

export const readSpectrum = ({ spectrum, bins, nyquist, volume }) => {
  mapBands({ spectrum, binCount: bins.length, nyquist })
  const { raw, levels, lo, hi, cols } = spectrum
  let peak = 0
  for (let b = 0; b < cols; b++) {
    raw[b] = bandLevel({ bins, lo: lo[b], hi: hi[b] })
    peak = Math.max(peak, raw[b])
  }
  spectrum.crestRef = Math.max(peak, spectrum.crestRef - CREST_REF_DECAY * (spectrum.crestRef - peak))
  const scale = CREST_HEIGHT * displayGain(volume) / Math.max(0.05, spectrum.crestRef)
  for (let b = 0; b < cols; b++) levels[b] = Math.min(1, raw[b] * scale)
}

export const decaySpectrum = spectrum => {
  const { levels } = spectrum
  let active = false
  for (let b = 0; b < levels.length; b++) {
    levels[b] = levels[b] < SILENT ? 0 : levels[b] * LEVEL_DECAY
    active ||= levels[b] > 0
  }
  return active
}

export const displayGain = volume => CREST_FLOOR_GAIN + (1 - CREST_FLOOR_GAIN) * volume

const mapBands = ({ spectrum, binCount, nyquist }) => {
  const key = `${binCount}:${nyquist}`
  if (spectrum.bandsKey === key) return
  spectrum.bandsKey = key
  const binAt = edge => Math.floor(LOW_HZ * Math.pow(SPAN, edge / spectrum.cols) / nyquist * binCount)
  for (let b = 0; b < spectrum.cols; b++) {
    spectrum.lo[b] = binAt(b)
    spectrum.hi[b] = Math.max(spectrum.lo[b] + 1, binAt(b + 1))
  }
}

const bandLevel = ({ bins, lo, hi }) => {
  let sum = 0
  for (let i = lo; i < hi; i++) sum += bins[Math.min(i, bins.length - 1)]
  const level = (sum / (hi - lo) - DB_FLOOR) / DB_RANGE
  return Math.max(0, Math.min(1, level))
}
