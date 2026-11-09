import workletUrl from './noise.worklet.js?url'

const FADE_IN_S = 0.3
const FADE_OUT_S = 0.05
const VOLUME_RAMP_S = 0.05
const POSITION_RAMP_S = 0.015
const SUSPEND_AFTER_MS = 400
const FFT_SIZE = 4096
const ANALYSER_SMOOTHING = 0.85

export const isAudioSupported = () => Boolean(audioContextClass() && window.AudioWorkletNode)

export const createEngine = () => {
  const engine = {
    ctx: null, noise: null, master: null, analyser: null, element: null, fallbackSource: null,
    booting: null, wanted: false, suspendTimer: 0, position: 0, volume: 0.6,
  }
  return {
    play: () => play(engine),
    pause: () => pause(engine),
    halt: () => halt(engine),
    fadeOut: seconds => fadeOut(engine, seconds),
    setPosition: position => setPosition(engine, position),
    setVolume: volume => setVolume(engine, volume),
    analyser: () => engine.analyser,
    sampleRate: () => engine.ctx?.sampleRate ?? 48000,
  }
}

const play = async engine => {
  engine.wanted = true
  clearTimeout(engine.suspendTimer)
  engine.booting ??= boot(engine).catch(error => {
    engine.booting = null
    throw error
  })
  await engine.booting
  if (!engine.wanted) return scheduleSuspend(engine)
  if (engine.ctx.state !== 'running') await engine.ctx.resume()
  await startElement(engine)
  if (engine.wanted) rampTo(engine, engine.volume, FADE_IN_S)
}

const pause = engine => {
  engine.wanted = false
  if (!engine.master) return
  rampTo(engine, 0, FADE_OUT_S)
  scheduleSuspend(engine)
}

const halt = engine => {
  engine.wanted = false
  clearTimeout(engine.suspendTimer)
  if (!engine.ctx) return
  engine.element?.pause()
  engine.ctx.close().catch(() => {})
  Object.assign(engine, { ctx: null, noise: null, master: null, analyser: null, element: null, fallbackSource: null, booting: null })
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
  engine.ctx.suspend()
}

const fadeOut = (engine, seconds) => {
  if (!engine.master) return
  rampTo(engine, 0, Math.max(0.05, seconds / 4))
}

const setPosition = (engine, position) => {
  engine.position = position
  if (!engine.noise) return
  engine.noise.parameters.get('position').setTargetAtTime(position, engine.ctx.currentTime, POSITION_RAMP_S)
}

const setVolume = (engine, volume) => {
  engine.volume = volume
  if (engine.wanted && engine.master && engine.ctx.state === 'running') rampTo(engine, volume, VOLUME_RAMP_S)
}

const boot = async engine => {
  const AudioContext = audioContextClass()
  setPlaybackSession()
  const ctx = new AudioContext()
  engine.ctx = ctx
  await ctx.audioWorklet.addModule(workletUrl)
  const noise = new AudioWorkletNode(ctx, 'noise', {
    numberOfInputs: 0,
    outputChannelCount: [2],
    parameterData: { position: engine.position },
  })
  const analyser = ctx.createAnalyser()
  analyser.fftSize = FFT_SIZE
  analyser.smoothingTimeConstant = ANALYSER_SMOOTHING
  const master = ctx.createGain()
  master.gain.value = 0
  const limiter = createLimiter(ctx)
  noise.connect(analyser).connect(master).connect(limiter)
  Object.assign(engine, { ctx, noise, master, analyser })
  routeOutput(engine, limiter)
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

const routeOutput = (engine, source) => {
  if (!window.MediaStreamAudioDestinationNode) return source.connect(engine.ctx.destination)
  const stream = engine.ctx.createMediaStreamDestination()
  source.connect(stream)
  const element = new Audio()
  element.srcObject = stream.stream
  element.setAttribute('playsinline', '')
  Object.assign(engine, { element, fallbackSource: source })
}

const startElement = async engine => {
  if (!engine.element) return
  try {
    await engine.element.play()
  } catch {
    engine.fallbackSource.connect(engine.ctx.destination)
    engine.element = null
  }
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
