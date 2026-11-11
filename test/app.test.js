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
    unlock: () => engine.calls.push('unlock'),
    blocked: false,
    isBlocked: () => engine.blocked,
    pause: () => engine.calls.push('pause'),
    halt: () => engine.calls.push('halt'),
    fadeOut: () => engine.calls.push('fade'),
    setPosition: () => {},
    setVolume: () => {},
    planPosition: (values, timing) => engine.calls.push({ planPosition: values, timing }),
    planVolume: (values, timing) => engine.calls.push({ planVolume: values, timing }),
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

test('a finger lift unlocks the audio only while the app is playing', () => {
  const { app, engine } = start()
  app.unlockAudio()
  assert.equal(engine.calls.includes('unlock'), false)
  app.setPlaying(true)
  app.unlockAudio()
  assert.equal(engine.calls.at(-1), 'unlock')
})

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

test('wave mode schedules the sound two seconds ahead and replans only when the plan runs short', () => {
  mock.timers.enable({ apis: ['setInterval'] })
  const { app, engine } = start()
  app.toggleWave()
  mock.timers.tick(50)
  const plans = () => engine.calls.filter(call => call.planPosition)
  assert.equal(plans().length, 1)
  assert.equal(plans()[0].planPosition.length, 21)
  assert.deepEqual(plans()[0].timing, { step: 0.1, glide: 0.25 })
  assert.equal(engine.calls.filter(call => call.planVolume).length, 1)
  mock.timers.tick(200)
  assert.equal(plans().length, 1)
  app.setVolume(0.3)
  mock.timers.tick(50)
  assert.equal(plans().length, 2)
  app.dispose()
  mock.timers.reset()
})

test('a release that cannot start the sound shows the app as paused, so the next tap plays', () => {
  const { app, engine } = start()
  app.setPos(2)
  app.setPlaying(true)
  engine.blocked = true
  app.pauseIfSilent()
  assert.equal(app.state.playing, false)
  assert.equal(engine.calls.at(-1), 'pause')
})

test('a release that started the sound leaves it playing', () => {
  const { app } = start()
  app.setPlaying(true)
  app.pauseIfSilent()
  assert.equal(app.state.playing, true)
})

test('wave mode started from silence ends in silence', () => {
  const { app } = start()
  app.toggleWave()
  assert.equal(app.state.playing, true)
  app.toggleWave()
  assert.equal(app.state.wave, false)
  assert.equal(app.state.playing, false)
  app.dispose()
})

test('wave mode started while playing ends in normal play', () => {
  const { app } = start()
  app.setPlaying(true)
  app.toggleWave()
  app.toggleWave()
  assert.equal(app.state.wave, false)
  assert.equal(app.state.playing, true)
  app.dispose()
})

test('another control used during wave mode keeps the sound on when wave mode ends', () => {
  const { app } = start()
  app.toggleWave()
  app.setPos(2)
  app.toggleWave()
  assert.equal(app.state.wave, false)
  assert.equal(app.state.playing, true)
  app.dispose()
})

test('pausing during wave mode keeps wave mode on, and play resumes the wave', () => {
  mock.timers.enable({ apis: ['setInterval'] })
  const { app, engine } = start()
  app.setPlaying(true)
  app.toggleWave()
  app.togglePlay()
  assert.equal(app.state.playing, false)
  assert.equal(app.state.wave, true)
  const plans = () => engine.calls.filter(call => call.planPosition).length
  mock.timers.tick(500)
  assert.equal(plans(), 0)
  app.setPlaying(true)
  mock.timers.tick(50)
  assert.equal(plans(), 1)
  app.dispose()
  mock.timers.reset()
})

test('an interruption keeps wave mode on', () => {
  const { app, engine } = start()
  app.toggleWave()
  engine.interrupt()
  assert.equal(app.state.playing, false)
  assert.equal(app.state.wave, true)
  app.dispose()
})

test('the end of the sleep timer keeps wave mode on', () => withClock(() => {
  const { app } = start()
  app.cycleTimer()
  app.toggleWave()
  mock.timers.setTime(2 * HOUR)
  mock.timers.tick(1000)
  assert.equal(app.state.playing, false)
  assert.equal(app.state.wave, true)
  app.dispose()
}))

test('wave mode off while paused stays silent', () => {
  const { app } = start()
  app.toggleWave()
  app.setPlaying(false)
  app.toggleWave()
  assert.equal(app.state.wave, false)
  assert.equal(app.state.playing, false)
})

test('a colour tap while paused in wave mode plays the wave from that colour', () => {
  const { app } = start()
  app.toggleWave()
  app.setPlaying(false)
  app.selectColour(2)
  assert.equal(app.state.playing, true)
  assert.equal(app.state.wave, true)
  app.dispose()
})

test('play after a page halt starts the wave again', () => {
  mock.timers.enable({ apis: ['setInterval'] })
  const { app, engine } = start()
  app.toggleWave()
  app.halt()
  assert.equal(app.state.wave, true)
  app.setPlaying(true)
  mock.timers.tick(50)
  assert.equal(engine.calls.filter(call => call.planPosition).length, 1)
  app.dispose()
  mock.timers.reset()
})
