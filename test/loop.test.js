import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pickFrameRate } from '../src/ui/loop.js'

test('machines with four cores or fewer draw at 30 frames a second', () => {
  assert.equal(pickFrameRate(2), 30)
  assert.equal(pickFrameRate(4), 30)
})

test('faster machines, and browsers that hide the core count, draw at 60', () => {
  assert.equal(pickFrameRate(8), 60)
  assert.equal(pickFrameRate(undefined), 60)
})
