import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createWave, forget, waveAt } from '../src/wave.js'

const sample = (wave, seconds, step = 0.05) => Array.from({ length: Math.round(seconds / step) }, (_, i) => waveAt(wave, i * step))

test('a wave starts where the colour is and settles on brown', () => {
  const wave = createWave({ seed: 7, from: 3 })
  assert.equal(waveAt(wave, 0).pos, 3)
  assert.equal(waveAt(wave, wave.segments[0].end).pos, 0)
})

test('each breath rises to pink or above and comes back to brown', () => {
  const points = sample(createWave({ seed: 11 }), 300)
  const crests = points.filter((point, i) => i > 0 && i < points.length - 1 && point.pos > points[i - 1].pos && point.pos >= points[i + 1].pos)
  assert.ok(crests.some(point => point.pos > 0.7))
  assert.ok(points.every(point => point.pos >= 0 && point.pos <= 3))
  assert.ok(points.filter(point => point.pos < 0.01).length > points.length / 20)
})

test('the colour moves smoothly with no jumps', () => {
  const points = sample(createWave({ seed: 3 }), 300)
  const steps = points.slice(1).map((point, i) => Math.abs(point.pos - points[i].pos))
  assert.ok(Math.max(...steps) < 0.05)
})

test('the volume swells gently around the chosen level', () => {
  const volumes = sample(createWave({ seed: 5 }), 300).map(point => point.volume)
  assert.ok(Math.min(...volumes) > 0.8 && Math.max(...volumes) < 1.05)
})

test('the same seed makes the same sea', () => {
  assert.deepEqual(sample(createWave({ seed: 9 }), 60), sample(createWave({ seed: 9 }), 60))
})

test('forgetting past breaths keeps the wave going', () => {
  const wave = createWave({ seed: 2 })
  waveAt(wave, 120)
  forget(wave, 120)
  assert.ok(wave.segments.length < 6)
  assert.ok(Number.isFinite(waveAt(wave, 121).pos))
})

test('a quick start glides to brown at once and starts rising', () => {
  const wave = createWave({ seed: 4, from: 2, quick: true })
  assert.ok(wave.segments[0].end <= 0.6)
  assert.ok(waveAt(wave, 1.5).pos > 0)
  assert.equal(waveAt(createWave({ seed: 4, from: 0, quick: true }), 0).pos, 0)
})
