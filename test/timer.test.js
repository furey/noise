import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  TIMER_OFF_ALPHA, createTimer, cycleTimer, isTimerOn, tickTimer, timerAlpha, timerSize, unfade,
} from '../src/ui/timer.js'

const MINUTE = 60000

const cycle = (timer, times) => Array.from({ length: times }).reduce(cycleTimer, timer)

const run = (timer, minutes) => tickTimer({ timer, elapsed: minutes * MINUTE, playing: true }).timer

test('the timer cycles 60, 30, 15, 5, then off', () => {
  const minutes = []
  let timer = createTimer()
  for (let i = 0; i < 5; i++) {
    timer = cycleTimer(timer)
    minutes.push(timer.left / MINUTE)
  }
  assert.deepEqual(minutes, [60, 30, 15, 5, 0])
  assert.equal(isTimerOn(timer), false)
})

test('each setting shows a square of 4, 3, 2, then 1 cells across', () => {
  assert.deepEqual([0, 1, 2, 3, 4].map(n => timerSize(cycle(createTimer(), n))), [0, 4, 3, 2, 1])
})

test('the square shrinks as the time runs down', () => {
  const hour = cycle(createTimer(), 1)
  assert.equal(timerSize(run(hour, 29)), 4)
  assert.equal(timerSize(run(hour, 30)), 3)
  assert.equal(timerSize(run(hour, 45)), 2)
  assert.equal(timerSize(run(hour, 55)), 1)
  assert.equal(timerSize(run(hour, 59.9)), 1)
})

test('a tap on a shrunken timer moves one size below what shows', () => {
  const shrunk = run(cycle(createTimer(), 1), 40)
  assert.equal(timerSize(shrunk), 3)
  assert.equal(cycleTimer(shrunk).left, 15 * MINUTE)
  assert.equal(cycleTimer(run(shrunk, 19.5)).left, 0)
})

test('the timer holds while paused', () => {
  const timer = cycle(createTimer(), 3)
  const { timer: next, event } = tickTimer({ timer, elapsed: 5 * MINUTE, playing: false })
  assert.equal(next.left, timer.left)
  assert.equal(event, null)
})

test('the last minute fades once, then the timer ends and turns off', () => {
  let timer = cycle(createTimer(), 3)
  const events = []
  for (let s = 0; s < 15 * 60; s++) {
    const result = tickTimer({ timer, elapsed: 1000, playing: true })
    timer = result.timer
    if (result.event) events.push([s, result.event])
  }
  assert.deepEqual(events, [[839, 'fade'], [899, 'end']])
  assert.deepEqual(timer, createTimer())
})

test('unfading lets the fade start again', () => {
  let timer = tickTimer({ timer: cycle(createTimer(), 3), elapsed: 14.5 * MINUTE, playing: true }).timer
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
