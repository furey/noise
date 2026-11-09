const COLOUR_COUNT = 5
const TARGET_RMS = 0.11
const CALIBRATION_SAMPLES = 1 << 16

const createVoice = seed => ({
  seed: seed >>> 0 || 1,
  b0: 0, b1: 0, b2: 0, b3: 0, b4: 0, b5: 0, b6: 0,
  brown: 0, prevPink: 0, prevWhite: 0,
})

const nextWhite = voice => {
  let x = voice.seed
  x ^= x << 13
  x ^= x >>> 17
  x ^= x << 5
  voice.seed = x >>> 0
  return voice.seed / 2147483648 - 1
}

const nextColours = (voice, out) => {
  const w = nextWhite(voice)
  voice.b0 = 0.99886 * voice.b0 + w * 0.0555179
  voice.b1 = 0.99332 * voice.b1 + w * 0.0750759
  voice.b2 = 0.969 * voice.b2 + w * 0.153852
  voice.b3 = 0.8665 * voice.b3 + w * 0.3104856
  voice.b4 = 0.55 * voice.b4 + w * 0.5329522
  voice.b5 = -0.7616 * voice.b5 - w * 0.016898
  const pink = voice.b0 + voice.b1 + voice.b2 + voice.b3 + voice.b4 + voice.b5 + voice.b6 + w * 0.5362
  voice.b6 = w * 0.115926
  voice.brown = 0.998 * voice.brown + 0.02 * w
  out[0] = voice.brown
  out[1] = pink
  out[2] = w
  out[3] = pink - voice.prevPink
  out[4] = w - voice.prevWhite
  voice.prevPink = pink
  voice.prevWhite = w
}

const calibrate = () => {
  const voice = createVoice(0x9e3779b9)
  const squares = new Float64Array(COLOUR_COUNT)
  const products = new Float64Array(COLOUR_COUNT - 1)
  const out = new Float64Array(COLOUR_COUNT)
  for (let i = 0; i < CALIBRATION_SAMPLES; i++) {
    nextColours(voice, out)
    for (let c = 0; c < COLOUR_COUNT; c++) squares[c] += out[c] * out[c]
    for (let c = 0; c < COLOUR_COUNT - 1; c++) products[c] += out[c] * out[c + 1]
  }
  const gains = Array.from(squares, sum => TARGET_RMS / Math.sqrt(sum / CALIBRATION_SAMPLES))
  const correlations = Array.from(products, (sum, c) => sum / Math.sqrt(squares[c] * squares[c + 1]))
  return { gains, correlations }
}

const mixWeights = (position, correlations, weights) => {
  const clamped = Math.max(0, Math.min(COLOUR_COUNT - 1, position))
  const lo = Math.floor(clamped)
  const hi = Math.min(lo + 1, COLOUR_COUNT - 1)
  const t = clamped - lo
  weights.fill(0)
  const a = Math.cos(t * Math.PI / 2)
  const b = Math.sin(t * Math.PI / 2)
  const norm = lo === hi ? 1 : 1 / Math.sqrt(a * a + b * b + 2 * a * b * correlations[lo])
  weights[lo] += a * norm
  weights[hi] += b * norm
  return weights
}

class NoiseProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{ name: 'position', defaultValue: 0, minValue: 0, maxValue: COLOUR_COUNT - 1, automationRate: 'k-rate' }]
  }

  constructor() {
    super()
    Object.assign(this, calibrate())
    this.voices = [createVoice(0x12345678), createVoice(0x87654321)]
    this.colours = new Float64Array(COLOUR_COUNT)
    this.weights = mixWeights(0, this.correlations, new Float64Array(COLOUR_COUNT))
    this.target = new Float64Array(COLOUR_COUNT)
  }

  process(_inputs, outputs, parameters) {
    const output = outputs[0]
    const target = mixWeights(parameters.position[0], this.correlations, this.target)
    const frames = output[0].length
    for (let ch = 0; ch < output.length; ch++) {
      const voice = this.voices[ch % this.voices.length]
      const data = output[ch]
      for (let i = 0; i < frames; i++) {
        const t = i / frames
        nextColours(voice, this.colours)
        let sample = 0
        for (let c = 0; c < COLOUR_COUNT; c++) {
          const weight = this.weights[c] + (target[c] - this.weights[c]) * t
          sample += this.colours[c] * this.gains[c] * weight
        }
        data[i] = sample
      }
    }
    this.target = this.weights
    this.weights = target
    return true
  }
}

registerProcessor('noise', NoiseProcessor)
