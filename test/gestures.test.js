import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  KNOCK_GAP_MS, TAP_MAX_MS, TAP_SLOP_PX, classifyRelease, createKnocks, hasMoved, registerKnock,
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


test('four quick knocks start wave mode, then the count starts again', () => {
  const knocks = createKnocks()
  assert.deepEqual([0, 200, 400, 600].map(t => registerKnock(knocks, t)), [false, false, false, true])
  assert.equal(registerKnock(knocks, 700), false)
})

test('a slow knock starts the count again', () => {
  const knocks = createKnocks()
  const times = [0, 200, 400, 400 + KNOCK_GAP_MS, 500, 600, 700]
  assert.deepEqual(times.map(t => registerKnock(knocks, t)), [false, false, false, false, false, false, true])
})
