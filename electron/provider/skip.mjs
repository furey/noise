export const RESTART_AFTER_S = 3
export const HISTORY_LIMIT = 50

export const previousStep = ({ seconds, album, history }) => {
  if (seconds > RESTART_AFTER_S) return 'restart'
  if (album) return 'album'
  return history.length ? 'history' : 'restart'
}

export const albumIndex = ({ index, length, step }) => (index + step + length) % length

export const stepBack = ({ history, ahead, current }) => ({
  track: history.at(-1),
  history: history.slice(0, -1),
  ahead: current ? [...ahead, current] : ahead,
})

export const stepForward = ({ history, ahead, current }) => ({
  track: ahead.at(-1) ?? null,
  history: withPlayed(history, current),
  ahead: ahead.slice(0, -1),
})

export const startOver = ({ history, current }) => ({ history: withPlayed(history, current), ahead: [] })

const withPlayed = (history, track) => {
  if (!track || history.at(-1)?.id === track.id) return history
  return [...history, track].slice(-HISTORY_LIMIT)
}
