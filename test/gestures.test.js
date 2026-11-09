import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DOUBLE_TAP_MS, DOUBLE_TAP_PX, TAP_MAX_MS, TAP_SLOP_PX, classifyRelease, createTapTracker, hasMoved, registerTap, resetTaps,
} from '../src/ui/gestures.js'

test('a short still press is a tap', () => {
  assert.equal(classifyRelease({ moved: false, elapsed: 120, cancelled: false }), 'tap')
})

test('a long still press is neither tap nor drag', () => {
  assert.equal(classifyRelease({ moved: false, elapsed: TAP_MAX_MS, cancelled: false }), 'none')
})

test('movement past the slop makes a drag', () => {
  const start = { x: 100, y: 100 }
  assert.equal(hasMoved(start, 100 + TAP_SLOP_PX, 100), false)
  assert.equal(hasMoved(start, 100, 100 + TAP_SLOP_PX + 1), true)
  assert.equal(classifyRelease({ moved: true, elapsed: 80, cancelled: false }), 'drag')
})

test('a cancelled pointer is ignored', () => {
  assert.equal(classifyRelease({ moved: false, elapsed: 50, cancelled: true }), 'none')
})

test('two quick nearby taps make a double tap', () => {
  const taps = createTapTracker()
  assert.equal(registerTap(taps, { x: 10, y: 10, t: 1000 }), 'single')
  assert.equal(registerTap(taps, { x: 20, y: 15, t: 1000 + DOUBLE_TAP_MS - 1 }), 'double')
  assert.equal(registerTap(taps, { x: 20, y: 15, t: 1100 + DOUBLE_TAP_MS }), 'single')
})

test('slow or distant second taps stay single', () => {
  const taps = createTapTracker()
  registerTap(taps, { x: 10, y: 10, t: 0 })
  assert.equal(registerTap(taps, { x: 10, y: 10, t: DOUBLE_TAP_MS }), 'single')
  assert.equal(registerTap(taps, { x: 10 + DOUBLE_TAP_PX, y: 10, t: DOUBLE_TAP_MS + 10 }), 'single')
})

test('a third quick tap after a double starts fresh', () => {
  const taps = createTapTracker()
  registerTap(taps, { x: 0, y: 0, t: 0 })
  registerTap(taps, { x: 0, y: 0, t: 100 })
  assert.equal(registerTap(taps, { x: 0, y: 0, t: 200 }), 'single')
})

test('resetting forgets the last tap', () => {
  const taps = createTapTracker()
  registerTap(taps, { x: 0, y: 0, t: 0 })
  resetTaps(taps)
  assert.equal(registerTap(taps, { x: 0, y: 0, t: 50 }), 'single')
})
