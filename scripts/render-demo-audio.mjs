import fs from 'node:fs/promises'
import path from 'node:path'
import { appRoot, ffmpeg, run } from './demo-stage.mjs'

const SAMPLE_RATE = 48000
const BLOCK = 128
const TARGET_LUFS = -20
const PEAK_LIMIT = 0.89

export const renderDemoAudio = async ({ log, start, duration, out }) => {
  const Processor = await loadProcessor()
  const wav = `${out}.wav`
  await fs.writeFile(wav, encodeWav(renderSamples({ log, start, duration, Processor })))
  const firstGain = TARGET_LUFS - await integratedLoudness(wav)
  await encodeAac({ wav, gainDb: firstGain, out })
  const gainDb = firstGain + TARGET_LUFS - await integratedLoudness(out)
  await encodeAac({ wav, gainDb, out })
  await fs.rm(wav)
  return { gainDb }
}

const encodeAac = ({ wav, gainDb, out }) => ffmpeg(['-i', wav,
  '-af', `volume=${gainDb.toFixed(2)}dB,alimiter=limit=${PEAK_LIMIT}:level=false`,
  '-c:a', 'aac', '-b:a', '160k', '-cutoff', '20000', out])

const renderSamples = ({ log, start, duration, Processor }) => {
  const frames = Math.ceil(duration * SAMPLE_RATE)
  const left = new Float32Array(frames)
  const right = new Float32Array(frames)
  const node = log.find(entry => entry.param === 'node')
  if (!node) return { left, right }
  const position = automation(log, 'position', node.target)
  const gain = automation(log, 'gain', 0)
  const processor = new Processor()
  for (let time = node.time; time < start + duration; time += BLOCK / SAMPLE_RATE) {
    const output = [[new Float32Array(BLOCK), new Float32Array(BLOCK)]]
    processor.process([], output, { position: new Float32Array([position(time)]) })
    const first = Math.round((time - start) * SAMPLE_RATE)
    for (let i = 0; i < BLOCK; i++) {
      const index = first + i
      if (index < 0 || index >= frames) continue
      const level = gain(time + i / SAMPLE_RATE)
      left[index] = output[0][0][i] * level
      right[index] = output[0][1][i] * level
    }
  }
  return { left, right }
}

const automation = (log, param, initial) => {
  const segments = log.filter(entry => entry.param === param).reduce((list, entry) => {
    const kept = list.filter(segment => segment.time <= entry.time)
    const from = valueFrom(kept, entry.time, initial)
    return [...kept, { ...entry, from }]
  }, [])
  return time => valueFrom(segments, time, initial)
}

const valueFrom = (segments, time, initial) => segments.reduce((value, segment) => {
  if (segment.time > time) return value
  if (!segment.tc) return segment.target
  return segment.target + (segment.from - segment.target) * Math.exp(-(time - segment.time) / segment.tc)
}, initial)

const loadProcessor = async () => {
  const source = await fs.readFile(path.join(appRoot, 'src', 'audio', 'noise.worklet.js'), 'utf8')
  let Processor
  new Function('AudioWorkletProcessor', 'registerProcessor', source)(class {}, (_name, cls) => { Processor = cls })
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
