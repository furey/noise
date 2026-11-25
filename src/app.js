import { LAST, clampPos } from './ui/colours.js'
import { MUSIC_CYCLE, clampVolume } from './settings.js'
import { createTimer, cycleTimer, isTimerOn, tickTimer, unfade } from './ui/timer.js'
import {
  WAVE_GLIDE_S, WAVE_PLAN_S, WAVE_PLAN_STEP_S, WAVE_REPLAN_S, WAVE_TICK_MS, createWave, forget, waveAt,
} from './wave.js'

const POS_STEP = 0.25
const VOLUME_STEP = 0.1
const SEEK_STEP_S = 10
const IDLE_TRACK = Object.freeze({ status: 'idle', current: null })
const CLOCK_MS = 1000

export const createApp = ({ engine, settings, persist }) => {
  const app = {
    engine, persist,
    state: {
      playing: false, pos: settings.pos, volume: settings.volume, timer: createTimer(), wave: Boolean(settings.wave),
      music: settings.music ?? 'off', piece: settings.piece ?? 'liquid', track: IDLE_TRACK,
    },
    listeners: new Set(),
    clock: { id: 0, last: 0 },
    tide: { id: 0, wave: null, seconds: 0, last: 0, plan: null },
    waveFromSilence: false,
  }
  engine.setPosition(app.state.pos)
  engine.setVolume(app.state.volume)
  engine.setMusic(musicOf(app.state))
  if (app.state.wave) restartTide(app, { quick: true })
  engine.onInterrupt(() => stopAfterInterruption(app))
  return {
    state: app.state,
    livePos: () => livePos(app),
    subscribe: listener => subscribe(app, listener),
    togglePlay: () => interact(app, () => setPlaying(app, !app.state.playing)),
    setPlaying: on => interact(app, () => setPlaying(app, on)),
    unlockAudio: () => unlockAudio(app),
    pauseIfSilent: () => pauseIfSilent(app),
    halt: () => halt(app),
    setPos: pos => interact(app, () => unlessTrack(app, () => choosePos(app, pos))),
    nudgePos: steps => interact(app, () => nudgeOrSeek(app, steps)),
    toggleWave: () => unlessTrack(app, () => app.state.wave ? endWave(app) : startWave(app)),
    stop: () => stop(app),
    loadTrack: track => loadTrack(app, track),
    startTrack: ({ track, url }) => startTrack(app, { track, url }),
    trackSounding: () => trackSounding(app),
    endTrack: () => endTrack(app),
    followTrack: pos => followTrack(app, pos),
    setVolume: volume => interact(app, () => setVolume(app, volume)),
    nudgeVolume: steps => interact(app, () => setVolume(app, app.state.volume + steps * VOLUME_STEP)),
    selectColour: index => interact(app, () => unlessTrack(app, () => selectColour(app, index))),
    cycleTimer: () => interact(app, () => advanceTimer(app)),
    cycleMusic: () => interact(app, () => unlessTrack(app, () => cycleMusic(app))),
    musicStep: () => musicStepOf(app.state),
    chooseMusic: step => interact(app, () => unlessTrack(app, () => chooseMusic(app, step))),
    chooseTimer: minutes => interact(app, () => setTimer(app, { left: minutes * 60000, fading: false })),
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
  syncTide(app)
  notify(app)
  if (!on) return engine.pause()
  engine.setVolume(state.volume)
  engine.play().catch(() => stopAfterFailure(app))
}

const unlockAudio = app => {
  if (app.state.playing) app.engine.unlock()
}

const pauseIfSilent = app => {
  if (app.state.playing && app.engine.isBlocked()) setPlaying(app, false)
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
  app.engine.pause()
  syncClock(app)
  syncTide(app)
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
  if (isTrackOn(app)) {
    endTrack(app)
    return setPlaying(app, false)
  }
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
  if (!app.state.timer.fading && !isWaveActive(app)) app.engine.setVolume(app.state.volume)
  save(app)
  notify(app)
}

const selectColour = (app, index) => {
  choosePos(app, Math.min(index, LAST))
  if (!app.state.playing) setPlaying(app, true)
}

const advanceTimer = app => setTimer(app, cycleTimer(app.state.timer))

const setTimer = (app, timer) => {
  const { state, engine } = app
  if (state.timer.fading && state.playing) engine.setVolume(state.volume)
  state.timer = timer
  syncClock(app)
  notify(app)
}

const cycleMusic = app => chooseMusic(app, (musicStepOf(app.state) + 1) % MUSIC_CYCLE.length)

const chooseMusic = (app, step) => {
  if (!MUSIC_CYCLE[step]) return
  Object.assign(app.state, MUSIC_CYCLE[step])
  applyMusic(app)
}

const musicStepOf = state =>
  MUSIC_CYCLE.findIndex(step => step.music === state.music && (step.music === 'off' || step.piece === state.piece))

const applyMusic = app => {
  app.engine.setMusic(musicOf(app.state))
  save(app)
  if (app.state.music !== 'off' && !app.state.playing) return setPlaying(app, true)
  notify(app)
}

const musicOf = ({ music, piece }) => ({ mode: music, piece })

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

const interact = (app, action) => {
  app.waveFromSilence = false
  action()
}

const startWave = app => {
  const { state } = app
  app.waveFromSilence = !state.playing
  state.wave = true
  restartTide(app, { quick: true })
  save(app)
  if (!state.playing) return setPlaying(app, true)
  syncTide(app)
  notify(app)
}

const syncTide = app => {
  const { state, tide } = app
  if (!isWaveActive(app) || !state.playing) return stopTide(app)
  if (tide.id) return
  Object.assign(tide, { last: performance.now(), plan: null })
  tide.id = setInterval(() => flowTide(app), WAVE_TICK_MS)
}

const restartTide = (app, { quick = false } = {}) => {
  Object.assign(app.tide, { wave: createWave({ from: app.state.pos, quick }), seconds: 0, last: performance.now() })
}

const endWave = app => {
  const silenceAfter = app.waveFromSilence
  stopWave(app)
  if (silenceAfter && app.state.playing) setPlaying(app, false)
}

const stopWave = app => {
  stopTide(app)
  app.state.wave = false
  app.engine.setPosition(app.state.pos)
  if (!app.state.timer.fading) app.engine.setVolume(app.state.volume)
  save(app)
  notify(app)
}

const stopTide = app => {
  clearInterval(app.tide.id)
  app.tide.id = 0
}

const flowTide = app => {
  const { state, tide } = app
  const now = performance.now()
  const elapsed = (now - tide.last) / 1000
  tide.last = now
  tide.seconds += elapsed
  state.pos = clampPos(waveAt(tide.wave, tide.seconds).pos)
  forget(tide.wave, tide.seconds)
  if (isPlanStale(app)) planTide(app)
  notify(app)
}

const livePos = ({ state, tide }) => {
  if (state.track.status !== 'idle' && Number.isFinite(state.track.pos)) return state.track.pos
  if (!tide.id) return state.pos
  const seconds = tide.seconds + (performance.now() - tide.last) / 1000
  return clampPos(waveAt(tide.wave, seconds).pos)
}

const isPlanStale = ({ state, tide: { plan, wave, seconds } }) =>
  !plan
  || plan.wave !== wave
  || plan.volume !== state.volume
  || plan.fading !== state.timer.fading
  || plan.until - seconds < WAVE_REPLAN_S

const planTide = app => {
  const { state, tide, engine } = app
  const count = Math.round(WAVE_PLAN_S / WAVE_PLAN_STEP_S) + 1
  const points = Array.from({ length: count }, (_, index) => waveAt(tide.wave, tide.seconds + index * WAVE_PLAN_STEP_S))
  const timing = { step: WAVE_PLAN_STEP_S, glide: WAVE_GLIDE_S }
  engine.planPosition(points.map(({ pos }) => clampPos(pos)), timing)
  if (!state.timer.fading) engine.planVolume(points.map(({ volume }) => clampVolume(state.volume * volume)), timing)
  tide.plan = { wave: tide.wave, volume: state.volume, fading: state.timer.fading, until: tide.seconds + WAVE_PLAN_S }
}

const unlessTrack = (app, action) => isTrackOn(app) ? undefined : action()

const nudgeOrSeek = (app, steps) => isTrackOn(app)
  ? app.engine.seekTrack(steps * SEEK_STEP_S)
  : choosePos(app, app.state.pos + steps * POS_STEP)

const isTrackOn = app => app.state.track.status !== 'idle'

const isWaveActive = app => app.state.wave && !isTrackOn(app)

const loadTrack = (app, track) => {
  app.waveFromSilence = false
  app.state.track = { status: 'loading', current: track, pos: app.state.track.pos }
  notify(app)
}

const startTrack = (app, { track, url }) => {
  const { state, engine } = app
  state.track = { status: 'loading', current: track, pos: state.track.pos }
  stopTide(app)
  engine.setPosition(state.pos)
  if (!state.timer.fading) engine.setVolume(state.volume)
  engine.playTrack(url)
  if (!state.playing) return setPlaying(app, true)
  notify(app)
}

const trackSounding = app => {
  if (app.state.track.status === 'idle') return
  app.state.track = { ...app.state.track, status: 'active' }
  notify(app)
}

const followTrack = (app, pos) => {
  if (!isTrackOn(app)) return
  app.state.track = { ...app.state.track, pos }
  notify(app)
}

const endTrack = app => {
  if (!isTrackOn(app)) return
  app.engine.stopTrack()
  app.state.track = IDLE_TRACK
  if (app.state.wave) restartTide(app, { quick: true })
  syncTide(app)
  notify(app)
}

const save = ({ persist, state }) => persist({ pos: state.pos, volume: state.volume, wave: state.wave, music: state.music, piece: state.piece })

const notify = app => app.listeners.forEach(listener => listener(app.state))
