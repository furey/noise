import { COLOURS, isDarkInk, layerOpacity, nearestColour, slopeText } from './colours.js'
import { timerHitBox } from './grid.js'
import { isTimerOn, timerLabel } from './timer.js'

export const createView = doc => {
  const view = {
    doc,
    root: doc.documentElement,
    layers: COLOURS.map(({ id }) => doc.querySelector(`.layer[data-id="${id}"]`)),
    play: doc.getElementById('play'),
    timer: doc.getElementById('timer'),
    slope: doc.getElementById('slope'),
    volume: doc.getElementById('volume'),
  }
  return {
    render: state => render(view, state),
    placeTimer: grid => placeTimer(view, grid),
  }
}

const render = (view, state) => {
  view.doc.body.classList.toggle('playing', state.playing)
  view.root.dataset.ink = isDarkInk(state) ? 'dark' : 'light'
  view.layers.forEach((layer, index) => {
    layer.style.opacity = layerOpacity(state.pos, index)
  })
  renderInputs(view, state)
  view.play.setAttribute('aria-label', state.playing ? 'Pause' : 'Play')
  view.timer.setAttribute('aria-pressed', String(isTimerOn(state.timer)))
  view.timer.setAttribute('aria-label', timerLabel(state.timer))
}

const renderInputs = (view, state) => {
  const focused = view.doc.activeElement
  if (focused !== view.slope) view.slope.value = state.pos
  if (focused !== view.volume) view.volume.value = state.volume
  view.slope.setAttribute('aria-valuetext', `${nearestColour(state.pos).name}, ${slopeText(state.pos)} decibels per octave`)
  view.volume.setAttribute('aria-valuetext', `${Math.round(state.volume * 100)} percent`)
}

const placeTimer = (view, grid) => {
  const box = timerHitBox(grid)
  Object.assign(view.timer.style, {
    left: `${box.left}px`,
    top: `${box.top}px`,
    width: `${box.width}px`,
    height: `${box.height}px`,
  })
}
