const BPM = 170
const STEP_SAMPLES = sampleRate * 60 / BPM / 4
const STEPS_PER_BAR = 16
const TIDE_SAMPLES = STEP_SAMPLES * 32
const ECHO_SAMPLES = Math.round(STEP_SAMPLES * 6)
const REVERB_SAMPLES = [1031, 1327, 1523, 1871, 2153, 2459, 2861, 3323].map(each => Math.round(each * sampleRate / 48000))
const OCTAVES = 8
const LOWEST_MIDI = 24
const LAST_POSITION = 4
const PIECE_COUNT = 2
const BLOCK_FRAMES = 128
const STOP = 'stop'
const CROSSFADE_SECONDS = 2.5
const ACTIVE_FADE_SECONDS = 1
const POSITION_GLIDE_SECONDS = 0.15
const DRIFT_CALM_SECONDS = 0.4
const SLIDE_DRIFT = 0.05
const RISE_SECONDS = 0.05
const SILENT_LEVEL = 1e-4
const DENORMAL_GUARD = 1e-18
const SHEPARD_SIGMA = 8.5
const CHIP_VOLUME_STEPS = 15
const CHIP_LEVEL_SLEW = 1 - Math.exp(-1 / (0.025 * sampleRate))
const CHIP_WEIGHT_SLEW = 1 - Math.exp(-1 / (0.1 * sampleRate))
const CHIP_BREATH_SAMPLES = Math.round(0.11 * sampleRate)
const CHIP_BREATH_FALL = 1 - Math.exp(-1 / (0.035 * sampleRate))
const CHIP_BASS_SLIDE = 1 - Math.exp(-1 / (0.06 * sampleRate))
const CHIP_PANS = [-0.25, 0.25, 0.1, -0.1]
const CHIP_PAIR_PANS = [-0.15, 0.15, -0.15, 0.15]
const CHIP_CENTS = [0, 5, -3, 3]
const CHIP_SHEPARD_SIGMA = 5
const CHIP_VIBRATO_HZ = 4.5
const CHIP_VIBRATO_DEPTH = 0.004
const CHIP_VIBRATO_DELAY = Math.round(0.35 * sampleRate)
const CHIP_BASS_CENTRE = 46
const CHIP_BASS_DAMP_HZ = 1200
const CHIP_SPEAKER_HZ = 1000
const CHIP_ARPEGGIO = [0, 1, 2, 3, 2, 1]
const BOLD_STEP_SLEW = 1 - Math.exp(-1 / (0.004 * sampleRate))
const BOLD_ECHO_SAMPLES = Math.round(STEP_SAMPLES * 3)
const BOLD_ECHO_LEVEL = 0.4
const BOLD_ACCENT_POSITION = 3.3
const BOLD_SPEAKER_HZ = 3000
const BOLD_LEAD_WIDTH = 0.25
const BOLD_ACCENT_WIDTH = 0.125
const BOLD_PANS = [-0.25, 0.25, 0.3, -0.3, 0]
const BOLD_PAIR_PANS = [-0.15, 0.15, -0.15, 0.15, 0]
const BOLD_CENTS = [0, 5, -3, 3, 0]
const PANS = [-0.5, 0.5, -0.2, 0.2, -0.35, 0.35]
const PENTATONIC = [2, 5, 7, 9, 12]
const MOTIF_STEPS = 32
const REST_ODDS = [0.08, 0.2, 0.3, 0.5, 0.68]
const MOVES = [[-3, 0.5], [-2, 1.2], [-1, 3], [0, 0.8], [1, 3], [2, 1.2], [3, 0.5]]
const CHORD_BARS = [[2, 3.5], [4, 6.5]]
const CHORDS = {
  Dm: { tones: [2, 5, 9, 12], next: [['Bb', 4], ['F', 2], ['Gm', 2], ['C', 1], ['Am', 1]] },
  Bb: { tones: [10, 14, 17, 21], next: [['F', 3], ['C', 3], ['Dm', 2], ['Gm', 1]] },
  F: { tones: [5, 9, 12, 16], next: [['C', 3], ['Dm', 2], ['Bb', 2], ['Am', 2]] },
  C: { tones: [0, 4, 7, 9], next: [['Dm', 4], ['Am', 2], ['Bb', 2], ['F', 1]] },
  Gm: { tones: [7, 10, 14, 17], next: [['Dm', 3], ['C', 2], ['Bb', 2], ['Am', 1]] },
  Am: { tones: [9, 12, 16, 19], next: [['Dm', 3], ['Bb', 3], ['F', 1]] },
}

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

const clamp = (value, low, high) => Math.max(low, Math.min(high, value))
const mod = (value, size) => ((value % size) + size) % size
const midiHz = midi => 440 * 2 ** ((midi - 69) / 12)
const smoothCoef = seconds => 1 - Math.exp(-1 / (seconds * sampleRate))
const lowpassCoef = hz => 1 - Math.exp(-2 * Math.PI * Math.min(hz, sampleRate * 0.45) / sampleRate)
const powerOfTwoAbove = count => 2 ** Math.ceil(Math.log2(count + 1))
const moveToward = (value, target, step) => value < target ? Math.min(target, value + step) : Math.max(target, value - step)
const equalPower = blend => blend <= 0 ? 0 : blend >= 1 ? 1 : Math.sin(blend * Math.PI / 2)

const pick = (random, weighted) => {
  let total = 0
  for (let n = 0; n < weighted.length; n++) total += weighted[n][1]
  let roll = random() * total
  for (let n = 0; n < weighted.length; n++) {
    roll -= weighted[n][1]
    if (roll < 0) return weighted[n][0]
  }
  return weighted[0][0]
}

const metricLevel = step => {
  if (step % 16 === 0) return 0
  if (step % 8 === 0) return 1
  if (step % 4 === 0) return 2
  if (step % 2 === 0) return 3
  return 4
}

const gateVelocity = (density, level) => clamp(density - level + 0.5, 0, 1)

const createHarmony = random => {
  const harmony = { name: 'Dm', tones: CHORDS.Dm.tones, barsLeft: 4 }
  harmony.nextBar = () => {
    harmony.barsLeft -= 1
    if (harmony.barsLeft > 0) return false
    harmony.name = pick(random, CHORDS[harmony.name].next)
    harmony.tones = CHORDS[harmony.name].tones
    harmony.barsLeft = pick(random, CHORD_BARS)
    return true
  }
  return harmony
}

const createMotif = random => {
  const rewrite = (cell, step) => {
    cell.play = random() > REST_ODDS[metricLevel(step)]
    cell.move = pick(random, MOVES)
    return cell
  }
  const motif = { cells: Array.from({ length: MOTIF_STEPS }, (_, step) => rewrite({ play: false, move: 0 }, step)), start: 0 }
  motif.evolve = bar => {
    if (bar % 2 !== 0) return
    if (bar % 8 === 0 && random() < 0.45) {
      for (let step = 0; step < MOTIF_STEPS; step++) rewrite(motif.cells[step], step)
      motif.start = Math.floor(random() * 5) - 2
      return
    }
    for (let n = 0; n < 5; n++) {
      const step = Math.floor(random() * MOTIF_STEPS)
      rewrite(motif.cells[step], step)
    }
  }
  motif.at = step => motif.cells[step % MOTIF_STEPS]
  motif.loops = step => step % MOTIF_STEPS === 0
  return motif
}

const nearestOctave = (target, tone) => tone + 12 * Math.round((target - tone) / 12)

const nearestChordTone = (target, tones) => {
  let best = nearestOctave(target, tones[0])
  for (let n = 1; n < tones.length; n++) {
    const pitch = nearestOctave(target, tones[n])
    if (Math.abs(pitch - target) < Math.abs(best - target)) best = pitch
  }
  return best
}

const degreePitch = degree => PENTATONIC[mod(degree, 5)] + 12 * Math.floor(degree / 5)

const nearestDegree = pitch => {
  const guess = Math.round((pitch - 2) * 5 / 12)
  let best = guess
  for (let degree = guess - 2; degree <= guess + 2; degree++) {
    if (Math.abs(degreePitch(degree) - pitch) < Math.abs(degreePitch(best) - pitch)) best = degree
  }
  return best
}

const ladderPitch = (rung, tones) => tones[mod(rung, tones.length)] + 12 * Math.floor(rung / tones.length)

const nearestRung = (pitch, rung, tones) => {
  let best = rung
  for (let candidate = rung - tones.length; candidate <= rung + tones.length; candidate++) {
    if (Math.abs(ladderPitch(candidate, tones) - pitch) < Math.abs(ladderPitch(best, tones) - pitch)) best = candidate
  }
  return best
}

const triangle = phase => phase < 0.5 ? 4 * phase - 1 : 3 - 4 * phase

const polyBlep = (phase, inc) => {
  if (phase < inc) {
    const x = phase / inc
    return 2 * x - x * x - 1
  }
  if (phase > 1 - inc) {
    const x = (phase - 1) / inc
    return x * x + 2 * x + 1
  }
  return 0
}

const square = (phase, inc) => {
  const fall = phase >= 0.5 ? phase - 0.5 : phase + 0.5
  return (phase < 0.5 ? 1 : -1) + polyBlep(phase, inc) - polyBlep(fall, inc)
}

const pulse = (phase, inc, width) => {
  const fall = phase >= width ? phase - width : phase - width + 1
  return (phase < width ? 1 : -1) + polyBlep(phase, inc) - polyBlep(fall, inc) - (2 * width - 1)
}

const createBlock = () => new Float64Array(BLOCK_FRAMES)

const createStack = detuneCents => ({
  detune: 2 ** (detuneCents / 1200),
  base: LOWEST_MIDI,
  phases: new Float64Array(OCTAVES),
  incs: new Float64Array(OCTAVES),
  weights: new Float64Array(OCTAVES),
  value: 0,
})

const tuneStack = (stack, pitch) => {
  stack.base = LOWEST_MIDI + mod(pitch, 12)
  for (let k = 0; k < OCTAVES; k++) stack.incs[k] = midiHz(stack.base + 12 * k) * stack.detune / sampleRate
}

const weighStack = (stack, centre, sigma) => {
  let power = 0
  for (let k = 0; k < OCTAVES; k++) {
    const distance = (stack.base + 12 * k - centre) / sigma
    const weight = Math.exp(-0.5 * distance * distance)
    stack.weights[k] = weight < 0.02 ? 0 : weight
    power += stack.weights[k] ** 2
  }
  const norm = power > 0 ? 1 / Math.sqrt(power) : 0
  for (let k = 0; k < OCTAVES; k++) stack.weights[k] *= norm
}

const stepTriangles = stack => {
  const { phases, incs, weights } = stack
  let sum = 0
  for (let k = 0; k < OCTAVES; k++) {
    const weight = weights[k]
    if (weight === 0) continue
    let phase = phases[k] + incs[k]
    if (phase >= 1) phase -= 1
    phases[k] = phase
    sum += weight * triangle(phase)
  }
  stack.value = sum
}

const stepSquares = stack => {
  const { phases, incs, weights } = stack
  let sum = 0
  for (let k = 0; k < OCTAVES; k++) {
    const weight = weights[k]
    if (weight === 0) continue
    let phase = phases[k] + incs[k]
    if (phase >= 1) phase -= 1
    phases[k] = phase
    sum += weight * square(phase, incs[k])
  }
  stack.value = sum
}

const createSwell = riseSeconds => ({ gate: 0, hold: 0, first: 0, value: 0, rise: smoothCoef(riseSeconds), fall: smoothCoef(1) })

const press = (swell, peak, holdSeconds, fallSeconds) => {
  swell.gate = peak
  swell.hold = Math.round(holdSeconds * sampleRate)
  swell.fall = smoothCoef(fallSeconds)
}

const stepSwell = swell => {
  if (swell.hold > 0) swell.hold -= 1
  else swell.gate = 0
  swell.first += (swell.gate - swell.first) * (swell.gate > swell.first ? swell.rise : swell.fall)
  swell.value += (swell.first - swell.value) * (swell.first > swell.value ? swell.rise : swell.fall)
  if (swell.gate === 0 && swell.first < 1e-7 && swell.value < 1e-7) {
    swell.first = 0
    swell.value = 0
  }
}

const createVoice = pan => ({
  stack: createStack(pan * 8),
  swell: createSwell(RISE_SECONDS),
  left: Math.cos((pan + 1) * Math.PI / 4),
  right: Math.sin((pan + 1) * Math.PI / 4),
})

const quietest = voices => {
  let best = voices[0]
  for (let n = 1; n < voices.length; n++) {
    if (voices[n].swell.value < best.swell.value) best = voices[n]
  }
  return best
}

const createSub = () => {
  const swell = createSwell(0.09)
  const glide = smoothCoef(0.06)
  const sub = { out: createBlock(), midMix: 0.35, hz: 82, target: 82, phase: 0 }
  sub.play = (midi, velocity) => {
    sub.target = midiHz(midi)
    press(swell, velocity, 0.6, 0.9)
  }
  sub.render = count => {
    for (let i = 0; i < count; i++) {
      stepSwell(swell)
      sub.hz += (sub.target - sub.hz) * glide
      sub.phase += sub.hz / sampleRate
      if (sub.phase >= 1) sub.phase -= 1
      sub.out[i] = swell.value * (Math.sin(2 * Math.PI * sub.phase) * (1 - sub.midMix) + triangle((sub.phase * 2) % 1) * sub.midMix)
    }
  }
  return sub
}

const createPad = () => {
  const bank = () => Array.from({ length: 4 }, () => [createStack(-5), createStack(5)])
  const pad = { banks: [bank(), bank()], gains: [0, 0], live: 0, left: createBlock(), right: createBlock() }
  const fade = smoothCoef(0.45)
  pad.setChord = tones => {
    pad.live = 1 - pad.live
    const live = pad.banks[pad.live]
    for (let n = 0; n < 4; n++) {
      tuneStack(live[n][0], tones[n])
      tuneStack(live[n][1], tones[n])
    }
  }
  pad.weigh = (centre, sigma) => {
    for (let b = 0; b < 2; b++) {
      for (let n = 0; n < 4; n++) {
        weighStack(pad.banks[b][n][0], centre, sigma)
        weighStack(pad.banks[b][n][1], centre, sigma)
      }
    }
  }
  pad.render = count => {
    for (let i = 0; i < count; i++) {
      let left = 0
      let right = 0
      for (let b = 0; b < 2; b++) {
        pad.gains[b] += ((b === pad.live ? 1 : 0) - pad.gains[b]) * fade
        const gain = pad.gains[b]
        if (gain < SILENT_LEVEL) continue
        const tones = pad.banks[b]
        for (let n = 0; n < 4; n++) {
          stepTriangles(tones[n][0])
          stepTriangles(tones[n][1])
          left += gain * tones[n][0].value
          right += gain * tones[n][1].value
        }
      }
      pad.left[i] = left * 0.5
      pad.right[i] = right * 0.5
    }
  }
  return pad
}

const createLowpass2 = () => ({ a: 0, b: 0 })

const lowpass2 = (state, x, coef) => {
  state.a += (x - state.a) * coef
  state.b += (state.a - state.b) * coef
  return state.b
}

const createPingPong = ({ feedback, dampHz }) => {
  const size = powerOfTwoAbove(ECHO_SAMPLES)
  const mask = size - 1
  const left = new Float32Array(size)
  const right = new Float32Array(size)
  const damp = lowpassCoef(dampHz)
  const echo = { input: 0, left: 0, right: 0 }
  let write = 0
  echo.tick = () => {
    const read = (write - ECHO_SAMPLES) & mask
    echo.left += (left[read] - echo.left) * damp
    echo.right += (right[read] - echo.right) * damp
    left[write] = echo.input + echo.right * feedback
    right[write] = echo.left
    write = (write + 1) & mask
  }
  return echo
}

const createReverb = ({ feedback, dampHz }) => {
  const size = powerOfTwoAbove(REVERB_SAMPLES.at(-1))
  const mask = size - 1
  const count = REVERB_SAMPLES.length
  const lines = REVERB_SAMPLES.map(() => new Float32Array(size))
  const damped = new Float64Array(count)
  const damp = lowpassCoef(dampHz)
  const reverb = { inLeft: 0, inRight: 0, left: 0, right: 0 }
  let write = 0
  reverb.tick = () => {
    let sum = 0
    for (let n = 0; n < count; n++) {
      damped[n] += (lines[n][(write - REVERB_SAMPLES[n]) & mask] - damped[n]) * damp
      sum += damped[n]
    }
    const spread = sum * 2 / count
    let left = 0
    let right = 0
    for (let n = 0; n < count; n++) {
      const even = n % 2 === 0
      lines[n][write] = (even ? reverb.inLeft : reverb.inRight) + (damped[n] - spread) * feedback
      if (even) left += damped[n]
      else right += damped[n]
    }
    write = (write + 1) & mask
    reverb.left = left * 0.5
    reverb.right = right * 0.5
  }
  return reverb
}

const renderVoice = (voice, lead, count) => {
  const { swell, stack } = voice
  for (let i = 0; i < count; i++) {
    stepSwell(swell)
    if (swell.value < SILENT_LEVEL) continue
    stepSquares(stack)
    const tone = stack.value * swell.value
    lead.left[i] += tone * voice.left
    lead.right[i] += tone * voice.right
  }
}

const createSmooth = config => {
  const sub = createSub()
  const pad = createPad()
  const voices = PANS.map(createVoice)
  const lead = { left: createBlock(), right: createBlock() }
  const echo = createPingPong({ feedback: config.echoFeedback, dampHz: 2200 })
  const reverb = createReverb({ feedback: 0.87, dampHz: 3200 })
  const filters = [createLowpass2(), createLowpass2()]
  const mix = { centre: 60, cutoff: 0, bassGain: 0, leadGain: 0, tide: 0 }
  const sound = {}
  sound.chord = tones => pad.setChord(tones)
  sound.bass = (midi, velocity) => sub.play(midi, velocity)
  sound.step = () => {}
  sound.note = (pitch, velocity, fallSeconds) => {
    const voice = quietest(voices)
    tuneStack(voice.stack, pitch)
    if (config.shepard) weighStack(voice.stack, mix.centre, SHEPARD_SIGMA)
    else weighStack(voice.stack, pitch, 5)
    press(voice.swell, velocity, config.holdSeconds, fallSeconds)
  }
  sound.prepare = (position, clock) => {
    mix.centre = 60 + 7 * position
    pad.weigh(55 + 6 * position, 8)
    if (config.shepard) {
      for (let n = 0; n < voices.length; n++) weighStack(voices[n].stack, mix.centre, SHEPARD_SIGMA)
    }
    sub.midMix = 0.35 + 0.05 * position
    mix.cutoff = lowpassCoef(config.cutoffHz * 2 ** (0.55 * position))
    mix.bassGain = config.bassGain * (1 - 0.08 * position)
    mix.leadGain = config.leadGain * (1 - config.leadSlope * position)
    mix.tide = (1 - 0.3 * (0.5 - 0.5 * Math.cos(2 * Math.PI * clock / TIDE_SAMPLES))) * config.padGain
  }
  sound.fill = (left, right, start, count) => {
    sub.render(count)
    pad.render(count)
    lead.left.fill(DENORMAL_GUARD, 0, count)
    lead.right.fill(DENORMAL_GUARD, 0, count)
    for (let n = 0; n < voices.length; n++) renderVoice(voices[n], lead, count)
    for (let i = 0; i < count; i++) {
      const leadLeft = lowpass2(filters[0], lead.left[i], mix.cutoff)
      const leadRight = lowpass2(filters[1], lead.right[i], mix.cutoff)
      const padLeft = pad.left[i] * mix.tide
      const padRight = pad.right[i] * mix.tide
      echo.input = (leadLeft + leadRight) * 0.5
      echo.tick()
      reverb.inLeft = leadLeft * 0.3 + echo.left * config.echoSend + padLeft * 2
      reverb.inRight = leadRight * 0.3 + echo.right * config.echoSend + padRight * 2
      reverb.tick()
      const low = sub.out[i] * mix.bassGain
      left[start + i] = low + padLeft + reverb.left * 0.1 + (leadLeft + echo.left * config.echoMix + reverb.left * 0.3) * mix.leadGain
      right[start + i] = low + padRight + reverb.right * 0.1 + (leadRight + echo.right * config.echoMix + reverb.right * 0.3) * mix.leadGain
    }
  }
  return sound
}

const createChannel = (pan, detuneCents) => ({
  swell: createSwell(RISE_SECONDS),
  detune: 2 ** (detuneCents / 1200),
  level: 0,
  weight: 1,
  weightTarget: 1,
  phase: 0,
  inc: 0,
  pitch: -1,
  age: 0,
  wait: 0,
  width: 0.5,
  duty: 0.5,
  vibrato: 0,
  step: 0,
  wave: 0,
  out: createBlock(),
  next: { pitch: 0, velocity: 0, holdSeconds: 0, fallSeconds: 0, weight: 1, width: 0.5 },
  left: Math.cos((pan + 1) * Math.PI / 4),
  right: Math.sin((pan + 1) * Math.PI / 4),
})

const startNote = (channel, pitch, velocity, holdSeconds, fallSeconds, weight, width) => {
  const { next } = channel
  next.width = width
  next.pitch = pitch
  next.velocity = velocity
  next.holdSeconds = holdSeconds
  next.fallSeconds = fallSeconds
  next.weight = weight
  if (channel.wait > 0) return
  if (channel.level < SILENT_LEVEL || pitch === channel.pitch) return soundNext(channel)
  channel.wait = CHIP_BREATH_SAMPLES
  channel.swell.gate = 0
  channel.swell.hold = 0
  channel.swell.fall = CHIP_BREATH_FALL
}

const soundNext = channel => {
  const { next } = channel
  channel.pitch = next.pitch
  channel.inc = midiHz(next.pitch) * channel.detune / sampleRate
  channel.weightTarget = next.weight
  channel.width = next.width
  channel.age = 0
  press(channel.swell, next.velocity, next.holdSeconds, next.fallSeconds)
}

const stepLevel = channel => {
  if (channel.wait > 0 && --channel.wait === 0) soundNext(channel)
  channel.weight += (channel.weightTarget - channel.weight) * CHIP_WEIGHT_SLEW
  stepSwell(channel.swell)
  const stepped = Math.round(channel.swell.value * channel.weight * CHIP_VOLUME_STEPS) / CHIP_VOLUME_STEPS
  channel.level += (stepped - channel.level) * CHIP_LEVEL_SLEW
  if (stepped === 0 && channel.level < 1e-6) channel.level = 0
}

const advancePhase = channel => {
  channel.step = channel.inc
  if (channel.vibrato > 0 && channel.age++ > CHIP_VIBRATO_DELAY) {
    const fade = Math.min(1, (channel.age - CHIP_VIBRATO_DELAY) / CHIP_VIBRATO_DELAY)
    channel.step *= 1 + channel.vibrato * fade * Math.sin(2 * Math.PI * CHIP_VIBRATO_HZ * channel.age / sampleRate)
  }
  channel.phase += channel.step
  if (channel.phase >= 1) channel.phase -= 1
}

const renderPulse = (channel, count) => {
  for (let i = 0; i < count; i++) {
    stepLevel(channel)
    channel.out[i] = 0
    if (channel.level === 0) continue
    advancePhase(channel)
    channel.out[i] = pulse(channel.phase, channel.step, channel.duty) * channel.level
  }
}

const steppedTriangle = phase => Math.min(15, Math.floor((phase < 0.5 ? phase : 1 - phase) * 32)) / 7.5 - 1

const createChipBass = () => {
  const channel = createChannel(0, 0)
  const damp = lowpassCoef(CHIP_BASS_DAMP_HZ)
  const bass = { out: channel.out, filtered: 0 }
  let target = 0
  channel.swell.rise = smoothCoef(0.09)
  bass.play = (midi, velocity) => {
    target = midiHz(nearestOctave(CHIP_BASS_CENTRE, midi)) / sampleRate
    if (channel.level < SILENT_LEVEL) channel.inc = target
    press(channel.swell, velocity, 0.6, 0.9)
  }
  bass.render = count => {
    for (let i = 0; i < count; i++) {
      stepLevel(channel)
      channel.inc += (target - channel.inc) * CHIP_BASS_SLIDE
      channel.phase += channel.inc
      if (channel.phase >= 1) channel.phase -= 1
      bass.filtered += (steppedTriangle(channel.phase) - bass.filtered + DENORMAL_GUARD) * damp
      bass.out[i] = bass.filtered * channel.level
    }
  }
  return bass
}

const quieter = (a, b) => a.swell.value <= b.swell.value ? a : b

const createChip = config => {
  const pulses = CHIP_PANS.map((pan, n) => createChannel(config.shepard ? CHIP_PAIR_PANS[n] : pan, CHIP_CENTS[n]))
  const bass = createChipBass()
  const filters = [createLowpass2(), createLowpass2()]
  const mix = { centre: 60, chordCentre: 55, beatVelocity: 0, cutoff: 0, bassGain: 0, leadGain: 0, chordGain: 0 }
  const sound = {}
  pulses[0].vibrato = pulses[1].vibrato = config.shepard ? 0 : CHIP_VIBRATO_DEPTH
  let tones = CHORDS.Dm.tones
  let turn = 0

  const playPair = (pitch, velocity, fallSeconds) => {
    const low = pitch + 12 * Math.floor((mix.centre - pitch) / 12)
    const lowWeight = Math.exp(-0.5 * ((low - mix.centre) / CHIP_SHEPARD_SIGMA) ** 2)
    const highWeight = Math.exp(-0.5 * ((low + 12 - mix.centre) / CHIP_SHEPARD_SIGMA) ** 2)
    const norm = 1 / Math.sqrt(lowWeight * lowWeight + highWeight * highWeight)
    const lower = quieter(pulses[0], pulses[2])
    const upper = lower === pulses[0] ? pulses[1] : pulses[3]
    startNote(lower, low, velocity, config.holdSeconds, fallSeconds, lowWeight * norm)
    startNote(upper, low + 12, velocity, config.holdSeconds, fallSeconds, highWeight * norm)
  }

  sound.chord = next => {
    tones = next
  }
  sound.bass = (midi, velocity) => bass.play(midi, velocity)
  sound.note = (pitch, velocity, fallSeconds) => {
    if (config.shepard) return playPair(pitch, velocity, fallSeconds)
    startNote(quieter(pulses[0], pulses[1]), pitch, velocity, config.holdSeconds, fallSeconds, 1)
  }
  sound.step = step => {
    if (config.shepard) return
    const level = metricLevel(step)
    if (level > 2) return
    const velocity = level <= 1 ? 1 : mix.beatVelocity
    if (velocity <= 0.05) return
    const base = nearestRung(mix.chordCentre, Math.round((mix.chordCentre - tones[0]) / 3), tones)
    const pitch = ladderPitch(base + CHIP_ARPEGGIO[turn++ % CHIP_ARPEGGIO.length], tones)
    startNote(quieter(pulses[2], pulses[3]), pitch, 0.55 + 0.45 * velocity, 0.3, 1.3, 1)
  }
  sound.prepare = position => {
    mix.centre = 60 + 7 * position
    mix.chordCentre = 55 + 6 * position
    mix.beatVelocity = clamp(0.35 * position, 0, 1)
    pulses[0].duty = pulses[1].duty = 0.5 - 0.0625 * position
    pulses[2].duty = pulses[3].duty = config.shepard ? pulses[0].duty : 0.5
    mix.cutoff = lowpassCoef(CHIP_SPEAKER_HZ * 2 ** (0.52 * position))
    mix.bassGain = config.bassGain * (1 - 0.08 * position)
    mix.leadGain = config.leadGain * (1 - config.leadSlope * position)
    mix.chordGain = config.shepard ? mix.leadGain : config.padGain
  }
  sound.fill = (left, right, start, count) => {
    bass.render(count)
    for (let n = 0; n < pulses.length; n++) renderPulse(pulses[n], count)
    for (let i = 0; i < count; i++) {
      const a = pulses[0].out[i] * mix.leadGain
      const b = pulses[1].out[i] * mix.leadGain
      const c = pulses[2].out[i] * mix.chordGain
      const d = pulses[3].out[i] * mix.chordGain
      const low = bass.out[i] * mix.bassGain
      const sumLeft = a * pulses[0].left + b * pulses[1].left + c * pulses[2].left + d * pulses[3].left + DENORMAL_GUARD
      const sumRight = a * pulses[0].right + b * pulses[1].right + c * pulses[2].right + d * pulses[3].right + DENORMAL_GUARD
      left[start + i] = lowpass2(filters[0], sumLeft, mix.cutoff) + low
      right[start + i] = lowpass2(filters[1], sumRight, mix.cutoff) + low
    }
  }
  return sound
}

const stepBoldLevel = channel => {
  if (channel.wait > 0 && --channel.wait === 0) soundNext(channel)
  channel.weight += (channel.weightTarget - channel.weight) * CHIP_WEIGHT_SLEW
  stepSwell(channel.swell)
  const raw = channel.swell.value * channel.weight
  const decaying = channel.swell.gate === 0 && channel.wait === 0
  const target = decaying ? Math.round(raw * CHIP_VOLUME_STEPS) / CHIP_VOLUME_STEPS : raw
  channel.level += (target - channel.level) * BOLD_STEP_SLEW
  if (target === 0 && channel.level < 1e-6) channel.level = 0
}

const renderBoldPulse = (channel, count) => {
  for (let i = 0; i < count; i++) {
    stepBoldLevel(channel)
    channel.out[i] = 0
    if (channel.level === 0) continue
    advancePhase(channel)
    channel.out[i] = pulse(channel.phase, channel.step, channel.width) * channel.level
  }
}

const stairValue = stair => Math.min(15, stair < 16 ? stair : 31 - stair) / 7.5 - 1

const stepCleanStairs = channel => {
  const scaled = channel.phase * 32
  const stair = Math.min(31, Math.floor(scaled))
  const within = scaled - stair
  const edge = channel.inc * 32
  const value = stairValue(stair)
  channel.wave = value
  if (within < edge) channel.wave = value + polyBlep(within, edge) * (value - stairValue((stair + 31) % 32)) / 2
  else if (within > 1 - edge) channel.wave = value + polyBlep(within, edge) * (stairValue((stair + 1) % 32) - value) / 2
}

const createBoldBass = () => {
  const channel = createChannel(0, 0)
  const bass = { out: channel.out }
  let target = 0
  channel.swell.rise = smoothCoef(0.09)
  bass.play = (midi, velocity) => {
    target = midiHz(nearestOctave(CHIP_BASS_CENTRE, midi)) / sampleRate
    if (channel.level < SILENT_LEVEL) channel.inc = target
    press(channel.swell, velocity, 0.6, 0.9)
  }
  bass.render = count => {
    for (let i = 0; i < count; i++) {
      stepLevel(channel)
      channel.inc += (target - channel.inc) * CHIP_BASS_SLIDE
      channel.phase += channel.inc
      if (channel.phase >= 1) channel.phase -= 1
      stepCleanStairs(channel)
      bass.out[i] = channel.wave * channel.level
    }
  }
  return bass
}

const createEchoQueue = () => {
  const size = 16
  const queue = { due: new Float64Array(size), pitch: new Float64Array(size), velocity: new Float64Array(size), fall: new Float64Array(size), head: 0, count: 0 }
  queue.add = (due, pitch, velocity, fall) => {
    if (queue.count === size) return
    const slot = (queue.head + queue.count++) % size
    queue.due[slot] = due
    queue.pitch[slot] = pitch
    queue.velocity[slot] = velocity
    queue.fall[slot] = fall
  }
  queue.ready = now => queue.count > 0 && now >= queue.due[queue.head]
  queue.drop = () => {
    queue.head = (queue.head + 1) % size
    queue.count--
  }
  return queue
}

const createBold = config => {
  const pulses = BOLD_PANS.map((pan, n) => createChannel(config.shepard ? BOLD_PAIR_PANS[n] : pan, BOLD_CENTS[n]))
  const arpeggio = pulses[4]
  const bass = createBoldBass()
  const queue = createEchoQueue()
  const damped = new Float64Array(2)
  const mix = { centre: 60, chordCentre: 55, damp: 0, bassGain: 0, leadGain: 0, harmonyGain: 0 }
  const sound = {}
  pulses[0].vibrato = pulses[1].vibrato = config.shepard ? 0 : CHIP_VIBRATO_DEPTH
  let tones = CHORDS.Dm.tones
  let now = 0
  let accents = false
  let played = 0

  const leadWidth = () => accents && played++ % 4 === 0 ? BOLD_ACCENT_WIDTH : BOLD_LEAD_WIDTH

  const playPair = (pitch, velocity, fallSeconds) => {
    const low = pitch + 12 * Math.floor((mix.centre - pitch) / 12)
    const lowWeight = Math.exp(-0.5 * ((low - mix.centre) / CHIP_SHEPARD_SIGMA) ** 2)
    const highWeight = Math.exp(-0.5 * ((low + 12 - mix.centre) / CHIP_SHEPARD_SIGMA) ** 2)
    const norm = 1 / Math.sqrt(lowWeight * lowWeight + highWeight * highWeight)
    const lower = quieter(pulses[0], pulses[2])
    const upper = lower === pulses[0] ? pulses[1] : pulses[3]
    startNote(lower, low, velocity, config.holdSeconds, fallSeconds, lowWeight * norm, leadWidth())
    startNote(upper, low + 12, velocity, config.holdSeconds, fallSeconds, highWeight * norm, 0.5)
  }

  const soundDueEcho = () => {
    if (!queue.ready(now)) return
    startNote(pulses[2], queue.pitch[queue.head], queue.velocity[queue.head], config.holdSeconds, queue.fall[queue.head], 1, 0.5)
    queue.drop()
  }

  const framesToNextEcho = room => queue.count > 0 ? Math.max(1, Math.min(room, queue.due[queue.head] - now)) : room

  const fillSpan = (left, right, start, count) => {
    bass.render(count)
    for (let n = 0; n < pulses.length; n++) renderBoldPulse(pulses[n], count)
    for (let i = 0; i < count; i++) {
      const a = pulses[0].out[i] * mix.leadGain
      const b = pulses[1].out[i] * mix.leadGain
      const c = pulses[2].out[i] * mix.leadGain
      const d = pulses[3].out[i] * mix.leadGain
      const e = arpeggio.out[i] * mix.harmonyGain
      const low = bass.out[i] * mix.bassGain
      const sumLeft = a * pulses[0].left + b * pulses[1].left + c * pulses[2].left + d * pulses[3].left + e * arpeggio.left + DENORMAL_GUARD
      const sumRight = a * pulses[0].right + b * pulses[1].right + c * pulses[2].right + d * pulses[3].right + e * arpeggio.right + DENORMAL_GUARD
      damped[0] += (sumLeft - damped[0]) * mix.damp
      damped[1] += (sumRight - damped[1]) * mix.damp
      left[start + i] = damped[0] + low
      right[start + i] = damped[1] + low
    }
  }

  sound.chord = next => {
    tones = next
  }
  sound.bass = (midi, velocity) => bass.play(midi, velocity)
  sound.note = (pitch, velocity, fallSeconds) => {
    if (config.shepard) return playPair(pitch, velocity, fallSeconds)
    startNote(quieter(pulses[0], pulses[1]), pitch, velocity, config.holdSeconds, fallSeconds, 1, leadWidth())
    queue.add(now + BOLD_ECHO_SAMPLES, pitch, velocity * BOLD_ECHO_LEVEL, fallSeconds)
  }
  sound.step = step => {
    const base = nearestRung(mix.chordCentre, Math.round((mix.chordCentre - tones[0]) / 3), tones)
    arpeggio.inc = midiHz(ladderPitch(base + step % tones.length, tones)) / sampleRate
    if (step % STEPS_PER_BAR === 0) press(arpeggio.swell, 1, 0.7, 1.1)
  }
  sound.prepare = position => {
    mix.centre = 60 + 7 * position
    mix.chordCentre = 55 + 6 * position
    accents = position > BOLD_ACCENT_POSITION
    mix.damp = lowpassCoef(BOLD_SPEAKER_HZ * 2 ** (0.4 * position))
    mix.bassGain = config.bassGain * (1 - 0.08 * position)
    mix.leadGain = config.leadGain * (1 - config.leadSlope * position)
    mix.harmonyGain = config.harmonyGain
  }
  sound.fill = (left, right, start, count) => {
    let done = 0
    while (done < count) {
      soundDueEcho()
      const span = framesToNextEcho(count - done)
      fillSpan(left, right, start + done, span)
      now += span
      done += span
    }
  }
  return sound
}

const SOUNDS = {
  smooth: {
    liquid: () => createSmooth({ shepard: false, holdSeconds: 0.35, cutoffHz: 650, bassGain: 0.16, padGain: 0.12, leadGain: 0.14, leadSlope: 0.05, echoFeedback: 0.4, echoSend: 0.2, echoMix: 0.4 }),
    helix: () => createSmooth({ shepard: true, holdSeconds: 0.45, cutoffHz: 700, bassGain: 0.16, padGain: 0.12, leadGain: 0.13, leadSlope: 0.06, echoFeedback: 0.45, echoSend: 0.25, echoMix: 0.5 }),
  },
  chip: {
    liquid: () => createChip({ shepard: false, holdSeconds: 0.35, bassGain: 0.16, padGain: 0.095, leadGain: 0.16, leadSlope: 0.05 }),
    helix: () => createChip({ shepard: true, holdSeconds: 0.45, bassGain: 0.17, padGain: 0, leadGain: 0.205, leadSlope: 0.02 }),
  },
  bold: {
    liquid: () => createBold({ shepard: false, holdSeconds: 0.35, bassGain: 0.095, harmonyGain: 0.036, leadGain: 0.1, leadSlope: 0.05 }),
    helix: () => createBold({ shepard: true, holdSeconds: 0.45, bassGain: 0.095, harmonyGain: 0.036, leadGain: 0.105, leadSlope: 0.02 }),
  },
}

const createLiquid = (seed, sound) => {
  const random = mulberry32(seed)
  const harmony = createHarmony(random)
  const motif = createMotif(random)
  const feel = { leadCentre: 60, density: 0.9, fallSeconds: 1.3 }
  const time = { clock: 0, nextStep: 0 }
  let step = -1
  let contour = 0
  sound.chord(harmony.tones)

  const playLead = drift => {
    const cell = motif.at(step)
    if (motif.loops(step)) contour = motif.start
    if (!cell.play) return
    const sliding = Math.abs(drift) > SLIDE_DRIFT
    const move = sliding ? Math.sign(drift) * Math.max(1, Math.abs(cell.move)) : cell.move
    contour = clamp(contour + move, -5, 6)
    const level = metricLevel(step)
    const velocity = gateVelocity(feel.density, level) * (0.75 + 0.25 * random())
    if (velocity <= 0.02) return
    const scalePitch = degreePitch(nearestDegree(feel.leadCentre) + contour)
    const pitch = level <= 1 ? nearestChordTone(scalePitch, harmony.tones) : scalePitch
    sound.note(pitch, velocity, feel.fallSeconds)
  }

  const onStep = drift => {
    if (step % STEPS_PER_BAR === 0) {
      if (step > 0 && harmony.nextBar()) sound.chord(harmony.tones)
      if (step > 0) motif.evolve(step / STEPS_PER_BAR)
      sound.bass(nearestOctave(40, harmony.tones[0]), 0.8 + 0.2 * random())
    }
    sound.step(step)
    playLead(drift)
  }

  return ({ frames, position, drift, left, right }) => {
    feel.leadCentre = 60 + 7 * position
    feel.density = 0.9 + 0.3 * position
    feel.fallSeconds = 1.3 - 0.18 * position
    sound.prepare(position, time.clock)
    let done = 0
    while (done < frames) {
      if (time.clock >= time.nextStep) {
        step++
        time.nextStep += STEP_SAMPLES
        onStep(drift)
      }
      const count = Math.min(frames - done, Math.ceil(time.nextStep - time.clock), BLOCK_FRAMES)
      sound.fill(left, right, done, count)
      time.clock += count
      done += count
    }
  }
}

const createHelix = (seed, sound) => {
  const random = mulberry32(seed)
  const harmony = createHarmony(random)
  const motif = createMotif(random)
  const feel = { density: 1, fallSeconds: 1.4 }
  const time = { clock: 0, nextStep: 0 }
  let step = -1
  let rung = 0
  let tones = harmony.tones
  sound.chord(tones)

  const playArp = drift => {
    const velocity = gateVelocity(feel.density, metricLevel(step)) * (0.7 + 0.3 * random())
    if (velocity <= 0.02) return
    const sliding = random() < clamp(Math.abs(drift) * 6, 0, 1)
    const cell = motif.at(step)
    if (!sliding && !cell.play) return
    rung += sliding ? Math.sign(drift) : cell.move || 1
    sound.note(ladderPitch(rung, tones), velocity, feel.fallSeconds)
  }

  const changeChord = () => {
    rung = nearestRung(ladderPitch(rung, tones), rung, harmony.tones)
    tones = harmony.tones
    sound.chord(tones)
  }

  const onStep = drift => {
    if (step % STEPS_PER_BAR === 0) {
      if (step > 0 && harmony.nextBar()) changeChord()
      if (step > 0) motif.evolve(step / STEPS_PER_BAR)
      sound.bass(nearestOctave(40, tones[0]), 0.8 + 0.2 * random())
    }
    sound.step(step)
    playArp(drift)
  }

  return ({ frames, position, drift, left, right }) => {
    feel.density = 1 + 0.3 * position
    feel.fallSeconds = 1.4 - 0.2 * position
    sound.prepare(position, time.clock)
    let done = 0
    while (done < frames) {
      if (time.clock >= time.nextStep) {
        step++
        time.nextStep += STEP_SAMPLES
        onStep(drift)
      }
      const count = Math.min(frames - done, Math.ceil(time.nextStep - time.clock), BLOCK_FRAMES)
      sound.fill(left, right, done, count)
      time.clock += count
      done += count
    }
  }
}

const createScratch = frames => Array.from({ length: PIECE_COUNT }, () => [new Float32Array(frames), new Float32Array(frames)])

const listenForStop = processor => {
  if (!processor.port) return
  processor.port.onmessage = ({ data }) => {
    processor.stopped ||= data === STOP
  }
}

class MusicProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'position', defaultValue: 0, minValue: 0, maxValue: LAST_POSITION, automationRate: 'k-rate' },
      { name: 'piece', defaultValue: 0, minValue: 0, maxValue: PIECE_COUNT - 1, automationRate: 'k-rate' },
      { name: 'active', defaultValue: 1, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
    ]
  }

  constructor(options) {
    super()
    const seed = options?.processorOptions?.seed ?? Math.floor(Math.random() * 2 ** 32)
    const sounds = SOUNDS[options?.processorOptions?.voicing] ?? SOUNDS.smooth
    this.pieces = [createLiquid(seed, sounds.liquid()), createHelix(seed, sounds.helix())]
    this.blends = new Float64Array(PIECE_COUNT)
    this.scratch = createScratch(128)
    this.job = { frames: 0, position: 0, drift: 0, left: null, right: null }
    this.level = 0
    this.wantedLevel = 0
    this.wantedPiece = 0
    this.position = 0
    this.drift = 0
    this.tracking = false
    this.chosen = false
    this.stopped = false
    listenForStop(this)
  }

  process(_inputs, outputs, parameters) {
    if (this.stopped) return false
    const output = outputs[0]
    const wantedLevel = parameters.active[0] >= 0.5 ? 1 : 0
    if (wantedLevel === 0 && this.level === 0) {
      this.tracking = false
      return true
    }
    const frames = output[0].length
    const wantedPiece = parameters.piece[0] >= 0.5 ? 1 : 0
    if (!this.chosen) {
      this.blends[wantedPiece] = 1
      this.chosen = true
    }
    if (frames > this.scratch[0][0].length) this.scratch = createScratch(frames)
    this.follow(parameters.position[0], frames)
    for (let piece = 0; piece < PIECE_COUNT; piece++) {
      if (this.blends[piece] > 0 || piece === wantedPiece) this.render(piece, frames)
    }
    this.wantedPiece = wantedPiece
    this.wantedLevel = wantedLevel
    this.mix(output, frames)
    return true
  }

  follow(target, frames) {
    const seconds = frames / sampleRate
    if (!this.tracking) {
      this.position = target
      this.drift = 0
      this.tracking = true
    }
    const before = this.position
    this.position += (target - this.position) * (1 - Math.exp(-seconds / POSITION_GLIDE_SECONDS))
    this.drift += ((this.position - before) / seconds - this.drift) * (1 - Math.exp(-seconds / DRIFT_CALM_SECONDS))
  }

  render(piece, frames) {
    const { job } = this
    job.frames = frames
    job.position = this.position
    job.drift = this.drift
    job.left = this.scratch[piece][0]
    job.right = this.scratch[piece][1]
    this.pieces[piece](job)
  }

  mix(output, frames) {
    const { blends, scratch, wantedPiece, wantedLevel } = this
    const blendStep = 1 / (CROSSFADE_SECONDS * sampleRate)
    const levelStep = 1 / (ACTIVE_FADE_SECONDS * sampleRate)
    const left = output[0]
    const right = output[1] ?? output[0]
    const stereo = output.length > 1
    for (let i = 0; i < frames; i++) {
      this.level = moveToward(this.level, wantedLevel, levelStep)
      let sumLeft = 0
      let sumRight = 0
      for (let piece = 0; piece < PIECE_COUNT; piece++) {
        blends[piece] = moveToward(blends[piece], piece === wantedPiece ? 1 : 0, blendStep)
        if (blends[piece] === 0) continue
        const gain = equalPower(blends[piece])
        sumLeft += scratch[piece][0][i] * gain
        sumRight += scratch[piece][1][i] * gain
      }
      left[i] = (stereo ? sumLeft : (sumLeft + sumRight) * 0.5) * this.level
      if (stereo) right[i] = sumRight * this.level
    }
  }
}

registerProcessor('music', MusicProcessor)
