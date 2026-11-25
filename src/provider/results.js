import { fuzzyMatch, rankMatches } from './fuzzy.js'

export const ROW_LIMIT = 5
export const MEMO_LIMIT = 50
export const MEMO_FOR_MS = 10 * 60 * 1000

export const TRACK_SEPARATOR = ' · '

export const trackText = track => [track.title, track.artist].filter(Boolean).join(TRACK_SEPARATOR)

export const separatorAt = track => track?.title && track?.artist ? track.title.length : -1

export const lengthText = track => {
  if (track.kind === 'album') return track.trackCount ? songCountText(track.trackCount) : ''
  return track.durationS ? clockText(track.durationS) : ''
}

export const mergeRows = ({ query, cached, live }) => {
  const cachedIds = new Set(cached.map(track => track.id))
  const matches = query.trim()
    ? rankMatches({ query, items: cached, textOf: trackText, limit: ROW_LIMIT }).map(({ item, hits }) => ({ track: item, hits, cached: true }))
    : []
  const liveRows = live.map(track => ({ track, hits: fuzzyMatch(query, trackText(track))?.hits ?? [], cached: cachedIds.has(track.id) }))
  const [best, ...rest] = liveRows
  return uniqueByTrack(best ? [best, ...matches, ...rest] : matches).slice(0, ROW_LIMIT)
}

export const keepRowAt = ({ rows, row, index }) => {
  const others = rows.filter(each => each.track.id !== row.track.id)
  return [...others.slice(0, index), row, ...others.slice(index)].slice(0, ROW_LIMIT)
}

export const createMemo = ({ limit = MEMO_LIMIT, forMs = MEMO_FOR_MS, now = Date.now } = {}) => {
  const entries = new Map()
  return {
    get: query => {
      const entry = entries.get(memoKey(query))
      return entry && now() - entry.at < forMs ? entry.tracks : null
    },
    set: (query, tracks) => {
      entries.delete(memoKey(query))
      entries.set(memoKey(query), { tracks, at: now() })
      if (entries.size > limit) entries.delete(entries.keys().next().value)
    },
  }
}

export const clockText = seconds => {
  const whole = Math.max(0, Math.round(seconds))
  const hours = Math.floor(whole / 3600)
  const minutes = Math.floor(whole / 60) % 60
  const rest = String(whole % 60).padStart(2, '0')
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`
}

const songCountText = count => count === 1 ? '1 song' : `${count} songs`

const uniqueByTrack = rows => rows.filter((row, index) => rows.findIndex(other => other.track.id === row.track.id) === index)

const memoKey = query => query.trim().toLowerCase().replace(/\s+/g, ' ')

export const ALBUM_LABEL = 'Album'
