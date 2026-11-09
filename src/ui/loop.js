const MAX_DT_S = 0.05

export const createFrameLoop = ({ draw, doc = document }) => {
  const loop = { draw, doc, id: 0, last: 0, tick: null }
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
  if (loop.id || loop.doc.hidden) return
  loop.last = performance.now()
  request(loop)
}

const sleep = loop => {
  cancelAnimationFrame(loop.id)
  loop.id = 0
}

const request = loop => {
  loop.id = requestAnimationFrame(loop.tick)
}

const frame = (loop, now) => {
  const dt = Math.min(MAX_DT_S, Math.max(0, now - loop.last) / 1000)
  loop.last = now
  loop.id = 0
  if (loop.draw(dt, now) && !loop.doc.hidden) request(loop)
}
