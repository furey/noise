import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { usableTrack } from './contract.mjs'

export const CACHE_LIMIT_BYTES = 2 * 1024 ** 3

export const createCache = ({ folder, download, limitBytes = CACHE_LIMIT_BYTES, now = Date.now }) => {
  const cache = { root: path.join(folder, 'cache'), download, limitBytes, now, storing: new Map(), queue: Promise.resolve() }
  return {
    find: id => find(cache, id),
    list: () => list(cache),
    touch: id => touch(cache, id),
    store: (track, { keep = [] } = {}) => store(cache, track, keep),
    evict: ({ keep = [] } = {}) => evict(cache, keep),
    clearStale: () => clearStale(cache),
    clear: ({ keep = [] } = {}) => clear(cache, keep),
    folder: () => cache.root,
  }
}

export const sizeText = bytes => {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`
  return `${Math.ceil(bytes / 1024)} KB`
}

const find = async (cache, id) => {
  const meta = await readMeta(cache, id)
  if (!meta) return null
  const file = audioFile(cache, id)
  return (await exists(file)) ? { file, mime: meta.mime, track: meta.track } : null
}

const list = async cache => {
  const names = await fs.readdir(cache.root).catch(() => [])
  const metas = await Promise.all(names.filter(isEntryName).map(name => readMeta(cache, name)))
  return metas.filter(Boolean).sort((a, b) => b.lastPlayed - a.lastPlayed)
    .map(({ track, lastPlayed, plays, bytes }) => ({ track, lastPlayed, plays, bytes }))
}

const touch = async (cache, id) => {
  const meta = await readMeta(cache, id)
  if (!meta) return
  await writeMeta(path.join(cache.root, id), { ...meta, lastPlayed: cache.now(), plays: meta.plays + 1 }).catch(() => {})
}

const store = (cache, input, keep) => {
  const track = usableTrack(input)
  if (!track) return Promise.resolve(null)
  if (!cache.storing.has(track.id)) {
    const job = cache.queue.then(() => storeNow(cache, track, keep)).finally(() => cache.storing.delete(track.id))
    cache.storing.set(track.id, job)
    cache.queue = job.catch(() => {})
  }
  return cache.storing.get(track.id)
}

const storeNow = async (cache, track, keep) => {
  if (await find(cache, track.id)) return find(cache, track.id)
  const temporary = path.join(cache.root, `${track.id}.${process.pid}.${crypto.randomBytes(4).toString('hex')}${TEMPORARY}`)
  await fs.mkdir(temporary, { recursive: true })
  try {
    const { mime } = await cache.download(track, { path: path.join(temporary, AUDIO) })
    const { size } = await fs.stat(path.join(temporary, AUDIO))
    await writeMeta(temporary, { track, mime, bytes: size, lastPlayed: cache.now(), plays: 1 })
    await fs.rename(temporary, path.join(cache.root, track.id)).catch(error => alreadyStored(error))
  } finally {
    await fs.rm(temporary, { recursive: true, force: true })
  }
  await evict(cache, [...keep, track.id])
  return find(cache, track.id)
}

const alreadyStored = error => {
  if (!['EEXIST', 'ENOTEMPTY', 'EPERM'].includes(error.code)) throw error
}

const evict = async (cache, keep) => {
  const entries = (await list(cache)).reverse()
  let total = entries.reduce((sum, { bytes }) => sum + bytes, 0)
  for (const { track, bytes } of entries) {
    if (total <= cache.limitBytes) break
    if (keep.includes(track.id)) continue
    await removeEntry(path.join(cache.root, track.id))
    total -= bytes
  }
}

const clear = async (cache, keep) => {
  const entries = (await list(cache)).filter(({ track }) => !keep.includes(track.id))
  await Promise.all(entries.map(({ track }) => removeEntry(path.join(cache.root, track.id))))
}

const removeEntry = entry => fs.rm(entry, { recursive: true, force: true, maxRetries: REMOVE_RETRIES }).catch(error => {
  if (!GONE_ELSEWHERE.includes(error.code)) throw error
})

const clearStale = async cache => {
  const names = await fs.readdir(cache.root).catch(() => [])
  await Promise.all(names.filter(name => name.endsWith(TEMPORARY)).map(async name => {
    const full = path.join(cache.root, name)
    const stat = await fs.stat(full).catch(() => null)
    if (stat && cache.now() - stat.mtimeMs > STALE_AFTER_MS) await fs.rm(full, { recursive: true, force: true })
  }))
}

const readMeta = async (cache, id) => {
  if (!isEntryName(id)) return null
  const raw = await fs.readFile(path.join(cache.root, id, META), 'utf8').catch(() => null)
  return raw ? usableMeta(raw) : null
}

const usableMeta = raw => {
  try {
    const meta = JSON.parse(raw)
    const track = usableTrack(meta.track)
    if (!track) return null
    return { track, mime: String(meta.mime ?? ''), bytes: Number(meta.bytes) || 0, lastPlayed: Number(meta.lastPlayed) || 0, plays: Number(meta.plays) || 0 }
  } catch {
    return null
  }
}

const writeMeta = async (entry, meta) => {
  const temporary = path.join(entry, `${META}.${process.pid}.${crypto.randomBytes(4).toString('hex')}`)
  await fs.writeFile(temporary, JSON.stringify(meta))
  await fs.rename(temporary, path.join(entry, META))
}

const audioFile = (cache, id) => path.join(cache.root, id, AUDIO)

const isEntryName = name => ENTRY_NAME.test(name)

const exists = file => fs.stat(file).then(() => true, () => false)

const AUDIO = 'audio'
const META = 'meta.json'
const TEMPORARY = '.tmp'
const ENTRY_NAME = /^[A-Za-z0-9_-]{1,64}$/
const STALE_AFTER_MS = 60 * 60 * 1000
const REMOVE_RETRIES = 3
const GONE_ELSEWHERE = ['ENOENT', 'EPERM', 'EBUSY', 'ENOTEMPTY']
