import path from 'node:path'
import { parseArgs } from 'node:util'
import { FPS, appRoot, ensureDir, launchBrowser, openApp, stepApp } from './demo-stage.mjs'

const { values } = parseArgs({
  options: {
    url: { type: 'string', default: 'http://localhost:4173/' },
    out: { type: 'string', default: path.join(appRoot, 'docs', 'controls') },
    only: { type: 'string' },
  },
})

const PAD = 8
const url = values.url
const out = values.out
const only = values.only
const allShots = [
  { name: 'wave-off', settings: {}, target: 'wave' },
  { name: 'wave-on', settings: { wave: true }, target: 'wave' },
  { name: 'music-off', settings: {}, target: 'music' },
  { name: 'music-liquid-alone', settings: { music: 'alone', piece: 'liquid' }, target: 'music' },
  { name: 'music-liquid-noise', settings: { music: 'over', piece: 'liquid' }, target: 'music' },
  { name: 'music-helix-alone', settings: { music: 'alone', piece: 'helix' }, target: 'music' },
  { name: 'music-helix-noise', settings: { music: 'over', piece: 'helix' }, target: 'music' },
  { name: 'timer-off', settings: {}, target: 'timer', taps: 0 },
  { name: 'timer-30', settings: {}, target: 'timer', taps: 1 },
  { name: 'timer-20', settings: {}, target: 'timer', taps: 2 },
  { name: 'timer-10', settings: {}, target: 'timer', taps: 3 },
]
const shots = only ? allShots.filter(shot => shot.name === only) : allShots
await ensureDir(out)
const browser = await launchBrowser()
for (const shot of shots) {
  const { context, page } = await openApp({ browser, url, viewport: { width: 390, height: 844 }, dpr: 3, settings: { pos: 0, volume: 0.35, ...shot.settings }, touch: true })
  const run = async frames => { for (let t = 0; t < frames; t++) await stepApp(page, { dt: 1000 / FPS, pointer: null }) }
  await run(2 * FPS)
  for (let i = 0; i < (shot.taps ?? 0); i++) {
    const at = await page.evaluate(() => { const r = globalThis.document.getElementById('timer').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2] })
    await page.mouse.click(...at)
    await run(FPS / 2)
  }
  const box = await page.evaluate(id => { const r = globalThis.document.getElementById(id).getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height } }, shot.target)
  const clip = { x: box.x - PAD, y: box.y - PAD, width: box.width + PAD * 2, height: box.height + PAD * 2 }
  await page.screenshot({ path: path.join(out, `${shot.name}.png`), clip })
  await context.close()
}
await browser.close()
