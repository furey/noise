import { LAST, clampPos } from './ui/colours.js'
import { clampVolume } from './settings.js'
import { createTimer, cycleTimer, isTimerOn, tickTimer, unfade } from './ui/timer.js'
import { WAVE_GLIDE_S, WAVE_TICK_MS, createWave, forget, waveAt } from './wave.js'

const POS_STEP = 0.25
const VOLUME_STEP = 0.05
const CLOCK_MS = 1000

export const createApp = ({ engine, settings, persist }) => {
  const app = {
    engine, persist,
    state: { playing: false, pos: settings.pos, volume: settings.volume, timer: createTimer(), wave: false },
    listeners: new Set(),
    clock: { id: 0, last: 0 },
    tide: { id: 0, wave: null, seconds: 0, last: 0 },
  }
  engine.setPosition(app.state.pos)
  engine.setVolume(app.state.volume)
  engine.onInterrupt(() => stopAfterInterruption(app))
  return {
    state: app.state,
    subscribe: listener => subscribe(app, listener),
    togglePlay: () => setPlaying(app, !app.state.playing),
    setPlaying: on => setPlaying(app, on),
    unlockAudio: () => unlockAudio(app),
    halt: () => halt(app),
    setPos: pos => choosePos(app, pos),
    nudgePos: steps => choosePos(app, app.state.pos + steps * POS_STEP),
    toggleWave: () => app.state.wave ? stopWave(app) : startWave(app),
    stop: () => stop(app),
    setVolume: volume => setVolume(app, volume),
    nudgeVolume: steps => setVolume(app, app.state.volume + steps * VOLUME_STEP),
    selectColour: index => selectColour(app, index),
    cycleTimer: () => advanceTimer(app),
    dispose: () => {
      stopClock(app)
      stopTide(app)
    },
  }
}

const subscribe = (app, listener) => {
  app.listeners.add(listener)
  listener(app.state)
  return () => app.listeners.delete(listener)
}

const setPlaying = (app, on) => {
  const { state, engine } = app
  state.playing = on
  state.timer = unfade(state.timer)
  syncClock(app)
  notify(app)
  if (!on) return engine.pause()
  engine.setVolume(state.volume)
  engine.play().catch(() => stopAfterFailure(app))
}

const unlockAudio = app => {
  if (app.state.playing) app.engine.unlock()
}

const halt = app => {
  stopTide(app)
  app.state.playing = false
  app.state.timer = unfade(app.state.timer)
  syncClock(app)
  app.engine.halt()
  notify(app)
}

const stopAfterFailure = app => {
  if (!app.state.playing) return
  app.state.playing = false
  syncClock(app)
  notify(app)
}

const stopAfterInterruption = app => {
  if (app.state.playing) setPlaying(app, false)
}

const choosePos = (app, pos) => {
  setPos(app, pos)
  if (app.state.wave) restartTide(app)
}

const stop = app => {
  if (app.state.wave) stopWave(app)
  if (app.state.playing) setPlaying(app, false)
}

const setPos = (app, pos) => {
  app.state.pos = clampPos(pos)
  app.engine.setPosition(app.state.pos)
  save(app)
  notify(app)
}

const setVolume = (app, volume) => {
  app.state.volume = clampVolume(volume)
  if (!app.state.timer.fading && !app.state.wave) app.engine.setVolume(app.state.volume)
  save(app)
  notify(app)
}

const selectColour = (app, index) => {
  choosePos(app, Math.min(index, LAST))
  if (!app.state.playing) setPlaying(app, true)
}

const advanceTimer = app => {
  const { state, engine } = app
  if (state.timer.fading && state.playing) engine.setVolume(state.volume)
  state.timer = cycleTimer(state.timer)
  syncClock(app)
  notify(app)
}

const tick = app => {
  const now = Date.now()
  const elapsed = Math.max(0, now - app.clock.last)
  app.clock.last = now
  const { timer, event } = tickTimer({ timer: app.state.timer, elapsed, playing: app.state.playing })
  app.state.timer = timer
  if (event === 'fade') app.engine.fadeOut(timer.left / 1000)
  if (event === 'end') return setPlaying(app, false)
  notify(app)
}

const syncClock = app => {
  if (!isTimerOn(app.state.timer) || !app.state.playing) return stopClock(app)
  if (app.clock.id) return
  app.clock.last = Date.now()
  app.clock.id = setInterval(() => tick(app), CLOCK_MS)
}

const stopClock = app => {
  clearInterval(app.clock.id)
  app.clock.id = 0
}

const startWave = app => {
  const { state, tide } = app
  state.wave = true
  restartTide(app, { quick: true })
  tide.id = setInterval(() => flowTide(app), WAVE_TICK_MS)
  if (!state.playing) setPlaying(app, true)
  notify(app)
}

const restartTide = (app, { quick = false } = {}) => {
  Object.assign(app.tide, { wave: createWave({ from: app.state.pos, quick }), seconds: 0, last: performance.now() })
}

const stopWave = app => {
  stopTide(app)
  app.state.wave = false
  if (!app.state.timer.fading) app.engine.setVolume(app.state.volume)
  save(app)
  notify(app)
}

const stopTide = app => {
  clearInterval(app.tide.id)
  app.tide.id = 0
}

const flowTide = app => {
  const { state, tide, engine } = app
  const now = performance.now()
  const elapsed = (now - tide.last) / 1000
  tide.last = now
  if (!state.playing) return
  tide.seconds += elapsed
  const { pos, volume } = waveAt(tide.wave, tide.seconds)
  forget(tide.wave, tide.seconds)
  state.pos = clampPos(pos)
  engine.setPosition(state.pos, WAVE_GLIDE_S)
  if (!state.timer.fading) engine.setVolume(clampVolume(state.volume * volume), WAVE_GLIDE_S)
  notify(app)
}

const save = app => app.persist({ pos: app.state.pos, volume: app.state.volume })

const notify = app => app.listeners.forEach(listener => listener(app.state))
