import workletUrl from './noise.worklet.js?url'
import musicWorkletUrl from './music.worklet.js?url'
import { noiseGainFor } from './music-mix.js'
import { TRACK_FADE_IN_S, TRACK_FADE_OUT_S, isTrackAudible, rampGain } from './track-fade.js'

const FADE_IN_S = 0.3
const FADE_OUT_S = 0.05
const VOLUME_RAMP_S = 0.05
const POSITION_RAMP_S = 0.015
const SUSPEND_AFTER_MS = 400
const STUCK_AFTER_MS = 1000
const FFT_SIZE = 4096
const ANALYSER_SMOOTHING = 0.85
const MUSIC_BLEND_S = 0.4
const PIECES = ['liquid', 'helix']
const SEED_RANGE = 2 ** 31
const STOP = 'stop'
const RETIRE_RESUME_MS = 100
const RETIRE_STOP_MS = 100
const TRACK_LEVEL = 0.7
const TRACK_END_GAP_S = 0.5

export const isAudioSupported = () => Boolean(audioContextClass() && window.AudioWorkletNode)

export const createEngine = ({ voicing = 'smooth', musicLevel = 1 } = {}) => {
  const engine = {
    voicing, musicLevel,
    ctx: null, noise: null, music: null, noiseGain: null, master: null, analyser: null, element: null, fallbackSource: null,
    booting: null, wanted: false, live: false, suspendTimer: 0, heldSince: 0, position: 0, volume: 0.6, onInterrupt: () => {},
    mix: { mode: 'off', piece: 'liquid' },
    track: null, onTrack: () => {},
  }
  document.addEventListener('visibilitychange', () => suspendOnReturn(engine))
  return {
    onInterrupt: listener => {
      engine.onInterrupt = listener
    },
    prepare: () => prepare(engine),
    play: () => play(engine),
    unlock: () => unlock(engine),
    isBlocked: () => isBlocked(engine),
    pause: () => pause(engine),
    halt: () => halt(engine),
    fadeOut: seconds => fadeOut(engine, seconds),
    setPosition: (position, glide) => setPosition(engine, position, glide),
    setVolume: (volume, glide) => setVolume(engine, volume, glide),
    planPosition: (values, timing) => planPosition(engine, values, timing),
    planVolume: (values, timing) => planVolume(engine, values, timing),
    setMusic: music => setMusic(engine, music),
    playTrack: url => playTrack(engine, url),
    stopTrack: () => stopTrack(engine),
    seekTrack: seconds => seekTrack(engine, seconds),
    seekTrackTo: seconds => seekTrackTo(engine, seconds),
    restartTrack: () => restartTrack(engine),
    quietTrack: () => quietTrack(engine),
    trackTime: () => trackTime(engine),
    onTrack: listener => {
      engine.onTrack = listener
    },
    analyser: () => engine.analyser,
    sampleRate: () => engine.ctx?.sampleRate ?? 48000,
  }
}

const prepare = engine => {
  engine.booting ??= boot(engine).catch(error => {
    discard(engine)
    throw error
  })
  return engine.booting
}

const play = async engine => {
  engine.wanted = true
  clearTimeout(engine.suspendTimer)
  if (isStuck(engine)) rebuild(engine)
  wake(engine)
  await prepare(engine)
  if (!engine.wanted) return scheduleSuspend(engine)
  const { ctx } = engine
  const resumed = await ctx.resume().then(() => true, () => false)
  if (engine.ctx !== ctx) return
  if (!resumed) throw new Error('The audio context did not resume')
  await startElement(engine)
  if (!engine.wanted) return scheduleSuspend(engine)
  Object.assign(engine, { live: true, heldSince: 0 })
  startTrackElement(engine)
  rampTo(engine, engine.volume, FADE_IN_S)
}

const isStuck = engine => isHeld(engine.ctx) && engine.heldSince > 0 && performance.now() - engine.heldSince > STUCK_AFTER_MS

const rebuild = engine => {
  engine.element?.pause()
  discard(engine)
}

const unlock = engine => {
  if (!engine.wanted || engine.live) return
  wake(engine)
}

const wake = engine => {
  if (!engine.ctx) return
  if (isHeld(engine.ctx)) engine.heldSince ||= performance.now()
  engine.ctx.resume().catch(() => {})
  engine.element?.play().catch(() => {})
}

const isBlocked = engine => engine.wanted && !engine.live && isHeld(engine.ctx) && Boolean(engine.noise)

const isHeld = ctx => ctx?.state === 'suspended' || ctx?.state === 'interrupted'

const pause = engine => {
  engine.wanted = false
  engine.live = false
  if (!engine.master) return
  rampTo(engine, 0, FADE_OUT_S)
  setTimeout(() => !engine.wanted && engine.track?.element?.pause(), FADE_OUT_S * 1000)
  scheduleSuspend(engine)
}

const halt = engine => {
  engine.wanted = false
  engine.live = false
  clearTimeout(engine.suspendTimer)
  if (!engine.ctx) return
  engine.element?.pause()
  discard(engine)
}

const discard = engine => {
  detachTrack(engine)
  retire(engine)
  releaseElement(engine.element)
  Object.assign(engine, { ctx: null, noise: null, music: null, noiseGain: null, master: null, analyser: null, element: null, fallbackSource: null, booting: null, heldSince: 0 })
}

const retire = ({ ctx, master, noise, music }) => {
  if (!ctx) return
  silence({ ctx, master })
  closeOnceStopped({ ctx, nodes: [noise, music].filter(Boolean) }).catch(() => {})
}

const silence = ({ ctx, master }) => {
  if (!master) return
  master.gain.cancelScheduledValues(ctx.currentTime)
  master.gain.value = 0
}

const closeOnceStopped = async ({ ctx, nodes }) => {
  if (!nodes.length) return ctx.close()
  if (document.hidden) await suspendUntilVisible(ctx)
  nodes.forEach(node => node.port?.postMessage(STOP))
  await Promise.race([ctx.resume().catch(() => {}), wait(RETIRE_RESUME_MS)])
  await wait(RETIRE_STOP_MS)
  await ctx.close()
}

const suspendUntilVisible = ctx => {
  ctx.suspend().catch(() => {})
  return new Promise(resolve => {
    const onVisibility = () => {
      if (document.hidden) return
      document.removeEventListener('visibilitychange', onVisibility)
      resolve()
    }
    document.addEventListener('visibilitychange', onVisibility)
  })
}

const wait = ms => new Promise(resolve => setTimeout(resolve, ms))

const interrupt = (engine, source) => {
  if (!engine.live || source !== engine.ctx && source !== engine.element) return
  if (engine.ctx.state === 'running' && !engine.element?.paused) return
  engine.onInterrupt()
}

const scheduleSuspend = engine => {
  clearTimeout(engine.suspendTimer)
  engine.suspendTimer = setTimeout(() => {
    if (!engine.wanted) suspend(engine)
  }, SUSPEND_AFTER_MS)
}

const suspend = engine => {
  if (!engine.ctx) return
  engine.element?.pause()
  engine.track?.element?.pause()
  if (!document.hidden) engine.ctx.suspend()
}

const suspendOnReturn = engine => {
  if (!document.hidden && !engine.wanted && engine.ctx?.state === 'running') suspend(engine)
}

const fadeOut = (engine, seconds) => {
  if (!engine.master) return
  rampTo(engine, 0, Math.max(0.05, seconds / 4))
}

const setPosition = (engine, position, glide = POSITION_RAMP_S) => {
  engine.position = position
  if (!engine.noise) return
  const now = engine.ctx.currentTime
  positionParams(engine).forEach(param => {
    param.cancelScheduledValues(now)
    param.setTargetAtTime(position, now, glide)
  })
  blendNoise(engine, glide)
}

const planPosition = (engine, values, timing) => {
  engine.position = values[0]
  if (!engine.noise) return
  positionParams(engine).forEach(param => plan({ param, ctx: engine.ctx, values, ...timing }))
  plan({ param: engine.noiseGain.gain, ctx: engine.ctx, values: values.map(position => noiseTarget(engine, position)), ...timing })
}

const positionParams = engine => [engine.noise, engine.music].map(node => node.parameters.get('position'))

const setMusic = (engine, mix) => {
  engine.mix = mix
  applyMix(engine)
}

const applyMix = engine => {
  if (!engine.music) return
  const now = engine.ctx.currentTime
  engine.music.parameters.get('piece').setValueAtTime(pieceIndex(engine.mix), now)
  engine.music.parameters.get('active').setValueAtTime(isMusicActive(engine) ? 1 : 0, now)
  blendNoise(engine, MUSIC_BLEND_S)
}

const blendNoise = (engine, glide) => {
  const { gain } = engine.noiseGain
  const now = engine.ctx.currentTime
  gain.cancelScheduledValues(now)
  gain.setTargetAtTime(noiseTarget(engine, engine.position), now, glide)
}

const noiseTarget = (engine, position) => holdsMix(engine.track) ? 0 : noiseLevel(engine.mix, position)

const isMusicActive = engine => isMusicOn(engine.mix) && !holdsMix(engine.track)

const noiseLevel = ({ mode, piece }, position) => {
  if (mode === 'alone') return 0
  if (mode === 'over') return noiseGainFor({ piece, position })
  return 1
}

const isMusicOn = ({ mode }) => mode !== 'off'

const pieceIndex = ({ piece }) => Math.max(0, PIECES.indexOf(piece))

const planVolume = (engine, values, timing) => {
  engine.volume = values[0]
  if (engine.wanted && engine.master && engine.ctx.state === 'running') {
    plan({ param: engine.master.gain, ctx: engine.ctx, values, ...timing })
  }
}

const plan = ({ param, ctx, values, step, glide }) => {
  const now = ctx.currentTime
  param.cancelScheduledValues(now)
  values.forEach((value, index) => param.setTargetAtTime(value, now + index * step, glide))
}

const setVolume = (engine, volume, glide = VOLUME_RAMP_S) => {
  engine.volume = volume
  if (engine.wanted && engine.master && engine.ctx.state === 'running') rampTo(engine, volume, glide)
}

const boot = async engine => {
  const AudioContext = audioContextClass()
  setPlaybackSession()
  const ctx = createContext(AudioContext)
  engine.ctx = ctx
  ctx.addEventListener('statechange', () => interrupt(engine, ctx))
  await Promise.all([ctx.audioWorklet.addModule(workletUrl), ctx.audioWorklet.addModule(musicWorkletUrl)])
  if (engine.ctx !== ctx) return
  const noise = new AudioWorkletNode(ctx, 'noise', {
    numberOfInputs: 0,
    outputChannelCount: [2],
    parameterData: { position: engine.position },
  })
  const music = new AudioWorkletNode(ctx, 'music', {
    numberOfInputs: 0,
    outputChannelCount: [2],
    parameterData: { position: engine.position, piece: pieceIndex(engine.mix), active: isMusicActive(engine) ? 1 : 0 },
    processorOptions: { seed: Math.floor(Math.random() * SEED_RANGE), voicing: engine.voicing },
  })
  const noiseGain = ctx.createGain()
  noiseGain.gain.value = noiseTarget(engine, engine.position)
  const analyser = ctx.createAnalyser()
  analyser.fftSize = FFT_SIZE
  analyser.smoothingTimeConstant = ANALYSER_SMOOTHING
  const master = ctx.createGain()
  master.gain.value = 0
  const limiter = createLimiter(ctx)
  noise.connect(noiseGain).connect(analyser)
  const musicGain = ctx.createGain()
  musicGain.gain.value = engine.musicLevel
  music.connect(musicGain).connect(analyser)
  analyser.connect(master).connect(limiter)
  Object.assign(engine, { ctx, noise, music, noiseGain, master, analyser })
  routeOutput(engine, limiter)
  if (engine.track) attachTrack(engine)
}

const playTrack = (engine, url) => {
  if (!isTrackSounding(engine)) return swapTrack(engine, url)
  leaveTrack(engine, { then: () => swapTrack(engine, url), replacing: true })
}

const restartTrack = engine => {
  if (!isTrackSounding(engine)) return seekTrackTo(engine, 0)
  if (engine.track.leaving) return
  leaveTrack(engine, { then: () => resumeFromStart(engine), replacing: false })
}

const resumeFromStart = engine => {
  seekTrackTo(engine, 0)
  fadeTrack(engine, engine.track, TRACK_LEVEL, TRACK_FADE_IN_S)
}

const quietTrack = engine => {
  if (!isTrackSounding(engine) || engine.track.leaving) return
  leaveTrack(engine, { then: () => engine.track?.element?.pause(), replacing: true })
}

const isTrackSounding = engine => {
  const { track } = engine
  if (!track?.gain) return false
  const { paused, ended } = track.element
  return isTrackAudible({ live: engine.live, sounding: track.sounding, paused, ended })
}

const leaveTrack = (engine, { then, replacing }) => {
  const { track } = engine
  if (track.leaving) {
    track.leaving.then = then
    track.leaving.replacing ||= replacing
    return
  }
  fadeTrack(engine, track, 0, TRACK_FADE_OUT_S)
  const timer = setTimeout(() => finishLeaving(engine, track), TRACK_FADE_OUT_S * 1000)
  track.leaving = { then, replacing, timer }
}

const finishLeaving = (engine, track) => {
  if (engine.track !== track) return
  const { then } = track.leaving
  track.leaving = null
  then()
}

const fadeTrack = (engine, track, value, seconds) => {
  if (!track?.gain || !engine.ctx) return
  rampGain({ ctx: engine.ctx, param: track.gain.gain, value, seconds })
}

const swapTrack = (engine, url) => {
  const previous = engine.track
  if (previous) {
    clearTimeout(previous.leaving?.timer)
    detachTrack(engine)
  }
  engine.track = { url, element: null, source: null, resumeAt: 0, sounding: false, holdsMix: holdsMix(previous) || !engine.wanted, fadeIn: Boolean(previous) }
  if (engine.ctx && engine.analyser) attachTrack(engine)
  if (!engine.wanted) silenceMix(engine)
  if (engine.live) startTrackElement(engine)
}

const silenceMix = engine => {
  if (!engine.noiseGain) return
  const now = engine.ctx.currentTime
  engine.noiseGain.gain.cancelScheduledValues(now)
  engine.noiseGain.gain.setValueAtTime(0, now)
  engine.music.parameters.get('active').setValueAtTime(0, now)
}

const holdsMix = track => Boolean(track?.sounding || track?.holdsMix)

const stopTrack = engine => {
  if (!engine.track) return
  clearTimeout(engine.track.leaving?.timer)
  detachTrack(engine)
  const held = holdsMix(engine.track)
  engine.track = null
  if (held) applyMix(engine)
}

const attachTrack = engine => {
  const { track, ctx } = engine
  const element = new Audio()
  element.preload = 'auto'
  element.src = track.url
  const source = ctx.createMediaElementSource(element)
  const gain = ctx.createGain()
  gain.gain.value = track.fadeIn ? 0 : TRACK_LEVEL
  source.connect(gain).connect(engine.analyser)
  const listening = new AbortController()
  const { signal } = listening
  element.addEventListener('loadedmetadata', () => {
    if (track.resumeAt) element.currentTime = track.resumeAt
  }, { once: true, signal })
  element.addEventListener('playing', () => trackSounding(engine, track, element), { signal })
  element.addEventListener('ended', () => engine.track === track && !track.leaving && engine.onTrack('ended'), { signal })
  element.addEventListener('error', () => reportTrackError(engine, track, element), { signal })
  Object.assign(track, { element, source, gain, listening })
}

const trackSounding = (engine, track, element) => {
  if (engine.track !== track || track.element !== element || track.leaving) return
  if (!track.sounding) {
    Object.assign(track, { sounding: true, holdsMix: false })
    applyMix(engine)
  }
  if (track.fadeIn) {
    track.fadeIn = false
    fadeTrack(engine, track, TRACK_LEVEL, TRACK_FADE_IN_S)
  }
  engine.onTrack('playing')
}

const detachTrack = engine => {
  const { track } = engine
  const element = track?.element
  if (!element) return
  track.resumeAt = element.currentTime || track.resumeAt
  track.listening?.abort()
  track.source?.disconnect()
  track.gain?.disconnect()
  Object.assign(track, { element: null, source: null, gain: null, listening: null })
  element.pause()
  element.removeAttribute('src')
  element.load()
}

const startTrackElement = engine => {
  const { track } = engine
  const element = track?.element
  if (!element) return
  element.play().catch(error => {
    if (error?.name !== 'AbortError') reportTrackError(engine, track, element)
  })
}

const reportTrackError = (engine, track, element) => {
  if (engine.track !== track || track.element !== element || track.failed || track.leaving) return
  track.failed = true
  engine.onTrack('error')
}

const seekTrack = (engine, seconds) => {
  const element = engine.track?.element
  if (!element || !Number.isFinite(element.duration)) return
  element.currentTime = Math.max(0, Math.min(element.currentTime + seconds, element.duration - TRACK_END_GAP_S))
}

const seekTrackTo = (engine, seconds) => {
  const element = engine.track?.element
  if (!element || !Number.isFinite(element.duration)) return
  element.currentTime = Math.max(0, Math.min(seconds, element.duration - TRACK_END_GAP_S))
}

const trackTime = engine => {
  const element = engine.track?.element
  if (!element || engine.track.leaving?.replacing) return { current: engine.track?.resumeAt ?? 0, duration: 0 }
  return { current: element.currentTime, duration: Number.isFinite(element.duration) ? element.duration : 0 }
}

const createLimiter = ctx => {
  const limiter = ctx.createDynamicsCompressor()
  limiter.threshold.value = -3
  limiter.knee.value = 0
  limiter.ratio.value = 20
  limiter.attack.value = 0.003
  limiter.release.value = 0.1
  return limiter
}

const createContext = AudioContext => {
  if (!window.MediaStreamAudioDestinationNode) return new AudioContext()
  try {
    return new AudioContext({ sinkId: { type: 'none' } })
  } catch {
    return new AudioContext()
  }
}

const isSilentSink = ctx => ctx.sinkId?.type === 'none'

const routeOutput = (engine, source) => {
  if (!window.MediaStreamAudioDestinationNode) return source.connect(engine.ctx.destination)
  const stream = engine.ctx.createMediaStreamDestination()
  source.connect(stream)
  const element = new Audio()
  element.srcObject = stream.stream
  element.setAttribute('playsinline', '')
  element.addEventListener('pause', () => interrupt(engine, element))
  Object.assign(engine, { element, fallbackSource: source })
}

const startElement = async engine => {
  if (!engine.element) return
  try {
    await engine.element.play()
  } catch {
    if (!engine.ctx) return
    engine.fallbackSource.connect(engine.ctx.destination)
    if (isSilentSink(engine.ctx)) await engine.ctx.setSinkId('')
    releaseElement(engine.element)
    engine.element = null
  }
}

const releaseElement = element => {
  if (element) element.srcObject = null
}

const setPlaybackSession = () => {
  try {
    if (navigator.audioSession) navigator.audioSession.type = 'playback'
  } catch {
    return
  }
}

const rampTo = (engine, value, timeConstant) => {
  const now = engine.ctx.currentTime
  engine.master.gain.cancelScheduledValues(now)
  engine.master.gain.setTargetAtTime(value, now, timeConstant)
}

const audioContextClass = () => window.AudioContext || window.webkitAudioContext
