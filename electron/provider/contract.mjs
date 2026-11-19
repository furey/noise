export const API_VERSION = 1
export const REQUIRED_FUNCTIONS = Object.freeze(['search', 'stream', 'next', 'download'])
export const DRIVER_FUNCTIONS = Object.freeze([...REQUIRED_FUNCTIONS, 'album'])
export const TIMEOUTS_MS = Object.freeze({ search: 20000, stream: 20000, next: 30000, download: 300000, album: 30000 })
export const ERROR_CODES = Object.freeze(['not-found', 'unavailable', 'timeout', 'cancelled'])
export const SEARCH_LIMIT = 5

export const driverProblem = driver => {
  if (!driver || typeof driver !== 'object') return 'the driver exports nothing'
  if (driver.apiVersion !== API_VERSION) return `the driver apiVersion is ${driver.apiVersion}, not ${API_VERSION}`
  const missing = REQUIRED_FUNCTIONS.filter(name => typeof driver[name] !== 'function')
  return missing.length ? `the driver lacks ${missing.join(', ')}` : ''
}

export const isDriverFunction = name => DRIVER_FUNCTIONS.includes(name)

export const usableTrack = raw => {
  const id = String(raw?.id ?? '')
  const title = cleanText(raw?.title)
  if (!TRACK_ID.test(id) || !title) return null
  return { id, title, artist: cleanText(raw.artist), durationS: wholeSeconds(raw.durationS) }
}

export const usableTracks = raws => listOf(raws).map(usableTrack).filter(Boolean)

export const isAlbum = raw => raw?.kind === 'album'

export const usableAlbum = raw => {
  const track = isAlbum(raw) && usableTrack(raw)
  if (!track) return null
  return { id: track.id, title: track.title, artist: track.artist, durationS: 0, kind: 'album', trackCount: wholeCount(raw.trackCount) }
}

export const usableItem = raw => isAlbum(raw) ? usableAlbum(raw) : usableTrack(raw)

export const supportedResult = ({ driver, method, result }) => method === 'search' && typeof driver?.album !== 'function' && Array.isArray(result)
  ? result.filter(raw => !isAlbum(raw))
  : result

export const usableResult = Object.freeze({
  search: raw => listOf(raw).map(usableItem).filter(Boolean).slice(0, SEARCH_LIMIT),
  next: raw => usableTracks(raw),
  album: raw => usableTracks(raw),
  stream: raw => usableStream(raw),
  download: raw => ({ mime: cleanMime(raw?.mime) }),
})

export const driverError = error => ({
  code: ERROR_CODES.includes(error?.code) ? error.code : 'unavailable',
  message: String(error?.message ?? error ?? '').slice(0, MESSAGE_LIMIT),
})

export const cleanQuery = query => cleanText(query).slice(0, QUERY_LIMIT)

const usableStream = raw => {
  if (!isSourceUrl(raw?.url)) return null
  return {
    url: raw.url,
    headers: stringMap(raw.headers),
    mime: cleanMime(raw.mime),
    expiresAt: Number.isFinite(raw.expiresAt) && raw.expiresAt > 0 ? raw.expiresAt : 0,
    track: usableTrack(raw.track),
  }
}

const isSourceUrl = value => {
  try {
    const { protocol, hostname } = new URL(value)
    return protocol === 'https:' || (protocol === 'http:' && LOOPBACK_HOSTS.includes(hostname))
  } catch {
    return false
  }
}

const stringMap = value => Object.fromEntries(Object.entries(isPlainObject(value) ? value : {})
  .filter(([key, entry]) => typeof key === 'string' && typeof entry === 'string'))

const isPlainObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const cleanMime = value => MIME.test(String(value ?? '')) ? value : ''

const cleanText = value => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, TEXT_LIMIT) : ''

const wholeCount = value => Number.isInteger(value) && value > 0 ? value : 0

const listOf = value => Array.isArray(value) ? value : []

const wholeSeconds = value => Number.isFinite(value) && value > 0 ? Math.round(value) : 0

const LOOPBACK_HOSTS = Object.freeze(['127.0.0.1', 'localhost', '[::1]'])
const TRACK_ID = /^[A-Za-z0-9_-]{1,64}$/
const MIME = /^audio\/[a-z0-9.+-]{1,40}$/
const TEXT_LIMIT = 200
const QUERY_LIMIT = 200
const MESSAGE_LIMIT = 300
