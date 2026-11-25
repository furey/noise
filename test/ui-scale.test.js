import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MIN_UI_SCALE, uiScale } from '../src/ui/ui-scale.js'

test('the UI scale is 1 at and above 560 × 420', () => {
  assert.equal(uiScale({ width: 560, height: 420 }), 1)
  assert.equal(uiScale({ width: 800, height: 600 }), 1)
  assert.equal(uiScale({ width: 2560, height: 1440 }), 1)
})

test('the UI scale follows the tighter side of a smaller window', () => {
  assert.equal(uiScale({ width: 420, height: 420 }), 0.75)
  assert.equal(uiScale({ width: 1000, height: 357 }), 0.85)
  assert.equal(uiScale({ width: 420, height: 320 }), 0.75)
})

test('the UI scale stops at its floor in a parked window', () => {
  assert.equal(uiScale({ width: 280, height: 220 }), MIN_UI_SCALE)
  assert.equal(uiScale({ width: 100, height: 80 }), MIN_UI_SCALE)
})
