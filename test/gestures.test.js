import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  SWEEP_LEG_MS, TAP_MAX_MS, TAP_SLOP_PX, classifyRelease, createSweep, hasMoved, registerSweep,
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


const sweepThrough = (sweep, steps) => steps.map(([pos, t]) => registerSweep(sweep, { pos, last: 4, t }))

test('brown to violet and back, twice, starts wave mode', () => {
  const sweep = createSweep()
  const results = sweepThrough(sweep, [[0, 0], [2, 300], [4, 600], [2, 900], [0, 1200], [4, 1800], [0.1, 2400]])
  assert.deepEqual(results, [false, false, false, false, false, false, true])
})

test('a slow leg or a start away from brown does not count', () => {
  assert.equal(sweepThrough(createSweep(), [[4, 0], [0, 500], [4, 1000], [0, 1500]]).includes(true), false)
  assert.equal(sweepThrough(createSweep(), [[0, 0], [4, 500], [0, 500 + SWEEP_LEG_MS + 1], [4, 6000], [0, 6500]]).includes(true), false)
})
