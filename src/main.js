import { createEngine } from './audio/engine.js'
import { createApp } from './app.js'
import { createPlayer } from './provider/player.js'
import { createFollow, followSong, glidePos } from './provider/follow.js'
import { createMusicUi } from './provider/music-ui.js'
import { createAutoHide, revealForKey, stepAutoHide } from './ui/auto-hide.js'
import { menuState, runCommand } from './ui/commands.js'
import { loadSettings, saveSettings } from './settings.js'
import { bindControls } from './ui/controls.js'
import { ignoreFocusClicks } from './ui/focus-click.js'
import { measureLayout as measureSmooth } from './ui/layout.js'
import { createFrameLoop, pickFrameRate } from './ui/loop.js'
import { bindMediaSession } from './ui/media.js'
import { sharePlayback } from './ui/playback-channel.js'
import { createSynth } from './ui/tide.js'
import { uiScale } from './ui/ui-scale.js'
import { createView } from './ui/view.js'

const MAX_DPR = 2
const LATE_INSETS_MS = 500
const TIDE_OPTIONS = Object.freeze({ radial: 'rays', blend: 'over', fx: 'gl', governor: true })
const MAX_BACKING_PIXELS = 3840 * 2160
const MAX_HOME_BAR_GAP_PX = 60
const RESIZE_SETTLE_MS = 250

const start = () => {
  markDesktop()
  const engine = createEngine()
  const app = createApp({ engine, settings: loadSettings(), persist: saveSettings })
  const view = createView(document)
  const synth = createSynth({ spec: $('spec'), fx: $('fx'), water: $('water'), options: { ...TIDE_OPTIONS, water: window.noiseDesktop ? 'gl' : '2d' } })
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')
  const layout = { grid: null, stripLocked: matchMedia('(pointer: coarse)').matches }
  const frame = { stripLocked: false, dt: 0, now: 0, playing: false, pos: 0, volume: 0, timer: null, wave: false, analyser: null, sampleRate: 48000, reducedMotion: false, chromeAlpha: 1 }
  const auto = createAutoHide()
  const follow = createFollow()
  const music = { ui: null }
  const reportChrome = bindAutoHide({ auto, wake: () => loop.wake() })
  const loop = createFrameLoop({
    fps: pickFrameRate(navigator.hardwareConcurrency),
    draw: (dt, now) => {
      followSong({ follow, state: app.state, analyser: engine.analyser(), sampleRate: engine.sampleRate(), dt, report: app.followTrack })
      const livePos = () => glidePos({ follow, state: app.state, target: app.livePos(), dt })
      fillFrame({ frame, dt, now, state: app.state, livePos, engine, reducedMotion, layout })
      auto.searching = Boolean(music.ui?.isOpen())
      frame.chromeAlpha = stepAutoHide({ auto, playing: frame.playing, dt, reducedMotion: frame.reducedMotion })
      reportChrome(frame.chromeAlpha)
      frame.trackOn = app.state.track.status !== 'idle'
      frame.sliderShown = music.ui ? music.ui.frame({ pos: frame.pos, dt, chromeAlpha: frame.chromeAlpha }) : 1
      return synth.draw(frame)
    },
  })
  const relayout = () => {
    coverHomeBarGap()
    layout.grid = measureLayout()
    showScale(layout.grid.scale)
    synth.resize(layout.grid)
    view.placeTimer(layout.grid)
    music.ui?.place(musicSlot(layout.grid))
    loop.redraw()
  }
  const syncPlayback = bindMediaSession({
    play: () => app.setPlaying(true),
    pause: () => app.setPlaying(false),
    next: () => music.ui?.nextSong(),
    previous: () => music.ui?.previousSong(),
  })
  const scheduleRelayout = oncePerFrame(relayout)
  relayout()
  addEventListener('resize', hideWhileResizing(() => {
    relayout()
    synth.replayIntro()
    loop.wake()
  }))
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
    syncPlayback({ playing: state.playing, song: state.track.status !== 'idle' })
    loop.wake()
  })
  sharePlayback(app)
  bindDesktopMenu(app)
  music.ui = bindMusic({ app, engine })
  music.ui?.place(musicSlot(layout.grid))
  registerServiceWorker()
}

const hideWhileResizing = onSettle => {
  const root = document.documentElement
  let settleTimer = 0
  return () => {
    root.classList.add('resizing')
    clearTimeout(settleTimer)
    settleTimer = setTimeout(() => {
      onSettle()
      requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('resizing')))
    }, RESIZE_SETTLE_MS)
  }
}

const bindDesktopMenu = app => {
  const desktop = window.noiseDesktop
  if (!desktop) return
  desktop.onCommand(command => runCommand(app, command))
  let sent = ''
  app.subscribe(() => {
    const state = menuState(app)
    const next = JSON.stringify(state)
    if (next === sent) return
    sent = next
    desktop.setMenuState(state)
  })
}

const bindMusic = ({ app, engine }) => {
  const music = window.noiseDesktop?.music
  if (!music) return null
  const player = createPlayer({ app, engine, music })
  if (window.__noiseTest) Object.assign(window.__noiseTest, { player, track: () => app.state.track, trackTime: () => engine.trackTime() })
  music.onStatus(({ ready }) => document.documentElement.toggleAttribute('data-music', ready))
  return createMusicUi({ doc: document, app, engine, music, player, desktop: window.noiseDesktop, mac: isMac() })
}

const musicSlot = ({ strip, linePx }) => ({ left: strip.left, top: strip.top + (strip.height - linePx) / 2, width: strip.width, height: linePx })

const bindAutoHide = ({ auto, wake }) => {
  const desktop = window.noiseDesktop
  if (!desktop) return () => {}
  desktop.onAutoHide(({ enabled, inside }) => {
    Object.assign(auto, { enabled, inside })
    wake()
  })
  addEventListener('pointerdown', () => {
    auto.held = true
  })
  addEventListener('pointerup', () => releasePointer({ auto, wake }))
  addEventListener('pointercancel', () => releasePointer({ auto, wake }))
  addEventListener('pointermove', e => {
    if (auto.inside || e.buttons !== 0) return
    auto.inside = true
    desktop.pointerEntered()
    wake()
  })
  addEventListener('keydown', () => {
    revealForKey(auto)
    wake()
  })
  let hidden = false
  return alpha => {
    if ((alpha === 0) === hidden) return
    hidden = alpha === 0
    desktop.setChromeHidden(hidden)
  }
}

const releasePointer = ({ auto, wake }) => {
  auto.held = false
  wake()
}

const prepareAudio = engine => engine.prepare().catch(() => {})

const fillFrame = ({ frame, dt, now, state, livePos, engine, reducedMotion, layout }) => {
  frame.stripLocked = layout.stripLocked
  frame.colourDrag = $('surface').dataset.drag === 'colour'
  frame.dt = dt
  frame.now = now
  frame.playing = state.playing
  frame.pos = livePos()
  frame.volume = state.volume
  frame.timer = state.timer
  frame.wave = state.wave && state.track.status === 'idle'
  frame.waveSaved = state.wave
  frame.music = state.music
  frame.piece = state.piece
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
  const mouse = matchMedia('(pointer: fine)').matches
  return measureSmooth({ width, height, dpr: backingDpr(width, height), insets, titlebar, mouse, scale: desktopScale({ width, height }) })
}

const desktopScale = size => document.documentElement.classList.contains('desktop') ? uiScale(size) : 1

const showScale = scale => document.documentElement.style.setProperty('--ui-scale', String(scale))

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
  ignoreFocusClicks(window)
  const strip = document.createElement('div')
  strip.className = 'titlebar'
  strip.setAttribute('aria-hidden', 'true')
  document.body.prepend(strip)
}

const registerServiceWorker = () => {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator) || !location.protocol.startsWith('http')) return
  navigator.serviceWorker.register('sw.js').catch(() => {})
}

const isMac = () => /^mac/i.test(navigator.userAgentData?.platform || navigator.platform || '')

const $ = id => document.getElementById(id)

start()
