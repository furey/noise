import { createEngine } from './audio/engine.js'
import { createApp } from './app.js'
import { loadSettings, saveSettings } from './settings.js'
import { bindControls } from './ui/controls.js'
import { measureGrid } from './ui/grid.js'
import { createFrameLoop } from './ui/loop.js'
import { bindMediaSession } from './ui/media.js'
import { createSynth } from './ui/synth.js'
import { createView } from './ui/view.js'

const MAX_DPR = 2
const LATE_INSETS_MS = 500
const MAX_BACKING_PIXELS = 3840 * 2160
const MAX_HOME_BAR_GAP_PX = 60

const start = () => {
  markDesktop()
  const engine = createEngine()
  const app = createApp({ engine, settings: loadSettings(), persist: saveSettings })
  const view = createView(document)
  const synth = createSynth({ spec: $('spec'), fx: $('fx') })
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')
  const layout = { grid: null, stripLocked: matchMedia('(pointer: coarse)').matches }
  const frame = { stripLocked: false, dt: 0, now: 0, playing: false, pos: 0, volume: 0, timer: null, wave: false, analyser: null, sampleRate: 48000, reducedMotion: false }
  const loop = createFrameLoop({
    draw: (dt, now) => synth.draw(fillFrame({ frame, dt, now, state: app.state, engine, reducedMotion, layout })),
  })
  const relayout = () => {
    coverHomeBarGap()
    layout.grid = measureLayout()
    synth.resize(layout.grid)
    view.placeTimer(layout.grid)
    loop.wake()
  }
  const syncPlayback = bindMediaSession({ play: () => app.setPlaying(true), pause: () => app.setPlaying(false) })
  const scheduleRelayout = oncePerFrame(relayout)
  relayout()
  addEventListener('resize', scheduleRelayout)
  addEventListener('load', scheduleRelayout)
  setTimeout(scheduleRelayout, LATE_INSETS_MS)
  watchPixelRatio(scheduleRelayout)
  addEventListener('pagehide', () => app.halt())
  addEventListener('pageshow', e => e.persisted && prepareAudio(engine))
  requestAnimationFrame(() => setTimeout(() => prepareAudio(engine)))
  bindControls({ app, doc: document, layout })
  app.subscribe(state => {
    if (state.playing) layout.stripLocked = false
    view.render(state)
    syncPlayback(state.playing)
    loop.wake()
  })
  registerServiceWorker()
}

const prepareAudio = engine => engine.prepare().catch(() => {})

const fillFrame = ({ frame, dt, now, state, engine, reducedMotion, layout }) => {
  frame.stripLocked = layout.stripLocked
  frame.dt = dt
  frame.now = now
  frame.playing = state.playing
  frame.pos = state.pos
  frame.volume = state.volume
  frame.timer = state.timer
  frame.wave = state.wave
  frame.analyser = engine.analyser()
  frame.sampleRate = engine.sampleRate()
  frame.reducedMotion = reducedMotion.matches
  return frame
}

const measureLayout = () => {
  const spec = $('spec')
  const width = spec.clientWidth || innerWidth
  const height = spec.clientHeight || innerHeight
  const insets = readInsets()
  const titlebar = document.querySelector('.titlebar')?.offsetHeight ?? 0
  return measureGrid({ width, height, dpr: backingDpr(width, height), insets, titlebar })
}

const backingDpr = (width, height) =>
  Math.min(MAX_DPR, devicePixelRatio || 1, Math.sqrt(MAX_BACKING_PIXELS / Math.max(1, width * height)))

const oncePerFrame = run => {
  let pending = 0
  return () => {
    pending ||= requestAnimationFrame(() => {
      pending = 0
      run()
    })
  }
}

const watchPixelRatio = onChange => {
  const query = matchMedia(`(resolution: ${devicePixelRatio}dppx)`)
  query.addEventListener('change', () => {
    onChange()
    watchPixelRatio(onChange)
  }, { once: true })
}

const coverHomeBarGap = () => document.documentElement.style.setProperty('--home-bar-gap', `${homeBarGap()}px`)

const homeBarGap = () => {
  if (!navigator.standalone) return 0
  const landscape = innerWidth > innerHeight
  const screenHeight = landscape ? Math.min(screen.width, screen.height) : Math.max(screen.width, screen.height)
  const gap = screenHeight - innerHeight
  return gap > 0 && gap <= MAX_HOME_BAR_GAP_PX ? gap : 0
}

const readInsets = () => {
  const style = getComputedStyle($('insets'))
  const read = side => parseFloat(style[`padding${side}`]) || 0
  return { top: read('Top'), right: read('Right'), bottom: read('Bottom'), left: read('Left') }
}

const markDesktop = () => {
  if (location.protocol !== 'app:') return
  const root = document.documentElement
  root.classList.add('desktop')
  if (!isMac()) return
  root.classList.add('mac')
  const strip = document.createElement('div')
  strip.className = 'titlebar'
  strip.setAttribute('aria-hidden', 'true')
  document.body.prepend(strip)
}

const isMac = () => /^mac/i.test(navigator.userAgentData?.platform || navigator.platform || '')

const registerServiceWorker = () => {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator) || !location.protocol.startsWith('http')) return
  navigator.serviceWorker.register('sw.js').catch(() => {})
}

const $ = id => document.getElementById(id)

start()
