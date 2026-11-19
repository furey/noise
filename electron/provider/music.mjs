import { createHost } from './host.mjs'
import { createCache } from './cache.mjs'
import { cleanQuery, isAlbum, usableAlbum, usableTrack } from './contract.mjs'
import { createStreamRoute } from './stream-route.mjs'
import { albumIndex, previousStep, startOver, stepBack, stepForward } from './skip.mjs'

export const createMusic = ({ folder, origin, ipcMain, isTrusted, fetchSource, onStatus, cacheLimitBytes, idleMs }) => {
  const music = { handlers: false, isTrusted, origin, playing: null, current: null, history: [], ahead: [], queue: [], recent: [], refilling: null, prepared: new Map(), album: null, choice: 0 }
  music.host = createHost({ folder, idleMs, onStatus: status => changeStatus({ music, ipcMain, onStatus }, status) })
  music.route = createStreamRoute({ fetchSource, resolveSource: track => music.host.call({ method: 'stream', input: track }) })
  music.cache = createCache({
    folder,
    limitBytes: cacheLimitBytes,
    download: (track, { path }) => music.host.call({ method: 'download', input: track, options: { path } }),
  })
  return {
    start: () => {
      music.cache.clearStale()
      music.host.start()
    },
    isReady: () => music.host.status() === 'ready',
    handles: url => music.route.handles(url),
    serve: request => music.route.serve(request),
    stop: () => music.host.stop(),
  }
}

const changeStatus = ({ music, ipcMain, onStatus }, status) => {
  if (status === 'ready' && !music.handlers) registerHandlers(music, ipcMain)
  onStatus(status === 'ready')
}

const registerHandlers = (music, ipcMain) => {
  music.handlers = true
  const trusted = handler => (event, input) => music.isTrusted(event.sender) ? handler(music, input) : refused()
  ipcMain.handle('music-search', trusted(search))
  ipcMain.handle('music-play', trusted(play))
  ipcMain.handle('music-cached', trusted(cached))
  ipcMain.handle('music-advance', trusted(advance))
  ipcMain.handle('music-previous', trusted(previous))
  ipcMain.handle('music-prepare', trusted(prepare))
}

const search = async (music, query) => {
  music.host.cancel('search')
  const text = cleanQuery(query)
  if (!text) return { tracks: [] }
  return music.host.call({ method: 'search', input: text })
    .then(tracks => ({ tracks }), error => ({ error }))
}

const play = async (music, input) => {
  const choice = choose(music)
  if (isAlbum(input)) return playAlbum(music, { album: usableAlbum(input), choice })
  const track = usableTrack(input)
  if (!track) return unknownTrack()
  music.album = null
  Object.assign(music, startOver(music))
  remember(music, track)
  refill(music, track)
  return playOne(music, track)
}

const choose = music => {
  music.host.cancel('album')
  return ++music.choice
}

const playAlbum = async (music, { album, choice }) => {
  const tracks = await loadAlbum(music, { album, choice })
  if (tracks.error) return { error: tracks.error, albumFailed: true }
  stopRefill(music)
  music.album = { tracks, index: 0 }
  return playAlbumTrack(music)
}

const loadAlbum = async (music, { album, choice }) => {
  if (!album) return unknownTrack()
  const tracks = await music.host.call({ method: 'album', input: album }).catch(error => ({ error }))
  if (choice !== music.choice) return { error: { code: 'cancelled', message: 'Cancelled' } }
  if (tracks.error) return tracks
  if (!tracks.length) return { error: { code: 'not-found', message: 'The album has no songs' } }
  return tracks
}

const playAlbumTrack = async music => {
  const { tracks, index } = music.album
  const track = tracks[index]
  remember(music, track)
  const answer = await playOne(music, track)
  keepInCache(music, tracks[(index + 1) % tracks.length])
  return answer
}

const stepAlbum = (music, step) => {
  music.album.index = albumIndex({ index: music.album.index, length: music.album.tracks.length, step })
  return playAlbumTrack(music)
}

const playOne = async (music, track) => {
  music.playing = track.id
  music.current = track
  const local = await music.cache.find(track.id)
  if (local) return playLocal(music, local)
  const source = await takePrepared(music, track)
  if (source) return playSource(music, { track, source })
  music.host.cancel('stream')
  return music.host.call({ method: 'stream', input: track }).then(fresh => playSource(music, { track, source: fresh }), error => ({ error }))
}

const playSource = (music, { track, source }) => {
  const playing = source.track ?? track
  keepInCache(music, playing)
  return answer(music, { track: playing, path: music.route.add({ track: playing, source }), cached: false })
}

const prepare = async (music, input) => {
  if (isAlbum(input)) return { ok: true }
  const track = usableTrack(input)
  if (!track || music.prepared.has(track.id) || await music.cache.find(track.id)) return { ok: true }
  const preparing = music.host.call({ method: 'stream', input: track }).then(source => ({ source, at: Date.now() }), () => null)
  music.prepared.set(track.id, preparing)
  if (music.prepared.size > PREPARED_LIMIT) music.prepared.delete(music.prepared.keys().next().value)
  await preparing
  return { ok: true }
}

const takePrepared = async (music, track) => {
  const preparing = music.prepared.get(track.id)
  if (!preparing) return null
  music.prepared.delete(track.id)
  const prepared = await preparing
  if (!prepared || Date.now() - prepared.at > PREPARED_FOR_MS) return null
  return prepared.source
}

const playLocal = (music, { file, mime, track }) => {
  music.cache.touch(track.id)
  return answer(music, { track, path: music.route.add({ track, file, mime }), cached: true })
}

const advance = async music => {
  if (music.album) return stepAlbum(music, 1)
  const { track: again, ...forward } = stepForward(music)
  Object.assign(music, forward)
  if (again) return playAgain(music, again)
  if (!music.queue.length) await music.refilling
  if (!music.queue.length) music.queue = await cachedFallback(music)
  const track = music.queue.shift()
  if (!track) return { error: { code: 'not-found', message: 'Nothing to play next' } }
  remember(music, track)
  if (!music.queue.length) refill(music, track)
  else prefetch(music)
  return playOne(music, track)
}

const previous = async (music, input) => {
  const step = previousStep({ seconds: Number(input?.seconds) || 0, album: Boolean(music.album), history: music.history })
  if (step === 'restart') return { restart: true }
  if (step === 'album') return stepAlbum(music, -1)
  const { track, ...back } = stepBack(music)
  Object.assign(music, back)
  return playAgain(music, track)
}

const playAgain = (music, track) => {
  remember(music, track)
  return playOne(music, track)
}

const remember = (music, track) => {
  music.recent = [track.id, ...music.recent.filter(id => id !== track.id)].slice(0, RECENT_LIMIT)
}

const refill = (music, track) => {
  music.queue = []
  const refilling = music.host.call({ method: 'next', input: track })
    .then(tracks => {
      if (music.refilling !== refilling) return
      music.queue = tracks.filter(next => !music.recent.includes(next.id))
      prefetch(music)
    }, () => {})
  music.refilling = refilling
}

const stopRefill = music => {
  music.queue = []
  music.refilling = null
}

const prefetch = music => {
  const [upcoming] = music.queue
  if (upcoming) keepInCache(music, upcoming)
}

const cachedFallback = async music => (await music.cache.list())
  .map(({ track }) => track)
  .filter(track => !music.recent.includes(track.id))

const keepInCache = (music, track) => music.cache.store(track, { keep: [music.playing] }).catch(() => null)

const answer = (music, { track, path, cached }) => ({ url: `${music.origin}${path}`, track, cached })

const cached = async music => ({ entries: await music.cache.list() })

const RECENT_LIMIT = 50
const PREPARED_LIMIT = 5
const PREPARED_FOR_MS = 5 * 60 * 1000

const unknownTrack = () => ({ error: { code: 'not-found', message: 'Unknown track' } })

const refused = () => ({ error: { code: 'unavailable', message: 'Refused' } })
