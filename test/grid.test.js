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
