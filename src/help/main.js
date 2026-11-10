import { COLOURS } from '../ui/colours.js'
import { PLAYBACK_CHANNEL } from '../ui/playback-channel.js'
import { helpText, renderHelp } from './render.js'

const WAVE_WIDTH = 28
const WAVE_SPEED_MS = 900
const WAVE_BARS = '▁▂▃▄▅▆▇█'

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

const waveCells = phase => Array.from({ length: WAVE_WIDTH }, (_, index) => {
  const level = (Math.sin(index / 5 - phase) + 1) / 2
  const colour = COLOURS[Math.min(COLOURS.length - 1, Math.floor(level * COLOURS.length))]
  const bar = WAVE_BARS[Math.min(WAVE_BARS.length - 1, Math.floor(level * WAVE_BARS.length))]
  return `<span class="${colour.id}">${bar}</span>`
}).join('')

const $ = id => document.getElementById(id)

start()
