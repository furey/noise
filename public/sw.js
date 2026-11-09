const CACHE = 'noise-v1'

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', event => {
  event.waitUntil(clearOldCaches().then(() => self.clients.claim()))
})

self.addEventListener('fetch', event => {
  const { request } = event
  if (request.method !== 'GET' || new URL(request.url).origin !== location.origin) return
  event.respondWith(request.mode === 'navigate' ? networkFirst(request) : cacheFirst(request))
})

const networkFirst = async request => {
  const cache = await caches.open(CACHE)
  try {
    const response = await fetch(request)
    if (response.ok) cache.put(request, response.clone())
    return response
  } catch {
    return (await cache.match(request)) ?? Response.error()
  }
}

const cacheFirst = async request => {
  const cache = await caches.open(CACHE)
  const cached = await cache.match(request)
  if (cached) return cached
  const response = await fetch(request)
  if (response.ok) cache.put(request, response.clone())
  return response
}

const clearOldCaches = async () => {
  const keys = await caches.keys()
  await Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))
}
