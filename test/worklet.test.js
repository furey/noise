import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const loadProcessor = () => {
  let Processor
  const source = readFileSync(new URL('../src/audio/noise.worklet.js', import.meta.url), 'utf8')
  new Function('AudioWorkletProcessor', 'registerProcessor', source)(class {}, (_name, cls) => { Processor = cls })
  return new Processor()
}

const render = ({ position, blocks = 400 }) => {
  const processor = loadProcessor()
  const left = []
  const right = []
  for (let b = 0; b < blocks; b++) {
    const output = [[new Float32Array(128), new Float32Array(128)]]
    processor.process([], output, { position: new Float32Array([position]) })
    left.push(...output[0][0])
    right.push(...output[0][1])
  }
  return { left: left.slice(128 * 40), right: right.slice(128 * 40) }
}

const rms = data => Math.sqrt(data.reduce((sum, x) => sum + x * x, 0) / data.length)
const toDb = value => 20 * Math.log10(value)

test('every colour plays at the same loudness within 1 dB', () => {
  const levels = [0, 1, 2, 3, 4].map(position => toDb(rms(render({ position }).left)))
  const spread = Math.max(...levels) - Math.min(...levels)
  assert.ok(spread < 1, `loudness spread ${spread.toFixed(2)} dB`)
})

test('positions between colours keep the same loudness within 2 dB', () => {
  const levels = [0.5, 1.5, 2.5, 3.5].map(position => toDb(rms(render({ position }).left)))
  const reference = toDb(rms(render({ position: 2 }).left))
  levels.forEach(level => assert.ok(Math.abs(level - reference) < 2, `level ${level.toFixed(2)} dB`))
})

test('left and right channels are different noise', () => {
  const { left, right } = render({ position: 2 })
  const correlation = left.reduce((sum, x, i) => sum + x * right[i], 0) / (left.length * rms(left) * rms(right))
  assert.ok(Math.abs(correlation) < 0.05, `correlation ${correlation.toFixed(3)}`)
})

test('output stays finite and below full scale', () => {
  const { left } = render({ position: 0, blocks: 2000 })
  assert.ok(left.every(Number.isFinite))
  assert.ok(left.reduce((peak, x) => Math.max(peak, Math.abs(x)), 0) < 1)
})

test('brown has more low end than violet', () => {
  const lowShare = data => {
    let smooth = 0
    const low = data.map(x => (smooth = smooth * 0.98 + x * 0.02))
    return rms(low) / rms(data)
  }
  assert.ok(lowShare(render({ position: 0 }).left) > 5 * lowShare(render({ position: 4 }).left))
})

test('processing reuses the same weight buffers', () => {
  const processor = loadProcessor()
  const buffers = new Set([processor.weights, processor.target])
  const output = [[new Float32Array(128), new Float32Array(128)]]
  for (let b = 0; b < 50; b++) processor.process([], output, { position: new Float32Array([b % 5]) })
  assert.ok(buffers.has(processor.weights) && buffers.has(processor.target))
  assert.notEqual(processor.weights, processor.target)
})
