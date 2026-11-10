import { test } from 'node:test'
import assert from 'node:assert/strict'
import { COLOUR_ROWS } from '../src/ui/grid.js'
import { STRIP_REVEAL_MS, createStrip, isStripRevealing, stepStrip, stripCellAlpha } from '../src/ui/strip.js'

const COLS = 12
const step = (strip, { locked, ms = 16, reducedMotion = false }) =>
  stepStrip({ strip, locked, cols: COLS, dt: ms / 1000, reducedMotion })
const alphas = strip => Array.from({ length: COLOUR_ROWS }, (_, k) =>
  Array.from({ length: COLS }, (_, col) => stripCellAlpha({ strip, col, k })))

test('a locked strip draws no colour cells', () => {
  const strip = createStrip({ locked: false })
  step(strip, { locked: true })
  assert.ok(alphas(strip).flat().every(alpha => alpha === 0))
})

test('an unlocked strip reveals bottom row first, then is fully shown', () => {
  const strip = createStrip({ locked: false })
  step(strip, { locked: true })
  assert.equal(step(strip, { locked: false, ms: 0 }), true)
  step(strip, { locked: false, ms: 200 })
  const [top, , bottom] = alphas(strip).map(row => row.reduce((sum, alpha) => sum + alpha, 0))
  assert.ok(bottom > top)
  step(strip, { locked: false, ms: STRIP_REVEAL_MS })
  assert.equal(isStripRevealing(strip), false)
  assert.ok(alphas(strip).flat().every(alpha => alpha === 1))
})

test('a strip that was never locked shows at once', () => {
  const strip = createStrip({ locked: false })
  assert.equal(step(strip, { locked: false }), false)
  assert.ok(alphas(strip).flat().every(alpha => alpha === 1))
})

test('reduced motion shows the strip at once on unlock', () => {
  const strip = createStrip({ locked: false })
  step(strip, { locked: true })
  step(strip, { locked: false, reducedMotion: true })
  assert.ok(alphas(strip).flat().every(alpha => alpha === 1))
})
