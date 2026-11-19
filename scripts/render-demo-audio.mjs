import fs from 'node:fs/promises'
import { ffmpeg, run, workletSource } from './demo-stage.mjs'

const SAMPLE_RATE = 48000
const BLOCK = 128
const TARGET_LUFS = -20
const PEAK_LIMIT = 0.89

export const renderDemoAudio = async ({ log, start, duration, out, song = null }) => {
  const processors = { noise: await loadProcessor('noise'), music: await loadProcessor('music') }
  const wav = `${out}.wav`
  const samples = renderSamples({ log, start, duration, processors })
  if (song) mixSong({ samples, log, start, song })
  await fs.writeFile(wav, encodeWav(samples))
  const firstGain = TARGET_LUFS - await integratedLoudness(wav)
  await encodeAac({ wav, gainDb: firstGain, out })
  const gainDb = firstGain + TARGET_LUFS - await integratedLoudness(out)
  await encodeAac({ wav, gainDb, out })
  await fs.rm(wav)
  return { gainDb }
}

const mixSong = ({ samples: { left, right }, log, start, song }) => {
  const master = automation(log, 'master-gain', 0)
  const plays = songPlays(log)
  for (let index = 0; index < left.length; index++) {
    const at = start + index / SAMPLE_RATE
    const play = plays.find(entry => entry.time <= at && at < entry.until)
    if (!play) continue
    const from = Math.round((play.from + at - play.time) * SAMPLE_RATE)
    if (from >= song.left.length) continue
    const level = master(at) * play.gain(at)
    left[index] += song.left[from] * level
    right[index] += song.right[from] * level
  }
}

const songPlays = log => log.reduce((plays, entry) => {
  if (entry.param === 'track-play') return [...plays, { time: entry.time, from: entry.from, until: Infinity, gain: automation(log, entry.gain, 1) }]
  if (entry.param === 'track-pause' && plays.length) plays.at(-1).until = entry.time
  return plays
}, [])

const encodeAac = ({ wav, gainDb, out }) => ffmpeg(['-i', wav,
  '-af', `volume=${gainDb.toFixed(2)}dB,alimiter=limit=${PEAK_LIMIT}:level=false`,
  '-c:a', 'aac', '-b:a', '160k', '-cutoff', '20000', out])

const renderSamples = ({ log, start, duration, processors }) => {
  const frames = Math.ceil(duration * SAMPLE_RATE)
  const left = new Float32Array(frames)
  const right = new Float32Array(frames)
  const voices = [noiseVoice(log, processors.noise), musicVoice(log, processors.music)].filter(Boolean)
  if (!voices.length) return { left, right }
  const master = automation(log, 'master-gain', 0)
  const begin = Math.min(...voices.map(voice => voice.time))
  for (let time = begin; time < start + duration; time += BLOCK / SAMPLE_RATE) {
    const outputs = voices.map(voice => renderBlock(voice, time))
    const first = Math.round((time - start) * SAMPLE_RATE)
    for (let i = 0; i < BLOCK; i++) {
      const index = first + i
      if (index < 0 || index >= frames) continue
      const at = time + i / SAMPLE_RATE
      const level = master(at)
      outputs.forEach(({ output, gain }) => {
        const scale = level * gain(at)
        left[index] += output[0][i] * scale
        right[index] += output[1][i] * scale
      })
    }
  }
  return { left, right }
}

const noiseVoice = (log, Processor) => {
  const node = log.find(entry => entry.param === 'node')
  if (!node) return null
  return {
    time: node.time,
    processor: new Processor(),
    params: { position: automation(log, 'position', node.target) },
    gain: automation(log, 'noise-gain', 1),
  }
}

const musicVoice = (log, Processor) => {
  const node = log.find(entry => entry.param === 'music-node')
  if (!node) return null
  const params = Object.fromEntries(Object.entries(node.initial).map(([key, value]) => [key, automation(log, `music-${key}`, value)]))
  return {
    time: node.time,
    processor: new Processor({ processorOptions: node.options }),
    params,
    gain: automation(log, 'music-gain', 1),
  }
}

const renderBlock = (voice, time) => {
  const output = [[new Float32Array(BLOCK), new Float32Array(BLOCK)]]
  if (time >= voice.time) {
    const parameters = Object.fromEntries(Object.entries(voice.params).map(([key, value]) => [key, new Float32Array([value(time)])]))
    voice.processor.process([], output, parameters)
  }
  return { output: output[0], gain: voice.gain }
}

const automation = (log, param, initial) => {
  const segments = log.filter(entry => entry.param === param).reduce((list, entry) => {
    const kept = list.filter(segment => segment.time <= entry.time)
    const from = valueAt(kept, entry.time, initial)
    return [...kept, { ...entry, from }]
  }, [])
  return time => valueAt(segments, time, initial)
}

const valueAt = (segments, time, initial) => {
  const segment = segments[lastAtOrBefore(segments, time)]
  if (!segment) return initial
  if (!segment.tc) return segment.target
  return segment.target + (segment.from - segment.target) * Math.exp(-(time - segment.time) / segment.tc)
}

const lastAtOrBefore = (segments, time) => {
  let low = 0
  let high = segments.length
  while (low < high) {
    const middle = (low + high) >> 1
    if (segments[middle].time <= time) low = middle + 1
    else high = middle
  }
  return low - 1
}

const loadProcessor = async name => {
  const source = await workletSource(name)
  let Processor
  new Function('AudioWorkletProcessor', 'registerProcessor', 'sampleRate', source)(class {}, (_name, cls) => { Processor = cls }, SAMPLE_RATE)
  return Processor
}

const integratedLoudness = async wav => {
  const { stderr } = await run('ffmpeg', ['-hide_banner', '-nostats', '-i', wav, '-af', 'ebur128', '-f', 'null', '-'])
  const match = [...stderr.matchAll(/I:\s+(-?[\d.]+) LUFS/g)].at(-1)
  return Number(match[1])
}

const encodeWav = ({ left, right }) => {
  const bytes = left.length * 8
  const buffer = Buffer.alloc(44 + bytes)
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + bytes, 4)
  buffer.write('WAVEfmt ', 8)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(3, 20)
  buffer.writeUInt16LE(2, 22)
  buffer.writeUInt32LE(SAMPLE_RATE, 24)
  buffer.writeUInt32LE(SAMPLE_RATE * 8, 28)
  buffer.writeUInt16LE(8, 32)
  buffer.writeUInt16LE(32, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(bytes, 40)
  left.forEach((sample, i) => {
    buffer.writeFloatLE(sample, 44 + i * 8)
    buffer.writeFloatLE(right[i], 48 + i * 8)
  })
  return buffer
}
