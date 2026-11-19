import { shownPos } from '../provider/follow.js'
import { COLOURS, isDarkInk, layerOpacity, nearestColour, slopeText } from './colours.js'
import { musicHitBox, timerHitBox, waveHitBox } from './layout.js'
import { isTimerOn, timerLabel, timerSize } from './timer.js'

export const createView = doc => {
  const view = {
    doc,
    root: doc.documentElement,
    layers: COLOURS.map(({ id }) => doc.querySelector(`.layer[data-id="${id}"]`)),
    play: doc.getElementById('play'),
    timer: doc.getElementById('timer'),
    wave: doc.getElementById('wave'),
    music: doc.getElementById('music'),
    slope: doc.getElementById('slope'),
    volume: doc.getElementById('volume'),
    grid: null,
    timerSize: 0,
  }
  return {
    render: state => render(view, state),
    placeTimer: grid => placeTimer(view, grid, view.timerSize),
  }
}

const render = (view, state) => {
  view.doc.body.classList.toggle('playing', state.playing)
  const pos = shownPos(state)
  view.root.dataset.ink = isDarkInk({ ...state, pos }) ? 'dark' : 'light'
  view.root.classList.toggle('wave', state.wave && state.track.status === 'idle')
  view.root.classList.toggle('song', state.track.status !== 'idle')
  view.layers.forEach((layer, index) => {
    layer.style.opacity = layerOpacity(pos, index)
  })
  renderInputs(view, state)
  view.play.setAttribute('aria-label', state.playing ? 'Pause' : 'Play')
  view.timer.setAttribute('aria-pressed', String(isTimerOn(state.timer)))
  view.wave.setAttribute('aria-pressed', String(state.wave))
  view.wave.setAttribute('aria-disabled', String(state.track.status !== 'idle'))
  view.music.setAttribute('aria-disabled', String(state.track.status !== 'idle'))
  view.timer.setAttribute('aria-label', timerLabel(state.timer))
  view.music.setAttribute('aria-label', musicLabel(state))
  const size = timerSize(state.timer)
  if (size !== view.timerSize && view.grid) placeTimer(view, view.grid, size)
}

const renderInputs = (view, state) => {
  const focused = view.doc.activeElement
  if (focused !== view.slope) view.slope.value = state.pos
  if (focused !== view.volume) view.volume.value = state.volume
  view.slope.setAttribute('aria-valuetext', `${nearestColour(state.pos).name}, ${slopeText(state.pos)} decibels per octave`)
  view.volume.setAttribute('aria-valuetext', `${Math.round(state.volume * 100)} percent`)
}

const placeTimer = (view, grid, size) => {
  Object.assign(view, { grid, timerSize: size })
  placeBox(view.wave, waveHitBox(grid))
  placeBox(view.timer, timerHitBox(grid, size))
  placeBox(view.music, musicHitBox(grid))
}

const MUSIC_LABELS = { off: 'Music off', over: 'Music over the noise', alone: 'Music alone' }
const PIECE_NAMES = { liquid: 'Liquid', helix: 'Helix' }

const musicLabel = ({ music, piece }) => music === 'off' ? `Music off. Next: ${PIECE_NAMES[piece]}` : `${MUSIC_LABELS[music]}: ${PIECE_NAMES[piece]}`

const placeBox = (element, box) => {
  Object.assign(element.style, {
    left: `${box.left}px`,
    top: `${box.top}px`,
    width: `${box.width}px`,
    height: `${box.height}px`,
  })
}
