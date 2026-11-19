const TITLE = 'Noise'

export const bindMediaSession = ({ play, pause, next, previous }) => {
  const session = navigator.mediaSession
  if (!session) return () => {}
  setMetadata(session)
  setHandler(session, 'play', play)
  setHandler(session, 'pause', pause)
  const skips = { on: false }
  return ({ playing, song }) => {
    session.playbackState = playing ? 'playing' : 'paused'
    if (song !== skips.on) setSkips(session, { skips, song, next, previous })
  }
}

const setSkips = (session, { skips, song, next, previous }) => {
  skips.on = song
  setHandler(session, 'nexttrack', song ? next : null)
  setHandler(session, 'previoustrack', song ? previous : null)
}

const setMetadata = session => {
  if (!window.MediaMetadata) return
  try {
    session.metadata = new MediaMetadata({ title: TITLE })
  } catch {
    return
  }
}

const setHandler = (session, action, handler) => {
  try {
    session.setActionHandler(action, handler)
  } catch {
    return
  }
}
