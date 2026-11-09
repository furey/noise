import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync, inflateSync } from 'node:zlib'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCES = join(ROOT, 'build', 'icon-source')
const MASTER = join(SOURCES, 'icon.svg')
const FAVICON = join(SOURCES, 'favicon.svg')
const MASKABLE = join(SOURCES, 'icon-maskable.svg')
const TOUCH = join(SOURCES, 'icon-touch.svg')
const SMALL_ICON_MAX = 32
const LINUX_SIZES = [16, 32, 48, 64, 128, 256, 512]
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]
const ICONSET_SIZES = [16, 32, 128, 256, 512]
const APPLE_TOUCH_SIZE = 180
const APPLE_TOUCH_BACKGROUND = '#050505'

const main = () => {
  makeMac()
  makeWindows()
  makeLinux()
  makeWeb()
  console.log(`Icons written under ${ROOT}`)
}

const makeMac = () => {
  render({ source: MASTER, size: 1024, out: join(ROOT, 'build/icon.png') })
  const iconset = join(ROOT, 'build/icon.iconset')
  rmSync(iconset, { recursive: true, force: true })
  mkdirSync(iconset, { recursive: true })
  ICONSET_SIZES.forEach(size => {
    render({ source: MASTER, size, out: join(iconset, `icon_${size}x${size}.png`) })
    render({ source: MASTER, size: size * 2, out: join(iconset, `icon_${size}x${size}@2x.png`) })
  })
  execFileSync('iconutil', ['-c', 'icns', iconset, '-o', join(ROOT, 'build/icon.icns')])
  rmSync(iconset, { recursive: true, force: true })
}

const makeWindows = () => {
  const images = ICO_SIZES.map(size => ({ size, png: renderToBuffer({ source: sourceFor(size), size }) }))
  writeFileSync(join(ROOT, 'build/icon.ico'), encodeIco(images))
}

const makeLinux = () =>
  LINUX_SIZES.forEach(size =>
    render({ source: sourceFor(size), size, out: join(ROOT, `build/icons/${size}x${size}.png`) }))

const makeWeb = () => {
  const web = join(ROOT, 'public/icons')
  mkdirSync(web, { recursive: true })
  copyFileSync(FAVICON, join(web, 'favicon.svg'))
  render({ source: MASTER, size: 192, out: join(web, 'icon-192.png') })
  render({ source: MASTER, size: 512, out: join(web, 'icon-512.png') })
  render({ source: MASKABLE, size: 512, out: join(web, 'icon-maskable-512.png') })
  const touch = renderToBuffer({
    source: TOUCH,
    size: APPLE_TOUCH_SIZE,
    background: APPLE_TOUCH_BACKGROUND,
  })
  writeFileSync(join(web, 'apple-touch-icon.png'), dropAlpha(touch))
}

const sourceFor = size => size <= SMALL_ICON_MAX ? FAVICON : MASTER

const render = ({ source, size, out }) => {
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, renderToBuffer({ source, size }))
}

const renderToBuffer = ({ source, size, background }) => {
  const backgroundArgs = background ? ['-b', background] : []
  return execFileSync('rsvg-convert', ['-w', `${size}`, '-h', `${size}`, ...backgroundArgs, source])
}

const encodeIco = images => {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)
  const directorySize = 16 * images.length
  const offsets = images.reduce(
    (list, { png }) => [...list, list.at(-1) + png.length],
    [header.length + directorySize],
  )
  const entries = images.map(({ size, png }, i) => icoEntry({ size, length: png.length, offset: offsets[i] }))
  return Buffer.concat([header, ...entries, ...images.map(({ png }) => png)])
}

const icoEntry = ({ size, length, offset }) => {
  const entry = Buffer.alloc(16)
  entry.writeUInt8(size >= 256 ? 0 : size, 0)
  entry.writeUInt8(size >= 256 ? 0 : size, 1)
  entry.writeUInt8(0, 2)
  entry.writeUInt8(0, 3)
  entry.writeUInt16LE(1, 4)
  entry.writeUInt16LE(32, 6)
  entry.writeUInt32LE(length, 8)
  entry.writeUInt32LE(offset, 12)
  return entry
}

const dropAlpha = png => {
  const chunks = readChunks(png)
  const ihdr = chunks.find(({ type }) => type === 'IHDR').data
  const width = ihdr.readUInt32BE(0)
  const height = ihdr.readUInt32BE(4)
  const isRgba8 = ihdr[8] === 8 && ihdr[9] === 6
  if (!isRgba8) return png
  const idat = Buffer.concat(chunks.filter(({ type }) => type === 'IDAT').map(({ data }) => data))
  const rgba = unfilter({ data: inflateSync(idat), width, height, channels: 4 })
  const rgb = Buffer.alloc(height * (1 + width * 3))
  Array.from({ length: height }, (_, y) => {
    const rowStart = y * (1 + width * 3)
    rgb[rowStart] = 0
    Array.from({ length: width }, (_, x) => {
      const source = (y * width + x) * 4
      rgba.copy(rgb, rowStart + 1 + x * 3, source, source + 3)
    })
  })
  const newIhdr = Buffer.from(ihdr)
  newIhdr[9] = 2
  return Buffer.concat([
    png.subarray(0, 8),
    pngChunk('IHDR', newIhdr),
    pngChunk('IDAT', deflateSync(rgb, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

const readChunks = png => {
  const chunks = []
  let offset = 8
  while (offset < png.length) {
    const length = png.readUInt32BE(offset)
    const type = png.toString('ascii', offset + 4, offset + 8)
    chunks.push({ type, data: png.subarray(offset + 8, offset + 8 + length) })
    offset += length + 12
  }
  return chunks
}

const unfilter = ({ data, width, height, channels }) => {
  const stride = width * channels
  const out = Buffer.alloc(height * stride)
  Array.from({ length: height }, (_, y) => {
    const filter = data[y * (stride + 1)]
    const line = data.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    const row = y * stride
    Array.from({ length: stride }, (_, i) => {
      const left = i >= channels ? out[row + i - channels] : 0
      const up = y > 0 ? out[row - stride + i] : 0
      const upLeft = y > 0 && i >= channels ? out[row - stride + i - channels] : 0
      out[row + i] = (line[i] + predict({ filter, left, up, upLeft })) & 0xff
    })
  })
  return out
}

const predict = ({ filter, left, up, upLeft }) => {
  if (filter === 1) return left
  if (filter === 2) return up
  if (filter === 3) return (left + up) >> 1
  if (filter === 4) return paeth({ left, up, upLeft })
  return 0
}

const paeth = ({ left, up, upLeft }) => {
  const estimate = left + up - upLeft
  const distances = [left, up, upLeft].map(value => Math.abs(estimate - value))
  if (distances[0] <= distances[1] && distances[0] <= distances[2]) return left
  return distances[1] <= distances[2] ? up : upLeft
}

const pngChunk = (type, data) => {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) =>
  Array.from({ length: 8 }).reduce(c => (c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1), n) >>> 0)

const crc32 = buffer =>
  (buffer.reduce((crc, byte) => CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8), 0xffffffff) ^ 0xffffffff) >>> 0

main()
