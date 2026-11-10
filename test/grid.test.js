import { test } from 'node:test'
import assert from 'node:assert/strict'
import { COLOUR_ROWS, measureGrid } from '../src/ui/grid.js'

const NO_INSETS = { top: 0, right: 0, bottom: 0, left: 0 }

const stripBottom = grid => (grid.colourTop + COLOUR_ROWS) * grid.stepY

test('the colour strip sits on the bottom edge of a square-cornered screen', () => {
  const grid = measureGrid({ width: 1024, height: 768, dpr: 2, insets: NO_INSETS })
  assert.equal(grid.colourTop, grid.rows - COLOUR_ROWS)
})

test('the colour strip clears the home bar of a rounded screen', () => {
  const phone = measureGrid({ width: 390, height: 844, dpr: 3, insets: { top: 47, right: 0, bottom: 34, left: 0 } })
  assert.ok(stripBottom(phone) <= 844 - 34)
  const thinBar = measureGrid({ width: 390, height: 844, dpr: 3, insets: { top: 20, right: 0, bottom: 1, left: 0 } })
  assert.equal(thinBar.colourTop, thinBar.rows - COLOUR_ROWS - 1)
})

test('a macOS title bar moves the dots down to the third row and leaves the colour strip in place', () => {
  const plain = measureGrid({ width: 1024, height: 768, dpr: 2, insets: NO_INSETS })
  const mac = measureGrid({ width: 1024, height: 768, dpr: 2, insets: NO_INSETS, titlebar: 32 })
  assert.equal(plain.timerRow, 1)
  assert.equal(mac.timerRow, 3)
  assert.equal(mac.colourTop, plain.colourTop)
})

test('with a mouse, small windows shrink the cells to half size and keep about 20 rows', () => {
  const smallest = measureGrid({ width: 280, height: 220, dpr: 2, insets: NO_INSETS, mouse: true })
  assert.ok(smallest.cellW < 12)
  assert.equal(smallest.rows, 20)
  const middle = measureGrid({ width: 360, height: 300, dpr: 2, insets: NO_INSETS, mouse: true })
  assert.ok(middle.cellW > 14 && middle.cellW < 16)
  const full = measureGrid({ width: 960, height: 600, dpr: 2, insets: NO_INSETS, mouse: true })
  assert.deepEqual([full.cols, full.rows], [44, 28])
})

test('touch screens keep cells of at least 22 px and 44 px dot targets', () => {
  const touch = measureGrid({ width: 280, height: 220, dpr: 2, insets: NO_INSETS })
  assert.ok(touch.cellW >= 21)
  assert.equal(touch.tapMin, 44)
})

test('with a mouse, the dot targets are two cells wide', () => {
  const grid = measureGrid({ width: 280, height: 220, dpr: 2, insets: NO_INSETS, mouse: true })
  assert.equal(grid.tapMin, grid.cellW * 2)
})

test('in a small Mac window, the dots sit at least 12 px below the title bar', () => {
  const grid = measureGrid({ width: 280, height: 220, dpr: 2, insets: NO_INSETS, titlebar: 32, mouse: true })
  assert.ok(grid.timerRow * grid.stepY >= 44)
})
