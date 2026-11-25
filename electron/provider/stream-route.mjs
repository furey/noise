import crypto from 'node:crypto'
import fs from 'node:fs'
import { Readable } from 'node:stream'

export const STREAM_PREFIX = '/stream/'

export const byteRange = (header, size) => {
  if (!header) return { start: 0, end: size - 1, partial: false }
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!match || (!match[1] && !match[2])) return null
  const suffix = !match[1]
  const start = suffix ? Math.max(0, size - Number(match[2])) : Number(match[1])
  const end = suffix || !match[2] ? size - 1 : Math.min(Number(match[2]), size - 1)
  return start <= end && start < size ? { start, end, partial: true } : null
}

export const createStreamRoute = ({ resolveSource, fetchSource, limit = ROUTE_LIMIT }) => {
  const route = { entries: new Map(), resolveSource, fetchSource, limit }
  return {
    add: ({ track, source = null, file = null, mime = '' }) => add(route, { track, source, file, mime }),
    handles: url => pathOf(url).startsWith(STREAM_PREFIX),
    serve: request => serve(route, request).catch(() => failure(502)),
  }
}

const add = (route, entry) => {
  const token = crypto.randomBytes(TOKEN_BYTES).toString('hex')
  route.entries.set(token, entry)
  if (route.entries.size > route.limit) route.entries.delete(route.entries.keys().next().value)
  return `${STREAM_PREFIX}${token}`
}

const serve = async (route, request) => {
  const entry = route.entries.get(pathOf(request.url).slice(STREAM_PREFIX.length))
  if (!entry) return failure(404)
  const range = request.headers.get('range')
  if (entry.file) {
    const local = await serveFile(entry, range)
    if (local) return local
    entry.file = null
  }
  entry.source ??= await route.resolveSource(entry.track)
  const first = await fetchFrom(route, { entry, range, signal: request.signal })
  if (first.response.status !== 403) return relay(first, entry)
  first.stop.abort()
  entry.source = await route.resolveSource(entry.track)
  return relay(await fetchFrom(route, { entry, range, signal: request.signal }), entry)
}

const fetchFrom = async (route, { entry, range, signal }) => {
  if (isExpiring(entry.source)) entry.source = await route.resolveSource(entry.track)
  const headers = { ...entry.source.headers, ...(range ? { Range: range } : {}) }
  const stop = new AbortController()
  const signals = [signal, stop.signal].filter(Boolean)
  const response = await route.fetchSource(entry.source.url, { headers, signal: AbortSignal.any(signals) })
  return { response, stop }
}

const isExpiring = ({ expiresAt }) => expiresAt > 0 && Date.now() > expiresAt - EXPIRY_MARGIN_MS

const relay = ({ response: upstream, stop }, { source }) => {
  if (!upstream.ok) {
    stop.abort()
    return failure(upstream.status === 416 ? 416 : 502)
  }
  const headers = { 'content-type': source.mime || upstream.headers.get('content-type') || 'application/octet-stream', 'accept-ranges': 'bytes' }
  RELAYED_HEADERS.forEach(name => {
    const value = upstream.headers.get(name)
    if (value) headers[name] = value
  })
  return new Response(stoppable(upstream.body, stop), { status: upstream.status, headers })
}

const stoppable = (body, stop) => {
  if (!body) return null
  const reader = body.getReader()
  return new ReadableStream({
    pull: async controller => {
      const { done, value } = await reader.read()
      if (done) return controller.close()
      controller.enqueue(value)
    },
    cancel: reason => {
      stop.abort()
      reader.cancel(reason).catch(() => {})
    },
  })
}

const serveFile = async ({ file, mime }, header) => {
  const stat = await fs.promises.stat(file).catch(() => null)
  if (!stat) return null
  const range = byteRange(header, stat.size)
  if (!range) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${stat.size}` } })
  const body = Readable.toWeb(fs.createReadStream(file, { start: range.start, end: range.end }))
  const headers = { 'content-type': mime || 'application/octet-stream', 'accept-ranges': 'bytes', 'content-length': String(range.end - range.start + 1) }
  if (range.partial) headers['content-range'] = `bytes ${range.start}-${range.end}/${stat.size}`
  return new Response(body, { status: range.partial ? 206 : 200, headers })
}

const pathOf = url => {
  try {
    return new URL(url).pathname
  } catch {
    return ''
  }
}

const failure = status => new Response(null, { status })

const RELAYED_HEADERS = ['content-length', 'content-range']
const ROUTE_LIMIT = 20
const TOKEN_BYTES = 16
const EXPIRY_MARGIN_MS = 60000
