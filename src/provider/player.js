export const FAILURE_LIMIT = 3
export const ALBUM_NOT_LOADED = "Couldn't load that album. Try another."
export const ALBUM_NOT_PLAYED = "Couldn't play this album."
export const SONG_NOT_PLAYED = "Couldn't play that song."

export const createPlayer = ({ app, engine, music }) => {
  const player = { app, engine, music, failures: 0, request: 0, album: false, onFailure: null }
  engine.onTrack(event => onTrackEvent(player, event))
  return {
    play: track => play(player, track),
    stop: () => stop(player),
    next: () => skipForward(player),
    previous: () => skipBack(player),
    onFailure: listener => {
      player.onFailure = listener
    },
  }
}

const play = async (player, track) => {
  const request = ++player.request
  const previous = player.app.state.track
  player.failures = 0
  player.album = track.kind === 'album'
  player.app.loadTrack(track)
  const answer = await player.music.play(track)
  if (answer.albumFailed) return request === player.request && albumNotLoaded(player, previous)
  start(player, request, answer)
}

const albumNotLoaded = (player, previous) => {
  restore(player, previous)
  report(player, ALBUM_NOT_LOADED)
}

const restore = (player, previous) => {
  if (previous.status === 'idle') return player.app.endTrack()
  player.app.loadTrack(previous.current)
  if (previous.status === 'active') player.app.trackSounding()
}

const advance = async player => {
  const request = ++player.request
  start(player, request, await player.music.advance())
}

const skipForward = player => {
  if (isIdle(player)) return
  player.failures = 0
  return advance(player)
}

const skipBack = async player => {
  if (isIdle(player)) return
  player.failures = 0
  const request = ++player.request
  const answer = await player.music.previous(player.engine.trackTime().current)
  if (!answer.restart) return start(player, request, answer)
  if (request === player.request) player.engine.restartTrack()
}

const isIdle = player => player.app.state.track.status === 'idle'

const start = (player, request, answer) => {
  if (request !== player.request || player.app.state.track.status === 'idle') return
  if (answer.error) return fail(player)
  player.app.startTrack({ track: answer.track, url: answer.url })
}

const onTrackEvent = (player, event) => {
  if (event === 'playing') {
    player.failures = 0
    return player.app.trackSounding()
  }
  if (event === 'ended') return advance(player)
  if (event === 'error') return fail(player)
}

const fail = player => {
  if (player.failedRequest === player.request) return
  player.failedRequest = player.request
  player.failures += 1
  if (player.failures < FAILURE_LIMIT) return advance(player)
  stop(player)
  report(player, player.album ? ALBUM_NOT_PLAYED : SONG_NOT_PLAYED)
}

const report = (player, message) => player.onFailure?.(message)

const stop = player => {
  player.request += 1
  if (player.app.state.track.status === 'idle') return
  player.app.endTrack()
  player.app.setPlaying(false)
}
