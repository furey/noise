import { test, mock } from 'node:test'
import assert from 'node:assert/strict'
import { createFrameLoop, pickFrameRate } from '../src/ui/loop.js'

test('machines with four cores or fewer draw at 30 frames a second', () => {
  assert.equal(pickFrameRate(2), 30)
  assert.equal(pickFrameRate(4), 30)
})

test('faster machines, and browsers that hide the core count, draw at 60', () => {
  assert.equal(pickFrameRate(8), 60)
  assert.equal(pickFrameRate(undefined), 60)
})

test('a wake during a frame does not start a second frame loop', () => {
  const frames = []
  const pending = []
  globalThis.requestAnimationFrame = callback => pending.push(callback)
  globalThis.cancelAnimationFrame = () => {}
  mock.timers.enable({ apis: ['setTimeout'] })
  try {
    const doc = { hidden: false, addEventListener: () => {}, removeEventListener: () => {} }
    const loop = createFrameLoop({ doc, fps: 60, draw: () => {
      frames.push(pending.length)
      loop.wake()
      return true
    } })
    loop.wake()
    for (let step = 0; step < 5; step++) {
      const ready = pending.splice(0)
      ready.forEach(callback => callback(step * 16))
      mock.timers.tick(20)
    }
    assert.equal(frames.length, 5)
    assert.ok(pending.length <= 1)
  } finally {
    mock.timers.reset()
    delete globalThis.requestAnimationFrame
    delete globalThis.cancelAnimationFrame
  }
})

test('a wake during the last frame still gets one more frame', () => {
  const pending = []
  globalThis.requestAnimationFrame = callback => pending.push(callback)
  globalThis.cancelAnimationFrame = () => {}
  mock.timers.enable({ apis: ['setTimeout'] })
  try {
    let draws = 0
    const doc = { hidden: false, addEventListener: () => {}, removeEventListener: () => {} }
    const loop = createFrameLoop({ doc, fps: 60, draw: () => {
      draws += 1
      if (draws === 1) loop.wake()
      return false
    } })
    loop.wake()
    pending.splice(0).forEach(callback => callback(0))
    mock.timers.tick(20)
    pending.splice(0).forEach(callback => callback(16))
    mock.timers.tick(20)
    assert.equal(draws, 2)
    assert.equal(pending.length, 0)
  } finally {
    mock.timers.reset()
    delete globalThis.requestAnimationFrame
    delete globalThis.cancelAnimationFrame
  }
})

test('a draw that throws does not stop later wakes', () => {
  const pending = []
  globalThis.requestAnimationFrame = callback => pending.push(callback)
  globalThis.cancelAnimationFrame = () => {}
  try {
    let draws = 0
    const doc = { hidden: false, addEventListener: () => {}, removeEventListener: () => {} }
    const loop = createFrameLoop({ doc, fps: 60, draw: () => {
      draws += 1
      if (draws === 1) throw new Error('boom')
      return false
    } })
    loop.wake()
    assert.throws(() => pending.splice(0).forEach(callback => callback(0)), /boom/)
    loop.wake()
    pending.splice(0).forEach(callback => callback(16))
    assert.equal(draws, 2)
  } finally {
    delete globalThis.requestAnimationFrame
    delete globalThis.cancelAnimationFrame
  }
})
