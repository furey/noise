import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { appRoot, ensureDir, ffmpeg, launchBrowser, mediaDir } from './demo-stage.mjs'

const { values } = parseArgs({
  options: {
    out: { type: 'string', default: mediaDir },
    size: { type: 'string', default: '256' },
    fps: { type: 'string', default: '12' },
  },
})

const ORIGIN = 181
const PITCH = 84
const CELL = 74
const FRAMES = 24
const GLOWS = [
  { col: 3, row: 5, bright: '#f2b8cf', phase: 0 },
  { col: 4, row: 6, bright: '#c9b8f5', phase: 0.04 },
  { col: 4, row: 5, bright: '#b9c8f5', phase: 0.5 },
  { col: 3, row: 6, bright: '#f0c9a0', phase: 0.54 },
]

const main = async () => {
  const source = await fs.readFile(path.join(appRoot, 'build', 'icon-source', 'icon.svg'), 'utf8')
  const icon = parseIcon(source)
  const svgs = Array.from({ length: FRAMES }, (_, frame) => frameSvg({ icon, frame }))
  const work = await fs.mkdtemp(path.join(os.tmpdir(), 'noise-icon-gif-'))
  await renderFrames({ svgs, size: Number(values.size), dir: work })
  await ensureDir(values.out)
  await encodeGif({ dir: work, fps: values.fps, out: path.join(values.out, 'app-icon.gif') })
  await ffmpeg(['-i', path.join(appRoot, 'build', 'icon.png'), '-vf', 'scale=512:512:flags=area', path.join(values.out, 'app-icon.png')])
  await fs.rm(work, { recursive: true })
  console.log(`app-icon.gif: ${svgs.length} frames at ${values.fps} fps; app-icon.png written`)
}

const parseIcon = source => {
  const cells = [...source.matchAll(/<rect x="(\d+)" y="(\d+)" width="74" height="74" fill="(#[0-9a-f]{6})"(?: fill-opacity="([\d.]+)")?\/>/g)]
    .map(([, x, y, fill, opacity]) => ({ col: (x - ORIGIN) / PITCH, row: (y - ORIGIN) / PITCH, fill, opacity: Number(opacity ?? 1) }))
  const head = source.slice(0, source.indexOf('<rect x="181"'))
  return { cells, head }
}

const frameSvg = ({ icon, frame }) => {
  const cells = icon.cells.map(cell => {
    const glow = GLOWS.find(each => each.col === cell.col && each.row === cell.row)
    return glow ? { ...cell, fill: mixHex(cell.fill, glow.bright, glowAt(glow, frame)) } : cell
  })
  return `${icon.head}${cells.map(rect).join('')}</svg>`
}

const glowAt = ({ phase }, frame) => Math.max(0, Math.sin((frame / FRAMES + phase) * Math.PI * 2)) ** 1.5

const rect = ({ col, row, fill, opacity }) => {
  const alpha = opacity === 1 ? '' : ` fill-opacity="${opacity}"`
  return `<rect x="${ORIGIN + col * PITCH}" y="${ORIGIN + row * PITCH}" width="${CELL}" height="${CELL}" fill="${fill}"${alpha}/>`
}

const mixHex = (from, to, amount) => {
  const channels = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))
  const [a, b] = [channels(from), channels(to)]
  return `#${a.map((value, i) => Math.round(value + (b[i] - value) * amount).toString(16).padStart(2, '0')).join('')}`
}

const renderFrames = async ({ svgs, size, dir }) => {
  const browser = await launchBrowser()
  try {
    const page = await browser.newPage({ viewport: { width: size, height: size } })
    for (const [index, svg] of svgs.entries()) {
      const sized = svg.replace('width="1024" height="1024"', `width="${size}" height="${size}"`)
      await page.setContent(`<!doctype html><style>html,body{margin:0;background:transparent}svg{display:block}</style>${sized}`)
      await page.screenshot({ path: path.join(dir, `f${String(index).padStart(3, '0')}.png`), omitBackground: true })
    }
  } finally {
    await browser.close()
  }
}

const encodeGif = async ({ dir, fps, out }) => {
  const input = ['-framerate', fps, '-i', path.join(dir, 'f%03d.png')]
  const palette = path.join(dir, 'palette.png')
  await ffmpeg([...input, '-vf', 'palettegen=reserve_transparent=1:stats_mode=full', palette])
  await ffmpeg([...input, '-i', palette, '-lavfi', 'paletteuse=dither=none:alpha_threshold=128', '-loop', '0', out])
}

await main()
