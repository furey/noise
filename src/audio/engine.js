import workletUrl from './noise.worklet.js?url'

const FADE_IN_S = 0.3
const FADE_OUT_S = 0.05
const VOLUME_RAMP_S = 0.05
const POSITION_RAMP_S = 0.015
const SUSPEND_AFTER_MS = 400
const STUCK_AFTER_MS = 1000
const FFT_SIZE = 4096
const ANALYSER_SMOOTHING = 0.85

export const isAudioSupported = () => Boolean(audioContextClass() && window.AudioWorkletNode)

export const createEngine = () => {
  const engine = {
    ctx: null, noise: null, master: null, analyser: null, element: null, fallbackSource: null,
    booting: null, wanted: false, live: false, suspendTimer: 0, heldSince: 0, position: 0, volume: 0.6, onInterrupt: () => {},
  }
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
  engine.ctx?.close().catch(() => {})
  Object.assign(engine, { ctx: null, noise: null, master: null, analyser: null, element: null, fallbackSource: null, booting: null, heldSince: 0 })
}

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
  engine.ctx.suspend()
}

const fadeOut = (engine, seconds) => {
  if (!engine.master) return
  rampTo(engine, 0, Math.max(0.05, seconds / 4))
}

const setPosition = (engine, position, glide = POSITION_RAMP_S) => {
  engine.position = position
  if (!engine.noise) return
  const param = engine.noise.parameters.get('position')
  param.cancelScheduledValues(engine.ctx.currentTime)
  param.setTargetAtTime(position, engine.ctx.currentTime, glide)
}

const planPosition = (engine, values, timing) => {
  engine.position = values[0]
  if (engine.noise) plan({ param: engine.noise.parameters.get('position'), ctx: engine.ctx, values, ...timing })
}

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
  await ctx.audioWorklet.addModule(workletUrl)
  if (engine.ctx !== ctx) return
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
