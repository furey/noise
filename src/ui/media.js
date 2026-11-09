const TITLE = 'Noise'

export const bindMediaSession = ({ play, pause }) => {
  const session = navigator.mediaSession
  if (!session) return () => {}
  setMetadata(session)
  setHandler(session, 'play', play)
  setHandler(session, 'pause', pause)
  return playing => {
    session.playbackState = playing ? 'playing' : 'paused'
  }
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
