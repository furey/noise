import { addHarness } from './demo-stage.mjs'

const SCENE_PATH = '__scene'
const MENU_BAR_PX = 28
const LIGHTS = { top: 13, left: 13, size: 12, gap: 8 }

export const openMacScene = async ({ browser, url, scene, dpr, window, settings }) => {
  const context = await browser.newContext({ viewport: scene, deviceScaleFactor: dpr, bypassCSP: true, serviceWorkers: 'block' })
  await addHarness({ context, settings, mac: true })
  const page = await context.newPage()
  const sceneUrl = new URL(SCENE_PATH, url).href
  await page.route(sceneUrl, route => route.fulfill({ contentType: 'text/html', body: sceneHtml({ appUrl: url, window }) }))
  await page.goto(sceneUrl)
  const app = await appFrame(page, url)
  await app.waitForFunction(() => globalThis.document.getElementById('spec')?.width > 0)
  await app.evaluate(() => globalThis.demo.step(0, null))
  return { context, page, app }
}

export const setWindow = (page, { x, y, w, h }) => page.evaluate(([left, top, width, height]) => {
  const frame = globalThis.document.getElementById('window').style
  Object.assign(frame, { left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px` })
}, [x, y, w, h])

export const drawCursor = (page, look) => page.evaluate(([state]) => {
  const { document } = globalThis
  const arrow = document.getElementById('arrow').style
  const resize = document.getElementById('resize').style
  const ring = document.getElementById('ring').style
  arrow.opacity = state && state.kind === 'arrow' ? '1' : '0'
  resize.opacity = state && state.kind === 'resize' ? '1' : '0'
  ring.opacity = state ? String(state.ringAlpha) : '0'
  if (!state) return
  const press = state.down ? 'scale(.9)' : ''
  arrow.transform = `translate(${state.x}px,${state.y}px) ${press}`
  resize.transform = `translate(${state.x - 11}px,${state.y - 11}px)`
  ring.width = ring.height = `${state.ringSize}px`
  ring.transform = `translate(${state.x - state.ringSize / 2}px,${state.y - state.ringSize / 2}px)`
}, [look])

const appFrame = async (page, url) => {
  for (;;) {
    const frame = page.frames().find(each => each.url() === url)
    if (frame) return frame
    await page.waitForTimeout(50)
  }
}

const sceneHtml = ({ appUrl, window: { x, y, w, h } }) => `<!doctype html><meta charset="utf-8"><style>
html, body { margin: 0; height: 100%; overflow: hidden }
body {
  background:
    radial-gradient(70% 70% at 25% 85%, rgba(255, 180, 122, .45), transparent),
    linear-gradient(135deg, #2b3f6b, #6a4c8c 45%, #c26a7a 80%, #e59a6b);
  font: 14px -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif;
  color: #fff;
}
#menu { position: fixed; inset: 0 0 auto; height: ${MENU_BAR_PX}px; display: flex; align-items: center; gap: 20px; padding: 0 18px;
  background: rgba(0, 0, 0, .22); backdrop-filter: blur(20px) }
#menu b { font-weight: 700 }
#menu .clock { margin-left: auto }
#window { position: fixed; left: ${x}px; top: ${y}px; width: ${w}px; height: ${h}px; border-radius: 12px; overflow: hidden;
  background: #050505; box-shadow: 0 22px 60px rgba(0, 0, 0, .5), 0 0 0 .5px rgba(0, 0, 0, .6) }
#window::after { content: ""; position: absolute; inset: 0; border-radius: 12px; box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .16); pointer-events: none }
#window iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0 }
.light { position: absolute; top: ${LIGHTS.top}px; width: ${LIGHTS.size}px; height: ${LIGHTS.size}px; border-radius: 50%; z-index: 2;
  box-shadow: inset 0 0 0 .5px rgba(0, 0, 0, .25) }
.cursor { position: fixed; left: 0; top: 0; pointer-events: none; z-index: 10; opacity: 0; transform-origin: 0 0 }
#ring { border-radius: 50%; border: 2px solid rgba(255, 255, 255, .9); box-sizing: border-box; box-shadow: 0 0 0 1px rgba(0, 0, 0, .25) }
</style>
<div id="menu"><b>Noise</b><span>File</span><span>Edit</span><span>View</span><span>Window</span><span class="clock">Tue 2:30 pm</span></div>
<div id="window">
  ${['#ff5f57', '#febc2e', '#28c840'].map((colour, i) => `<span class="light" style="left:${LIGHTS.left + i * (LIGHTS.size + LIGHTS.gap)}px;background:${colour}"></span>`).join('')}
  <iframe src="${appUrl}"></iframe>
</div>
<div id="ring" class="cursor"></div>
<svg id="arrow" class="cursor" width="28" height="36" viewBox="-1 -1 14 21"><path d="M0 0V17L4 13L7 20L10 19L7 12H12Z" fill="#000" stroke="#fff" stroke-width="1.2" stroke-linejoin="round"/></svg>
<svg id="resize" class="cursor" width="22" height="22" viewBox="0 0 16 16"><g stroke-linecap="round" fill="none"><path d="M2 2L14 14M2 2V7M2 2H7M14 14V9M14 14H9" stroke="#000" stroke-width="4.5"/><path d="M2 2L14 14M2 2V7M2 2H7M14 14V9M14 14H9" stroke="#fff" stroke-width="1.8"/></g></svg>
`
