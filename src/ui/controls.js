import { COLOURS, LAST } from './colours.js'
import { columnCentreX, posAtX, synthHeight, zoneAt } from './grid.js'
import { bindGestures } from './gestures.js'

const SILENT_CHECK_MS = 600
const HELP_PAGE = 'help.html'
const HELP_TARGET = 'noise-help'

const ARROWS = {
  ArrowLeft: app => app.nudgePos(-1),
  ArrowRight: app => app.nudgePos(1),
  ArrowUp: app => app.nudgeVolume(1),
  ArrowDown: app => app.nudgeVolume(-1),
}

export const bindControls = ({ app, doc, layout }) => {
  const surface = doc.getElementById('surface')
  const controls = { app, doc, layout, surface, dragVolume: 0, playingAtPress: false }
  const unbinders = [
    bindSurface(controls),
    listen(doc.getElementById('play'), 'click', () => app.togglePlay()),
    listen(doc.getElementById('timer'), 'click', () => app.cycleTimer()),
    listen(doc.getElementById('wave'), 'click', () => app.toggleWave()),
    listen(doc.getElementById('slope'), 'input', e => app.setPos(Number(e.target.value))),
    listen(doc.getElementById('volume'), 'input', e => app.setVolume(Number(e.target.value))),
    listen(doc, 'keydown', e => onKey(controls, e)),
  ]
  return () => unbinders.forEach(unbind => unbind())
}

const bindSurface = controls => bindGestures({
  surface: controls.surface,
  zoneAt: y => controls.layout.stripLocked ? 'synth' : zoneAt(controls.layout.grid, y),
  onPress: press => onPress(controls, press),
  onDrag: drag => onDrag(controls, drag),
  onRelease: press => onRelease(controls, press),
  onTap: tap => onTap(controls, tap),
  onHover: zone => {
    controls.surface.dataset.zone = zone
  },
})

const onPress = (controls, { zone, x }) => {
  controls.dragVolume = controls.app.state.volume
  controls.playingAtPress = controls.app.state.playing
  if (zone === 'colour') beginColourDrag(controls, x)
  controls.app.unlockAudio()
}

const onDrag = (controls, drag) => {
  if (drag.zone === 'colour') return dragColour(controls, drag)
  dragVolume(controls, drag)
}

const dragColour = ({ app, layout }, { x }) => app.setPos(posAtX({ grid: layout.grid, x, last: LAST }))

const dragVolume = ({ app, layout, surface, dragVolume, playingAtPress }, { dy }) => {
  if (!playingAtPress || !app.state.playing) return
  surface.dataset.drag = 'volume'
  app.setVolume(dragVolume - dy / synthHeight(layout.grid))
}

const onRelease = (controls, { zone }) => {
  controls.app.unlockAudio()
  setTimeout(() => controls.app.pauseIfSilent(), SILENT_CHECK_MS)
  if (zone === 'colour') return endColourDrag(controls)
  delete controls.surface.dataset.drag
}

const onTap = ({ app, playingAtPress }, { zone }) => {
  if (!playingAtPress) return app.setPlaying(true)
  if (zone === 'synth') app.setPlaying(false)
}

const beginColourDrag = ({ app, doc, layout, surface }, x) => {
  surface.dataset.drag = 'colour'
  doc.documentElement.style.setProperty('--blend', '0s')
  app.setPos(posAtX({ grid: layout.grid, x: columnCentreX(layout.grid, x), last: LAST }))
  if (!app.state.playing) app.setPlaying(true)
}

const endColourDrag = ({ doc, surface }) => {
  delete surface.dataset.drag
  doc.documentElement.style.removeProperty('--blend')
}

const onKey = ({ app, doc }, e) => {
  if (e.target.closest?.('input') || e.metaKey || e.ctrlKey || e.altKey) return
  if (e.key === 'Escape') return app.stop()
  const digit = Number(e.key)
  if (digit >= 1 && digit <= COLOURS.length) return app.selectColour(digit - 1)
  if (e.key === ' ' && !e.target.closest?.('button')) {
    e.preventDefault()
    return app.togglePlay()
  }
  if (e.key === 't' || e.key === 'T') return app.cycleTimer()
  if (e.key === '?') return openHelp(doc)
  const arrow = ARROWS[e.key]
  if (!arrow) return
  e.preventDefault()
  arrow(app)
}

const openHelp = doc => doc.defaultView.open(HELP_PAGE, HELP_TARGET)

const listen = (target, type, listener) => {
  target.addEventListener(type, listener)
  return () => target.removeEventListener(type, listener)
}
