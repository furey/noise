import { writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { COLOURS } from '../src/ui/colours.js'
import { WAVE_BARS, WAVE_PERIOD_MS, columnLagMs, waveColour, waveLevel, waveStep } from '../src/help/wave.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'docs/wave')
const COLUMNS = 56
const CELL_WIDTH = 15
const HEIGHT = 38
const KEYFRAMES = 96
const LIGHT_COLOURS = { brown: '#b7791f', pink: '#d53f8c', white: '#94a3b8', blue: '#2563eb', violet: '#7c3aed' }
const THEMES = {
  dark: Object.fromEntries(COLOURS.map(({ id, hex }) => [id, hex])),
  light: LIGHT_COLOURS,
}

const main = () => {
  for (const [theme, colours] of Object.entries(THEMES)) {
    writeFileSync(join(OUT, `wave-${theme}.svg`), waveSvg(colours))
  }
  console.log(`Wave pictures written to ${OUT}`)
}

const waveSvg = colours => {
  const width = COLUMNS * CELL_WIDTH
  const style = [
    `rect{transform-box:fill-box;transform-origin:50% 100%;animation:wave ${WAVE_PERIOD_MS}ms step-end infinite}`,
    `@keyframes wave{${keyframes(colours)}}`,
    '@media (prefers-reduced-motion:reduce){rect{animation-play-state:paused}}',
  ].join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${HEIGHT}" viewBox="0 0 ${width} ${HEIGHT}" role="img" aria-label="A wave of noise colours moving from brown to violet and back"><style>${style}</style>${columns()}</svg>\n`
}

const keyframes = colours => Array.from({ length: KEYFRAMES + 1 }, (_, frame) => {
  const level = waveLevel({ column: 0, phase: (frame / KEYFRAMES) * 2 * Math.PI })
  const height = (waveStep(level) + 1) / WAVE_BARS.length
  return `${round(frame / KEYFRAMES * 100)}%{transform:scaleY(${round(height)});fill:${colours[waveColour(level).id]}}`
}).join('')

const columns = () => Array.from({ length: COLUMNS }, (_, column) => {
  const delay = round((columnLagMs(column) % WAVE_PERIOD_MS) - WAVE_PERIOD_MS)
  return `<rect x="${column * CELL_WIDTH}" width="${CELL_WIDTH}" height="${HEIGHT}" style="animation-delay:${delay}ms"/>`
}).join('')

const round = value => Number(value.toFixed(3))

main()
