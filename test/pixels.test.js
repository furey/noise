import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MAX_PIXELS, createPixels, emitPixels, stepPixels } from '../src/ui/pixels.js'

const caps = count => Array.from({ length: count }, (_, col) => ({ col, y: 0.5, role: 'cap', rose: true }))

test('pixels never exceed the cap', () => {
  const pixels = createPixels()
  for (let i = 0; i < 20; i++) emitPixels({ pixels, chips: caps(200), segments: 20, volume: 1, random: () => 0 })
  assert.equal(pixels.count, MAX_PIXELS)
  assert.equal(pixels.pool.filter(p => p.active).length, MAX_PIXELS)
})

test('louder volume emits more pixels', () => {
  const emitted = volume => {
    const pixels = createPixels()
    emitPixels({ pixels, chips: caps(40), segments: 20, volume, random: () => 0.03 })
    return pixels.count
  }
  assert.ok(emitted(1) > emitted(0.1))
})

test('pixels rise, fade, and free their slots', () => {
  const pixels = createPixels()
  emitPixels({ pixels, chips: caps(10), segments: 20, volume: 1, random: () => 0 })
  assert.equal(pixels.count, 10)
  for (let i = 0; i < 300; i++) stepPixels({ pixels, dt: 1 / 60 })
  assert.equal(pixels.count, 0)
})
