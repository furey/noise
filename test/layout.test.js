import { test } from 'node:test'
import assert from 'node:assert/strict'
import { musicBox, musicHitBox, measureLayout, posAtX, TAP_MIN_PX, thumbX, timerBox, waveBox, waveHitBox, zoneAt } from '../src/ui/layout.js'
import { uiScale } from '../src/ui/ui-scale.js'

const NO_INSETS = Object.freeze({ top: 0, right: 0, bottom: 0, left: 0 })

const layoutAt = ({ width, height, titlebar = 32 }) =>
  measureLayout({ width, height, dpr: 2, insets: NO_INSETS, titlebar, mouse: true, scale: uiScale({ width, height }) })

test('an 800 × 600 window keeps the full-size layout', () => {
  const layout = layoutAt({ width: 800, height: 600 })
  assert.equal(layout.scale, 1)
  assert.deepEqual(
    { left: layout.left, right: layout.right, base: layout.base, top: layout.top, controlY: layout.controlY, strip: layout.strip },
    { left: 20, right: 780, base: 509, top: 90, controlY: 58, strip: { left: 20, top: 528, width: 760, height: 52 } },
  )
  assert.deepEqual(waveBox(layout), { left: 20, top: 40, width: 36, height: 36 })
  assert.deepEqual(musicBox(layout), { left: 382, top: 40, width: 36, height: 36 })
  assert.deepEqual(timerBox(layout, 2), { left: 731, top: 40, width: 49, height: 36 })
  assert.deepEqual(musicHitBox(layout), { left: 378, top: 36, width: 44, height: 44 })
  assert.equal(thumbX(layout, 2, 4), 400)
  assert.equal(posAtX({ grid: layout, x: 300, last: 4 }), 1.4428969359331476)
  assert.equal(zoneAt(layout, 528 - 14), 'colour')
  assert.equal(zoneAt(layout, 528 - 15), 'synth')
})

test('an 800 × 600 layout without a title bar matches the old numbers', () => {
  const layout = layoutAt({ width: 800, height: 600, titlebar: 0 })
  assert.deepEqual({ top: layout.top, controlY: layout.controlY, span: layout.span, travel: layout.travel }, { top: 70, controlY: 38, span: 439, travel: 427 })
  assert.deepEqual(waveBox(layout), { left: 20, top: 20, width: 36, height: 36 })
})

test('a parked 280 × 220 window shrinks the controls, strip, and edges to 0.7', () => {
  const layout = layoutAt({ width: 280, height: 220 })
  assert.equal(layout.scale, 0.7)
  assert.deepEqual({ left: layout.left, right: layout.right, base: layout.base, top: layout.top }, { left: 14, right: 266, base: 156, top: 75 })
  assert.equal(layout.linePx, 29.4)
  assert.equal(layout.strip.height, 36.4)
  assert.equal(close(layout.strip.top), 169.6)
  assert.equal(close(layout.controlY), 52.6)
  assert.deepEqual(roundBox(waveBox(layout)), { left: 14, top: 40, width: 25.2, height: 25.2 })
  assert.deepEqual(roundBox(musicBox(layout)), { left: 127.4, top: 40, width: 25.2, height: 25.2 })
  assert.deepEqual(roundBox(timerBox(layout, 2)), { left: 231.7, top: 40, width: 34.3, height: 25.2 })
  assert.equal(thumbX(layout, 2, 4), 140)
  assert.equal(close(layout.span), 81)
})

test('scaled controls keep the minimum hit target', () => {
  const layout = layoutAt({ width: 280, height: 220 })
  for (const box of [musicHitBox(layout), waveHitBox(layout)]) {
    assert.equal(box.width, TAP_MIN_PX)
    assert.equal(box.height, TAP_MIN_PX)
  }
})

const close = value => Math.round(value * 1000) / 1000

const roundBox = box => Object.fromEntries(Object.entries(box).map(([key, value]) => [key, close(value)]))
