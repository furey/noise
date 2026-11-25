import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { appRoot, ensureDir, ffmpeg, launchBrowser, mediaDir } from './demo-stage.mjs'

const { values } = parseArgs({
  options: {
    out: { type: 'string', default: mediaDir },
    size: { type: 'string', default: '256' },
    fps: { type: 'string', default: '25' },
  },
})

const FRAMES = 60
const GHOST_FADE = [[0, 0.15], [0.5, 0.75], [1, 1]]
const GHOSTS = [{ lag: 0.84, opacity: 0.17, thin: 0.3 }, { lag: 0.42, opacity: 0.35, thin: 0.15 }]
const TAU = Math.PI * 2
const WAVE = /<g transform="translate\(512 512\)"><polyline points="([^"]+)"[^>]*stroke-width="([\d.]+)"[^>]*\/><\/g>/
const PLATE = '<clipPath id="plate"><rect x="100" y="100" width="824" height="824" rx="184"/></clipPath>'

const main = async () => {
  const source = await fs.readFile(path.join(appRoot, 'build', 'icon-source', 'icon.svg'), 'utf8')
  const svgs = Array.from({ length: FRAMES }, (_, frame) => frameSvg({ source, frame }))
  const work = await fs.mkdtemp(path.join(os.tmpdir(), 'noise-icon-gif-'))
  await renderFrames({ svgs, size: Number(values.size), dir: work })
  await ensureDir(values.out)
  await encodeGif({ dir: work, fps: values.fps, out: path.join(values.out, 'app-icon.gif') })
  await ffmpeg(['-i', path.join(appRoot, 'build', 'icon.png'), '-vf', 'scale=512:512:flags=area', path.join(values.out, 'app-icon.png')])
  await fs.rm(work, { recursive: true })
  console.log(`app-icon.gif: ${svgs.length} frames at ${values.fps} fps; app-icon.png written`)
}

const frameSvg = ({ source, frame }) => {
  const wave = readWave(source)
  const layers = waveLayers({ wave, progress: frame / FRAMES })
  return source
    .replace('</defs>', `${PLATE}${ghostMask(readWave(source))}</defs>`)
    .replace(WAVE, `<g clip-path="url(#plate)"><g transform="translate(512 512)">${layers.body}</g></g>`)
}

const readWave = source => {
  const [, points, width] = source.match(WAVE)
  const pairs = points.split(' ').map(pair => pair.split(',').map(Number))
  const xs = pairs.map(([x]) => x)
  return {
    left: Math.min(...xs),
    right: Math.max(...xs),
    amplitude: Math.max(...pairs.map(([, y]) => Math.abs(y))),
    width: Number(width),
    samples: pairs.length,
  }
}

const waveLayers = ({ wave, progress }) => ({
  body: [
    `<g mask="url(#ghostfade)">${GHOSTS.map(({ lag, opacity, thin }) => stroke({ points: wavePoints({ wave, phase: TAU * progress - lag }), width: wave.width * (1 - thin), opacity })).join('')}</g>`,
    stroke({ points: wavePoints({ wave, phase: TAU * progress }), width: wave.width }),
  ].join(''),
})

const wavePoints = ({ wave, phase }) => Array.from({ length: wave.samples }, (_, index) => {
  const along = index / (wave.samples - 1)
  const x = wave.left + along * (wave.right - wave.left)
  const y = -wave.amplitude * Math.sin(TAU * along - phase)
  return [round(x), round(y)]
})

const stroke = ({ points, width, opacity = 1 }) =>
  `<polyline points="${points.map(point => point.join(',')).join(' ')}" fill="none" stroke="url(#wg)" stroke-width="${round(width)}" stroke-linecap="round" stroke-linejoin="round" opacity="${opacity}"/>`

const ghostMask = wave => {
  const stops = GHOST_FADE.map(([offset, alpha]) => `<stop offset="${offset}" stop-color="#fff" stop-opacity="${alpha}"/>`).join('')
  const ramp = `<linearGradient id="ghostramp" gradientUnits="userSpaceOnUse" x1="${wave.left - wave.width}" y1="0" x2="${wave.right + wave.width}" y2="0">${stops}</linearGradient>`
  const cover = '<rect x="-512" y="-512" width="1024" height="1024" fill="url(#ghostramp)"/>'
  return `${ramp}<mask id="ghostfade" maskUnits="userSpaceOnUse" x="-512" y="-512" width="1024" height="1024">${cover}</mask>`
}

const round = value => Math.round(value * 100) / 100

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
  await ffmpeg([...input, '-i', palette, '-lavfi', `paletteuse=dither=sierra2_4a:alpha_threshold=128`, '-loop', '0', out])
}

await main()
