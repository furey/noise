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

const start = () => {
  markDesktop()
  const engine = createEngine()
  const app = createApp({ engine, settings: loadSettings(), persist: saveSettings })
  const view = createView(document)
  const synth = createSynth({ spec: $('spec'), fx: $('fx') })
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')
  const layout = { grid: null }
  const frame = { dt: 0, now: 0, playing: false, pos: 0, volume: 0, timer: null, analyser: null, sampleRate: 48000, reducedMotion: false }
  const loop = createFrameLoop({
    draw: (dt, now) => synth.draw(fillFrame({ frame, dt, now, state: app.state, engine, reducedMotion })),
  })
  const relayout = () => {
    layout.grid = measureLayout()
    synth.resize(layout.grid)
    view.placeTimer(layout.grid)
    loop.wake()
  }
  const syncPlayback = bindMediaSession({ play: () => app.setPlaying(true), pause: () => app.setPlaying(false) })
  relayout()
  addEventListener('resize', relayout)
  addEventListener('pagehide', () => app.halt())
  bindControls({ app, doc: document, layout })
  app.subscribe(state => {
    view.render(state)
    syncPlayback(state.playing)
    loop.wake()
  })
  registerServiceWorker()
}

const fillFrame = ({ frame, dt, now, state, engine, reducedMotion }) => {
  frame.dt = dt
  frame.now = now
  frame.playing = state.playing
  frame.pos = state.pos
  frame.volume = state.volume
  frame.timer = state.timer
  frame.analyser = engine.analyser()
  frame.sampleRate = engine.sampleRate()
  frame.reducedMotion = reducedMotion.matches
  return frame
}

const measureLayout = () => {
  const spec = $('spec')
  return measureGrid({
    width: spec.clientWidth || innerWidth,
    height: spec.clientHeight || innerHeight,
    dpr: Math.min(MAX_DPR, devicePixelRatio || 1),
    insets: readInsets(),
  })
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
