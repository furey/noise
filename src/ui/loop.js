const MAX_DT_S = 0.05
const FRAME_MS = 1000 / 30
const VSYNC_MARGIN_MS = 8

export const createFrameLoop = ({ draw, doc = document }) => {
  const loop = { draw, doc, id: 0, timer: 0, last: 0, tick: null }
  loop.tick = now => frame(loop, now)
  const onVisibility = () => doc.hidden ? sleep(loop) : wake(loop)
  doc.addEventListener('visibilitychange', onVisibility)
  return {
    wake: () => wake(loop),
    dispose: () => {
      sleep(loop)
      doc.removeEventListener('visibilitychange', onVisibility)
    },
  }
}

const wake = loop => {
  if (loop.id || loop.timer || loop.doc.hidden) return
  loop.last = performance.now()
  request(loop)
}

const sleep = loop => {
  cancelAnimationFrame(loop.id)
  clearTimeout(loop.timer)
  loop.id = 0
  loop.timer = 0
}

const request = loop => {
  loop.id = requestAnimationFrame(loop.tick)
}

const requestNextFrame = loop => {
  loop.timer = setTimeout(() => {
    loop.timer = 0
    request(loop)
  }, FRAME_MS - VSYNC_MARGIN_MS)
}

const frame = (loop, now) => {
  const dt = Math.min(MAX_DT_S, Math.max(0, now - loop.last) / 1000)
  loop.last = now
  loop.id = 0
  if (loop.draw(dt, now) && !loop.doc.hidden) requestNextFrame(loop)
}
