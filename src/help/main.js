import { COLOURS } from '../ui/colours.js'
import { WAVE_BARS, WAVE_SPEED_MS, waveColour, waveLevel, waveStep } from './wave.js'
import { PLAYBACK_CHANNEL } from '../ui/playback-channel.js'
import { helpText, renderHelp } from './render.js'

const WAVE_WIDTH = 28

const start = async () => {
  const html = await fetch('./index.html').then(response => response.text())
  const version = new URLSearchParams(location.search).get('v') ?? ''
  $('help').innerHTML = renderHelp({ text: helpText(html), version })
  followPlayback()
  animateWave(matchMedia('(prefers-reduced-motion: reduce)'))
  addEventListener('keydown', e => e.key === 'Escape' && window.close())
}

const followPlayback = () => {
  const channel = new BroadcastChannel(PLAYBACK_CHANNEL)
  channel.onmessage = ({ data }) => showPlayback(data)
  channel.postMessage({ type: 'ask' })
}

const showPlayback = ({ type, playing, colour }) => {
  if (type !== 'state') return
  const hex = COLOURS.find(({ id }) => id === colour)?.hex
  document.body.classList.toggle('playing', Boolean(playing && hex))
  document.documentElement.style.setProperty('--accent', playing && hex ? hex : '')
}

const animateWave = reducedMotion => {
  const wave = $('wave')
  if (!wave) return
  const draw = now => {
    wave.innerHTML = waveCells(reducedMotion.matches ? 0 : now / WAVE_SPEED_MS)
    requestAnimationFrame(draw)
  }
  requestAnimationFrame(draw)
}

const waveCells = phase => Array.from({ length: WAVE_WIDTH }, (_, column) => {
  const level = waveLevel({ column, phase })
  return `<span class="${waveColour(level).id}">${WAVE_BARS[waveStep(level)]}</span>`
}).join('')

const $ = id => document.getElementById(id)

start()
