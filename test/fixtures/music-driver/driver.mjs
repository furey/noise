import { writeFile } from 'node:fs/promises'
import http from 'node:http'

export const apiVersion = 1

export const search = async (query, { signal }) => {
  if (query === 'nothing') throw Object.assign(new Error('No match'), { code: 'not-found' })
  if (query === 'slow') await waitUntilAborted(signal)
  if (query in ALBUM_QUERIES) return [ALBUM_QUERIES[query]]
  if (query.includes('album')) return [ALBUM, { id: 'fake-1', title: `Fake ${query}`, artist: 'Fixture', durationS: 3 }]
  return [
    { id: 'fake-1', title: `Fake ${query}`, artist: 'Fixture', durationS: 3 },
    { id: 'bad id!', title: 'Rejected' },
  ]
}

export const stream = async track => {
  const calls = (streamCalls.get(track.id) ?? 0) + 1
  streamCalls.set(track.id, calls)
  console.log(`stream ${track.id} ${calls}`)
  const ticket = track.id === 'expiring' && calls === 1 ? 'stale' : 'fresh'
  return {
    url: `${await serverUrl()}/${track.id}.wav?ticket=${ticket}`,
    headers: { 'X-Fixture': 'yes' },
    mime: 'audio/wav',
    expiresAt: 0,
    track: { ...track, artist: 'Fixture Artist', durationS: SECONDS },
  }
}

export const next = async track => track.id.startsWith('broken')
  ? [2, 3, 4].map(n => ({ id: `broken-${n}`, title: `Broken ${n}` }))
  : [{ id: nextFakeId(track.id), title: 'Fake Two', artist: 'Fixture' }]

export const album = async item => {
  if (item.id === LOST_ALBUM.id) throw Object.assign(new Error('Album unavailable'), { code: 'unavailable' })
  if (item.id === ALBUM.id) return sideTracks(['side-1', 'side-2', 'side-3'])
  if (item.id === SKIPPY_ALBUM.id) return sideTracks(['skip-1', 'broken-skip', 'skip-3'])
  if (item.id === BROKEN_ALBUM.id) return sideTracks(['broken-a', 'broken-b', 'broken-c'])
  return []
}

const sideTracks = ids => ids.map((id, index) => ({ id, title: `Side ${index + 1}`, artist: 'Fixture', durationS: SECONDS }))

export const download = async (track, { path }) => {
  console.log(`download ${track.id}`)
  if (track.id.startsWith('broken')) throw Object.assign(new Error('Broken'), { code: 'unavailable' })
  await writeFile(path, WAV)
  return { mime: 'audio/wav' }
}

const nextFakeId = id => `fake-${(Number(id.match(/^fake-(\d+)$/)?.[1]) || 1) + 1}`

const serverUrl = async () => {
  server ??= await listen()
  return `http://127.0.0.1:${server.address().port}`
}

const listen = () => new Promise(resolve => {
  const created = http.createServer(answer)
  created.listen(0, '127.0.0.1', () => resolve(created))
})

const answer = (request, response) => {
  const url = new URL(request.url, 'http://fixture')
  if (url.searchParams.get('ticket') === 'stale' || request.headers['x-fixture'] !== 'yes') return response.writeHead(403).end()
  if (url.pathname.startsWith('/broken')) return response.writeHead(404).end()
  const audio = url.pathname.startsWith('/bright') ? NOISE_WAV : WAV
  const range = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range ?? '')
  if (!range) return response.writeHead(200, { 'content-type': 'audio/wav', 'content-length': audio.length }).end(audio)
  const start = Number(range[1])
  const end = Math.min(range[2] ? Number(range[2]) : audio.length - 1, audio.length - 1)
  response.writeHead(206, { 'content-type': 'audio/wav', 'content-length': end - start + 1, 'content-range': `bytes ${start}-${end}/${audio.length}` })
  response.end(audio.subarray(start, end + 1))
}

const wavOf = ({ seconds, rate, sample }) => {
  const samples = seconds * rate
  const wav = Buffer.alloc(44 + samples * 2)
  wav.write('RIFF', 0)
  wav.writeUInt32LE(36 + samples * 2, 4)
  wav.write('WAVEfmt ', 8)
  wav.writeUInt32LE(16, 16)
  wav.writeUInt16LE(1, 20)
  wav.writeUInt16LE(1, 22)
  wav.writeUInt32LE(rate, 24)
  wav.writeUInt32LE(rate * 2, 28)
  wav.writeUInt16LE(2, 32)
  wav.writeUInt16LE(16, 34)
  wav.write('data', 36)
  wav.writeUInt32LE(samples * 2, 40)
  for (let i = 0; i < samples; i++) wav.writeInt16LE(Math.round(sample(i) * 8000), 44 + i * 2)
  return wav
}

const noiseSample = i => {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453
  return (x - Math.floor(x)) * 2 - 1
}

const waitUntilAborted = signal => new Promise((_resolve, reject) =>
  signal.addEventListener('abort', () => reject(Object.assign(new Error('Aborted'), { code: 'cancelled' }))))

const ALBUM = Object.freeze({ id: 'album-1', title: 'Fixture Album', artist: 'Fixture', kind: 'album', trackCount: 3 })
const LOST_ALBUM = Object.freeze({ id: 'album-lost', title: 'Lost Set', artist: 'Fixture', kind: 'album', trackCount: 3 })
const SKIPPY_ALBUM = Object.freeze({ id: 'album-skippy', title: 'Skippy Set', artist: 'Fixture', kind: 'album', trackCount: 3 })
const EMPTY_ALBUM = Object.freeze({ id: 'album-empty', title: 'Empty Set', artist: 'Fixture', kind: 'album', trackCount: 3 })
const BROKEN_ALBUM = Object.freeze({ id: 'album-broken', title: 'Broken Set', artist: 'Fixture', kind: 'album', trackCount: 3 })
const ALBUM_QUERIES = Object.freeze({ 'lost set': LOST_ALBUM, 'skippy set': SKIPPY_ALBUM, 'empty set': EMPTY_ALBUM, 'broken set': BROKEN_ALBUM })
const SECONDS = 20
const RATE = 48000
const WAV = wavOf({ seconds: SECONDS, rate: 8000, sample: i => Math.sin(2 * Math.PI * 220 * i / 8000) })
const NOISE_WAV = wavOf({ seconds: SECONDS, rate: RATE, sample: noiseSample })
const streamCalls = new Map()
let server = null
