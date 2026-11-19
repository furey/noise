import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  TIMER_OFF_ALPHA, createTimer, cycleTimer, isTimerOn, tickTimer, timerAlpha, timerSize, unfade,
} from '../src/ui/timer.js'

const MINUTE = 60000

const cycle = (timer, times) => Array.from({ length: times }).reduce(cycleTimer, timer)

const run = (timer, minutes) => tickTimer({ timer, elapsed: minutes * MINUTE, playing: true }).timer

test('the timer cycles 30, 20, 10, then off', () => {
  const minutes = []
  let timer = createTimer()
  for (let i = 0; i < 4; i++) {
    timer = cycleTimer(timer)
    minutes.push(timer.left / MINUTE)
  }
  assert.deepEqual(minutes, [30, 20, 10, 0])
  assert.equal(isTimerOn(timer), false)
})

test('each setting shows 3, 2, then 1 dots', () => {
  assert.deepEqual([0, 1, 2, 3].map(n => timerSize(cycle(createTimer(), n))), [0, 3, 2, 1])
})

test('a dot drains every 10 minutes', () => {
  const half = cycle(createTimer(), 1)
  assert.equal(timerSize(run(half, 9.9)), 3)
  assert.equal(timerSize(run(half, 10)), 2)
  assert.equal(timerSize(run(half, 20)), 1)
  assert.equal(timerSize(run(half, 29.9)), 1)
})

test('a tap on a drained timer moves one dot below what shows', () => {
  const drained = run(cycle(createTimer(), 1), 12)
  assert.equal(timerSize(drained), 2)
  assert.equal(cycleTimer(drained).left, 10 * MINUTE)
  assert.equal(cycleTimer(run(drained, 9.5)).left, 0)
})

test('the timer holds while paused', () => {
  const timer = cycle(createTimer(), 2)
  const { timer: next, event } = tickTimer({ timer, elapsed: 5 * MINUTE, playing: false })
  assert.equal(next.left, timer.left)
  assert.equal(event, null)
})

test('the last minute fades once, then the timer ends and turns off', () => {
  let timer = cycle(createTimer(), 2)
  const events = []
  for (let s = 0; s < 20 * 60; s++) {
    const result = tickTimer({ timer, elapsed: 1000, playing: true })
    timer = result.timer
    if (result.event) events.push([s, result.event])
  }
  assert.deepEqual(events, [[1139, 'fade'], [1199, 'end']])
  assert.deepEqual(timer, createTimer())
})

test('unfading lets the fade start again', () => {
  let timer = tickTimer({ timer: cycle(createTimer(), 2), elapsed: 19.5 * MINUTE, playing: true }).timer
  assert.equal(timer.fading, true)
  timer = unfade(timer)
  assert.equal(tickTimer({ timer, elapsed: 1000, playing: true }).event, 'fade')
})

test('the off cell is dim and a running timer blinks 100% then 66%, a second each', () => {
  const on = cycle(createTimer(), 1)
  assert.equal(timerAlpha({ timer: createTimer(), playing: true, now: 0, reducedMotion: false }), TIMER_OFF_ALPHA)
  assert.equal(timerAlpha({ timer: on, playing: true, now: 0, reducedMotion: false }), 1)
  assert.equal(timerAlpha({ timer: on, playing: true, now: 999, reducedMotion: false }), 1)
  assert.equal(timerAlpha({ timer: on, playing: true, now: 1000, reducedMotion: false }), 0.66)
  assert.equal(timerAlpha({ timer: on, playing: true, now: 2000, reducedMotion: false }), 1)
  assert.equal(timerAlpha({ timer: on, playing: false, now: 600, reducedMotion: false }), 1)
  assert.equal(timerAlpha({ timer: on, playing: true, now: 600, reducedMotion: true }), 1)
})
