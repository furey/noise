import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  COLOURS, LAST, colourAt, hexRgb, isDarkInk, layerOpacity, mixRgb, nearestColour, paletteFor, IDLE_PALETTE, PALETTES,
  shadeRgb, slopeDb, slopeText,
} from '../src/ui/colours.js'

test('colour stops sit exactly on whole positions', () => {
  COLOURS.forEach((colour, i) => assert.deepEqual(colourAt(i), hexRgb(colour.hex)))
})

test('colours blend linearly between neighbours', () => {
  const brown = hexRgb(COLOURS[0].hex)
  const pink = hexRgb(COLOURS[1].hex)
  assert.deepEqual(colourAt(0.5), mixRgb(brown, pink, 0.5))
  assert.deepEqual(colourAt(-3), brown)
  assert.deepEqual(colourAt(99), hexRgb(COLOURS[LAST].hex))
})

test('layer opacities cross-fade the two neighbours only', () => {
  const opacities = pos => COLOURS.map((_, i) => layerOpacity(pos, i))
  assert.deepEqual(opacities(0), [1, 0, 0, 0, 0])
  assert.deepEqual(opacities(1.25), [0, 1, 0.25, 0, 0])
  assert.deepEqual(opacities(4), [0, 0, 0, 0, 1])
})

test('slope maps brown to violet across minus 6 to plus 6 dB per octave', () => {
  assert.deepEqual([0, 1, 2, 3, 4].map(slopeDb), [-6, -3, 0, 3, 6])
  assert.equal(slopeText(0.5), 'minus 4.5')
  assert.equal(slopeText(2), '0.0')
  assert.equal(slopeText(4), 'plus 6.0')
})

test('nearest colour rounds the slope position', () => {
  assert.equal(nearestColour(1.49).id, 'pink')
  assert.equal(nearestColour(1.5).id, 'white')
})

test('the palette blends between neighbouring colours while playing', () => {
  assert.equal(paletteFor({ playing: false, pos: 2 }), IDLE_PALETTE)
  assert.equal(paletteFor({ playing: true, pos: 3 }), PALETTES.blue)
  assert.equal(paletteFor({ playing: true, pos: 3.2 }).mid, 'rgba(66,166,255,1)')
  assert.equal(isDarkInk({ playing: true, pos: 2 }), true)
  assert.equal(isDarkInk({ playing: false, pos: 2 }), false)
})

test('row shades lighten up and darken down', () => {
  assert.deepEqual(shadeRgb([100, 100, 100], 0), [100, 100, 100])
  assert.ok(shadeRgb([100, 100, 100], 0.12)[0] > 100)
  assert.ok(shadeRgb([100, 100, 100], -0.12)[0] < 100)
})
