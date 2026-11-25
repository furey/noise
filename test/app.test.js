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
    music: null,
    setMusic: music => {
      engine.music = music
    },
    planPosition: (values, timing) => engine.calls.push({ planPosition: values, timing }),
    planVolume: (values, timing) => engine.calls.push({ planVolume: values, timing }),
    playTrack: url => engine.calls.push({ playTrack: url }),
    stopTrack: () => engine.calls.push('stopTrack'),
    seekTrack: seconds => engine.calls.push({ seekTrack: seconds }),
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

test('a play the engine rejects shows the app as paused and cancels the engine play', async () => {
  const { app, engine } = start()
  engine.play = async () => {
    throw new Error('blocked')
  }
  app.setPlaying(true)
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(app.state.playing, false)
  assert.equal(engine.calls.at(-1), 'pause')
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

test('wave mode saved from the last session starts paused and plays the wave on play', () => {
  mock.timers.enable({ apis: ['setInterval'] })
  const engine = fakeEngine()
  const saved = []
  const app = createApp({ engine, settings: { pos: 0, volume: 0.6, wave: true }, persist: settings => saved.push(settings) })
  assert.equal(app.state.wave, true)
  assert.equal(app.state.playing, false)
  app.setPlaying(true)
  mock.timers.tick(50)
  assert.equal(engine.calls.filter(call => call.planPosition).length, 1)
  app.toggleWave()
  assert.equal(saved.at(-1).wave, false)
  app.dispose()
  mock.timers.reset()
})

test('turning wave mode on saves it', () => {
  const engine = fakeEngine()
  const saved = []
  const app = createApp({ engine, settings: { pos: 0, volume: 0.6 }, persist: settings => saved.push(settings) })
  app.toggleWave()
  assert.equal(saved.at(-1).wave, true)
  app.dispose()
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

test('a tap on music steps through Liquid alone, Liquid, Helix alone, Helix, off', () => {
  const { app, engine } = start()
  app.setPlaying(true)
  const steps = Array.from({ length: 5 }, () => {
    app.cycleMusic()
    return `${engine.music.mode} ${engine.music.piece}`
  })
  assert.deepEqual(steps, ['alone liquid', 'over liquid', 'alone helix', 'over helix', 'off liquid'])
})

test('music from silence starts the sound', () => {
  const { app, engine } = start()
  app.cycleMusic()
  assert.equal(app.state.playing, true)
  assert.deepEqual(engine.music, { mode: 'alone', piece: 'liquid' })
})

test('the music step and piece are saved', () => {
  const saved = []
  const app = createApp({ engine: fakeEngine(), settings: { pos: 0, volume: 0.6 }, persist: settings => saved.push(settings) })
  app.cycleMusic()
  app.cycleMusic()
  app.cycleMusic()
  assert.deepEqual([saved.at(-1).music, saved.at(-1).piece], ['alone', 'helix'])
})

const SONG = Object.freeze({ id: 'song', title: 'Song', artist: 'Band', durationS: 200 })

const withSong = () => {
  const { engine, app } = start()
  app.startTrack({ track: SONG, url: 'app://noise/stream/x' })
  app.trackSounding()
  return { engine, app }
}

test('starting a song plays it, starts playback, and becomes active once it sounds', () => {
  const { engine, app } = start()
  app.loadTrack(SONG)
  assert.deepEqual(app.state.track, { status: 'loading', current: SONG, pos: undefined })
  app.startTrack({ track: SONG, url: 'app://noise/stream/x' })
  assert.ok(engine.calls.some(call => call.playTrack === 'app://noise/stream/x'))
  assert.equal(app.state.playing, true)
  assert.equal(app.state.track.status, 'loading')
  app.trackSounding()
  assert.equal(app.state.track.status, 'active')
})

test('during a song, wave, music, and colour choices do nothing', () => {
  const { app } = withSong()
  app.toggleWave()
  app.cycleMusic()
  app.chooseMusic(3)
  app.selectColour(3)
  app.setPos(2)
  assert.equal(app.state.wave, false)
  assert.equal(app.state.music, 'off')
  assert.equal(app.state.pos, 0)
})

test('during a song, the colour arrows seek ten seconds', () => {
  const { engine, app } = withSong()
  app.nudgePos(1)
  app.nudgePos(-1)
  assert.deepEqual(engine.calls.filter(call => call.seekTrack), [{ seekTrack: 10 }, { seekTrack: -10 }])
  assert.equal(app.state.pos, 0)
})

test('a saved wave setting survives a song and resumes after it', () => {
  const engine = fakeEngine()
  const saved = []
  const app = createApp({ engine, settings: { pos: 0, volume: 0.6, wave: true }, persist: settings => saved.push(settings) })
  app.setPlaying(true)
  app.startTrack({ track: SONG, url: 'app://noise/stream/x' })
  app.toggleWave()
  assert.equal(app.state.wave, true)
  assert.ok(saved.every(settings => settings.wave === true))
  app.endTrack()
  assert.equal(app.state.track.status, 'idle')
  assert.equal(app.state.wave, true)
  assert.ok(engine.calls.includes('stopTrack'))
  app.dispose()
})

test('stop ends the song and pauses without touching the wave setting', () => {
  const engine = fakeEngine()
  const app = createApp({ engine, settings: { pos: 0, volume: 0.6, wave: true }, persist: () => {} })
  app.startTrack({ track: SONG, url: 'app://noise/stream/x' })
  app.stop()
  assert.equal(app.state.track.status, 'idle')
  assert.equal(app.state.playing, false)
  assert.equal(app.state.wave, true)
})

test('pausing during a song pauses the engine, which pauses the song', () => {
  const { engine, app } = withSong()
  app.togglePlay()
  assert.equal(app.state.playing, false)
  assert.equal(engine.calls.at(-1), 'pause')
  assert.equal(app.state.track.status, 'active')
})

test('the sleep timer end pauses a song', () => withClock(() => {
  const { engine, app } = withSong()
  app.chooseTimer(10)
  mock.timers.tick(10 * 60 * 1000 + 1000)
  assert.equal(app.state.playing, false)
  assert.ok(engine.calls.includes('pause'))
  assert.equal(app.state.track.status, 'active')
}))

test('volume changes reach the engine during a song even with wave saved on', () => {
  const engine = fakeEngine()
  const volumes = []
  engine.setVolume = volume => volumes.push(volume)
  const app = createApp({ engine, settings: { pos: 0, volume: 0.6, wave: true }, persist: () => {} })
  app.startTrack({ track: SONG, url: 'app://noise/stream/x' })
  volumes.length = 0
  app.nudgeVolume(-1)
  assert.deepEqual(volumes.map(volume => Math.round(volume * 10) / 10), [0.5])
})

test('the song colour is shown while a song is on and never saved', () => {
  const engine = fakeEngine()
  const saved = []
  const app = createApp({ engine, settings: { pos: 1, volume: 0.6 }, persist: settings => saved.push(settings) })
  app.followTrack(3)
  assert.equal(app.state.track.pos, undefined)
  app.startTrack({ track: SONG, url: 'app://noise/stream/x' })
  app.trackSounding()
  app.followTrack(3.5)
  assert.equal(app.livePos(), 3.5)
  assert.equal(app.state.pos, 1)
  app.startTrack({ track: { ...SONG, id: 'next' }, url: 'app://noise/stream/y' })
  assert.equal(app.state.track.pos, 3.5)
  app.endTrack()
  assert.equal(app.livePos(), 1)
  assert.ok(saved.every(settings => settings.pos === 1))
})
