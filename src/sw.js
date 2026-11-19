const CACHE = 'noise-dev'
const PRECACHE = []

self.addEventListener('install', event => {
  event.waitUntil(precache().then(() => self.skipWaiting()))
})

self.addEventListener('activate', event => {
  event.waitUntil(clearOldCaches().then(() => self.clients.claim()))
})

self.addEventListener('fetch', event => {
  const { request } = event
  if (request.method !== 'GET' || new URL(request.url).origin !== location.origin) return
  event.respondWith(request.mode === 'navigate' ? networkFirst(request) : cacheFirst(request))
})

const precache = async () => {
  const cache = await caches.open(CACHE)
  await cache.addAll(PRECACHE.map(url => new Request(url, { cache: 'reload' })))
}

const networkFirst = async request => {
  const cache = await caches.open(CACHE)
  try {
    const response = await fetch(request)
    if (isCacheable(response)) keep({ cache, request, response })
    return response
  } catch {
    return (await cache.match(request, { ignoreSearch: true })) ?? (await cache.match('./')) ?? Response.error()
  }
}

const cacheFirst = async request => {
  const cache = await caches.open(CACHE)
  const cached = await cache.match(request)
  if (cached) return cached
  const response = await fetch(request)
  if (isCacheable(response)) keep({ cache, request, response })
  return response
}

const isCacheable = response => response.status === 200 && response.type === 'basic'

const keep = ({ cache, request, response }) => cache.put(request, response.clone()).catch(() => {})

const clearOldCaches = async () => {
  const keys = await caches.keys()
  await Promise.all(keys.filter(key => key.startsWith('noise-') && key !== CACHE).map(key => caches.delete(key)))
}
