import { nearestColour } from './colours.js'

export const PLAYBACK_CHANNEL = 'noise-playback'

export const sharePlayback = app => {
  if (typeof BroadcastChannel === 'undefined') return
  const channel = new BroadcastChannel(PLAYBACK_CHANNEL)
  const last = { key: '' }
  const send = state => channel.postMessage(playbackMessage(state))
  channel.onmessage = ({ data }) => data?.type === 'ask' && send(app.state)
  app.subscribe(state => {
    const message = playbackMessage(state)
    const key = `${message.playing}:${message.colour}`
    if (key === last.key) return
    last.key = key
    channel.postMessage(message)
  })
}

export const playbackMessage = ({ playing, pos }) => ({ type: 'state', playing, colour: nearestColour(pos).id })
