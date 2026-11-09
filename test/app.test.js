import { test, mock } from 'node:test'
import assert from 'node:assert/strict'
import { createApp } from '../src/app.js'

const HOUR = 3600000

const fakeEngine = () => {
  const engine = {
    calls: [],
    interrupt: () => {},
    onInterrupt: listener => {
      engine.interrupt = listener
    },
    play: async () => engine.calls.push('play'),
    pause: () => engine.calls.push('pause'),
    halt: () => engine.calls.push('halt'),
    fadeOut: () => engine.calls.push('fade'),
    setPosition: () => {},
    setVolume: () => {},
  }
  return engine
}

const start = () => {
  const engine = fakeEngine()
  const app = createApp({ engine, settings: { pos: 0, volume: 0.6 }, persist: () => {} })
  return { engine, app }
}

const withClock = run => {
  mock.timers.enable({ apis: ['setInterval', 'Date'], now: 0 })
  try {
    run()
  } finally {
    mock.timers.reset()
  }
}

test('the timer ends on wall-clock time after the computer sleeps', () => withClock(() => {
  const { app } = start()
  app.cycleTimer()
  app.setPlaying(true)
  mock.timers.setTime(2 * HOUR)
  mock.timers.tick(1000)
  assert.equal(app.state.playing, false)
  assert.equal(app.state.timer.left, 0)
}))

test('the timer counts only while playing', () => withClock(() => {
  const { app } = start()
  app.cycleTimer()
  app.setPlaying(true)
  mock.timers.tick(5000)
  app.setPlaying(false)
  const left = app.state.timer.left
  mock.timers.tick(HOUR)
  assert.equal(app.state.timer.left, left)
  app.setPlaying(true)
  mock.timers.tick(1000)
  assert.equal(app.state.timer.left, left - 1000)
}))

test('the clock does not tick while paused', () => withClock(() => {
  const { app } = start()
  let renders = 0
  app.subscribe(() => renders++)
  app.cycleTimer()
  const before = renders
  mock.timers.tick(10000)
  assert.equal(renders, before)
}))

test('an interrupted engine shows as paused', () => {
  const { app, engine } = start()
  app.setPlaying(true)
  engine.interrupt()
  assert.equal(app.state.playing, false)
  assert.equal(engine.calls.at(-1), 'pause')
})

test('stop ends wave mode and pauses the sound', () => {
  const { app } = start()
  app.toggleWave()
  assert.equal(app.state.wave, true)
  assert.equal(app.state.playing, true)
  app.stop()
  assert.equal(app.state.wave, false)
  assert.equal(app.state.playing, false)
  app.dispose()
})

test('a colour change during wave mode keeps wave mode on', () => {
  const { app } = start()
  app.toggleWave()
  app.setPos(3)
  assert.equal(app.state.wave, true)
  assert.equal(app.state.pos, 3)
  app.toggleWave()
  assert.equal(app.state.wave, false)
  app.dispose()
})
