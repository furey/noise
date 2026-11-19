import { COLOURS } from '../ui/colours.js'
import { PLAYBACK_CHANNEL } from '../ui/playback-channel.js'
import { helpFor, placeOf } from './place.js'
import { helpText, parseHelp, renderHelp } from './render.js'

const start = async () => {
  const html = await fetch('./index.html').then(response => response.text())
  const version = new URLSearchParams(location.search).get('v') ?? ''
  $('help').innerHTML = renderHelp({ help: parseHelp(helpFor(helpText(html), placeOf(location.search))), version })
  followPlayback()
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

const $ = id => document.getElementById(id)

start()
