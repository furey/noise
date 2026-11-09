import fs from 'node:fs/promises'
import path from 'node:path'

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

export const APP_SCHEME = 'app'
export const APP_HOST = 'noise'
export const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`

export const isAppUrl = url => {
  try {
    const parsed = new URL(url)
    return parsed.protocol === `${APP_SCHEME}:` && parsed.host === APP_HOST
  } catch {
    return false
  }
}

export const resolveAppFile = ({ root, url }) => {
  if (!isAppUrl(url)) return null
  const pathname = decodePathname(new URL(url).pathname)
  if (pathname === null || pathname.includes('\0')) return null
  const relative = path.normalize(pathname.replace(/^\/+/, '') || 'index.html')
  const filePath = path.resolve(root, relative)
  return isInside({ root, filePath }) ? filePath : null
}

export const serveAppFile = async ({ root, url }) => {
  const filePath = resolveAppFile({ root, url })
  if (!filePath) return notFound()
  const body = await fs.readFile(filePath).catch(() => null)
  if (!body) return notFound()
  return new Response(body, { headers: { 'content-type': mimeTypeOf(filePath) } })
}

export const mimeTypeOf = filePath =>
  MIME_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream'

const isInside = ({ root, filePath }) => {
  const relative = path.relative(path.resolve(root), filePath)
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)
}

const decodePathname = pathname => {
  try {
    return decodeURIComponent(pathname)
  } catch {
    return null
  }
}

const notFound = () => new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain' } })
