import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  TIMER_OFF_ALPHA, TIMER_STEP_MS, createTimer, cycleTimer, isTimerOn, tickTimer, timerAlpha, timerSquares, unfade,
} from '../src/ui/timer.js'

const MINUTE = 60000

const cycle = (timer, times) => Array.from({ length: times }).reduce(cycleTimer, timer)

test('the timer cycles 60, 50, 40, 30, 20, 10, then off', () => {
  const minutes = []
  let timer = createTimer()
  for (let i = 0; i < 7; i++) {
    timer = cycleTimer(timer)
    minutes.push(timer.left / MINUTE)
  }
  assert.deepEqual(minutes, [60, 50, 40, 30, 20, 10, 0])
  assert.equal(isTimerOn(timer), false)
})

test('squares count down 6 to 1 with one square per 10 minutes', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6].map(n => timerSquares(cycle(createTimer(), n))), [6, 5, 4, 3, 2, 1])
  let timer = cycle(createTimer(), 1)
  timer = tickTimer({ timer, elapsed: TIMER_STEP_MS, playing: true }).timer
  assert.equal(timerSquares(timer), 5)
  timer = tickTimer({ timer, elapsed: 1, playing: true }).timer
  assert.equal(timerSquares(timer), 5)
  timer = tickTimer({ timer, elapsed: TIMER_STEP_MS - 1, playing: true }).timer
  assert.equal(timerSquares(timer), 4)
})

test('the timer holds while paused', () => {
  const timer = cycle(createTimer(), 6)
  const { timer: next, event } = tickTimer({ timer, elapsed: 5 * MINUTE, playing: false })
  assert.equal(next.left, timer.left)
  assert.equal(event, null)
})

test('the last minute fades once, then the timer ends and turns off', () => {
  let timer = cycle(createTimer(), 6)
  const events = []
  for (let s = 0; s < 10 * 60; s++) {
    const result = tickTimer({ timer, elapsed: 1000, playing: true })
    timer = result.timer
    if (result.event) events.push([s, result.event])
  }
  assert.deepEqual(events, [[539, 'fade'], [599, 'end']])
  assert.deepEqual(timer, createTimer())
})

test('unfading lets the fade start again', () => {
  let timer = tickTimer({ timer: cycle(createTimer(), 6), elapsed: 9.5 * MINUTE, playing: true }).timer
  assert.equal(timer.fading, true)
  timer = unfade(timer)
  assert.equal(tickTimer({ timer, elapsed: 1000, playing: true }).event, 'fade')
})

test('the off cell is dim and a running timer blinks between 66% and 100%', () => {
  const on = cycle(createTimer(), 1)
  assert.equal(timerAlpha({ timer: createTimer(), playing: true, now: 0, reducedMotion: false }), TIMER_OFF_ALPHA)
  assert.equal(timerAlpha({ timer: on, playing: true, now: 0, reducedMotion: false }), 1)
  assert.equal(timerAlpha({ timer: on, playing: true, now: 600, reducedMotion: false }), 0.66)
  assert.equal(timerAlpha({ timer: on, playing: false, now: 600, reducedMotion: false }), 1)
  assert.equal(timerAlpha({ timer: on, playing: true, now: 600, reducedMotion: true }), 1)
})
