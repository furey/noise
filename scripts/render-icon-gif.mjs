import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { appRoot, ensureDir, ffmpeg, launchBrowser, mediaDir } from './demo-stage.mjs'

const { values } = parseArgs({
  options: {
    out: { type: 'string', default: mediaDir },
    size: { type: 'string', default: '256' },
    fps: { type: 'string', default: '10' },
  },
})

const ORIGIN = 181
const PITCH = 84
const CELL = 74
const BAR_COLUMNS = [3, 4]
const BASE_ROW = 6
const HEIGHTS = [
  [2, 3, 3, 2, 1, 2, 3, 3, 2, 1, 1, 2, 3, 2, 2, 2],
  [1, 1, 2, 3, 3, 2, 1, 1, 2, 3, 2, 1, 1, 2, 2, 1],
]
const PARTICLES = [
  { frame: 0, col: 4, row: 5 },
  { frame: 2, col: 3, row: 3 },
  { frame: 5, col: 4, row: 2 },
  { frame: 7, col: 3, row: 3 },
  { frame: 10, col: 4, row: 2 },
  { frame: 13, col: 3, row: 3 },
]
const PARTICLE_ALPHAS = [0.55, 0.35, 0.18]
const PULSE_STEP = 0.09

const main = async () => {
  const source = await fs.readFile(path.join(appRoot, 'build', 'icon-source', 'icon.svg'), 'utf8')
  const icon = parseIcon(source)
  const svgs = HEIGHTS[0].map((_, frame) => frameSvg({ icon, frame }))
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
  const at = (col, row) => cells.find(cell => cell.col === col && cell.row === row)
  return { cells, head, at }
}

const frameSvg = ({ icon, frame }) => {
  const centre = centreCells({ icon, frame })
  const pulse = PULSE_STEP * Math.max(0, HEIGHTS[0][frame] + HEIGHTS[1][frame] - 3)
  const cells = icon.cells.map(cell => {
    const replaced = centre.get(`${cell.col}:${cell.row}`)
    if (replaced) return replaced
    if (isCup(cell)) return { ...cell, fill: mixWhite(cell.fill, pulse) }
    if (isCentre(cell)) return ghost(cell)
    return cell
  })
  return `${icon.head}${cells.map(rect).join('')}</svg>`
}

const centreCells = ({ icon, frame }) => {
  const cells = new Map()
  BAR_COLUMNS.forEach((col, index) => {
    const height = HEIGHTS[index][frame]
    const base = icon.at(BAR_COLUMNS[0], BASE_ROW)
    for (let k = 0; k < height; k++) {
      const row = BASE_ROW - k
      const fill = k === height - 1 ? '#ffffff' : base.fill
      cells.set(`${col}:${row}`, { col, row, fill, opacity: 1 })
    }
  })
  PARTICLES.forEach(particle => {
    const age = (frame - particle.frame + HEIGHTS[0].length) % HEIGHTS[0].length
    if (age >= PARTICLE_ALPHAS.length) return
    const row = particle.row - age
    const key = `${particle.col}:${row}`
    if (cells.has(key) || row < 2) return
    cells.set(key, { col: particle.col, row, fill: icon.at(4, 5).fill, opacity: PARTICLE_ALPHAS[age] })
  })
  return cells
}

const isCup = cell => cell.opacity === 1 && cell.fill !== '#ffffff' && (cell.col <= 1 || cell.col >= 6)

const isCentre = cell => cell.col >= 2 && cell.col <= 5 && cell.row >= 2

const ghost = cell => ({ ...cell, fill: '#ffffff', opacity: 0.06 })

const rect = ({ col, row, fill, opacity }) => {
  const alpha = opacity === 1 ? '' : ` fill-opacity="${opacity}"`
  return `<rect x="${ORIGIN + col * PITCH}" y="${ORIGIN + row * PITCH}" width="${CELL}" height="${CELL}" fill="${fill}"${alpha}/>`
}

const mixWhite = (hex, amount) => {
  const channels = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))
  return `#${channels.map(value => Math.round(value + (255 - value) * amount).toString(16).padStart(2, '0')).join('')}`
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
