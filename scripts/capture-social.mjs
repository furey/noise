import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { parseArgs } from 'node:util'
import {
  FPS, appRoot, desktopFrame, ensureDir, ffmpeg, frameSvg, launchBrowser, mediaDir, openApp, renderSvg, stepApp,
} from './demo-stage.mjs'

const { values } = parseArgs({
  options: {
    url: { type: 'string', default: 'http://localhost:4173/' },
    out: { type: 'string', default: path.join(mediaDir, 'social.png') },
  },
})

const WIDTH = 1280
const HEIGHT = 640
const ICON = { x: 96, y: 176, size: 288 }
const WINDOW = { x: 456, y: 66, bar: 32, viewport: { width: 760, height: 476 } }
const SETTLE_S = 2.4

const main = async () => {
  const work = await fs.mkdtemp(path.join(os.tmpdir(), 'noise-social-'))
  const browser = await launchBrowser()
  try {
    const shapes = [desktopFrame({ x: WINDOW.x, y: WINDOW.y, w: WINDOW.viewport.width, h: WINDOW.viewport.height + WINDOW.bar, bar: WINDOW.bar })]
    await renderSvg({ browser, svg: frameSvg({ width: WIDTH, height: HEIGHT, shapes }), width: WIDTH, height: HEIGHT, out: path.join(work, 'frame.png') })
    const icon = await fs.readFile(path.join(appRoot, 'build', 'icon-source', 'icon.svg'), 'utf8')
    const sized = icon.replace('width="1024" height="1024"', `width="${ICON.size}" height="${ICON.size}"`)
    await renderSvg({ browser, svg: sized, width: ICON.size, height: ICON.size, out: path.join(work, 'icon.png') })
    await captureApp({ browser, out: path.join(work, 'app.png') })
  } finally {
    await browser.close()
  }
  await ensureDir(path.dirname(values.out))
  await ffmpeg([
    '-i', path.join(work, 'frame.png'), '-i', path.join(work, 'app.png'), '-i', path.join(work, 'icon.png'),
    '-filter_complex', `[1:v]pad=${WIDTH}:${HEIGHT}:${WINDOW.x}:${WINDOW.y + WINDOW.bar}[a];[a][0:v]overlay=0:0[b];[b][2:v]overlay=${ICON.x}:${ICON.y},format=rgb24`,
    '-frames:v', '1', values.out,
  ])
  await fs.rm(work, { recursive: true })
  console.log(`social.png written: ${values.out}`)
}

const captureApp = async ({ browser, out }) => {
  const { context, page } = await openApp({
    browser, url: values.url, viewport: WINDOW.viewport, dpr: 1, settings: { pos: 4, volume: 0.85 },
  })
  await page.mouse.click(WINDOW.viewport.width / 2, WINDOW.viewport.height / 3)
  for (let t = 0; t < SETTLE_S * FPS; t++) await stepApp(page, { dt: 1000 / FPS, pointer: null })
  await page.screenshot({ path: out })
  await context.close()
}

await main()
