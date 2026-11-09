import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  INTRO_FADE_MS, INTRO_HOLD_MS, INTRO_MS, INTRO_PATTERNS, INTRO_SPREAD_MS, INTRO_STEPS, advanceIntro, cellReveal, createIntro,
  isIntroDone, pickPattern,
} from '../src/ui/intro.js'

const cols = 18
const rows = 39
const rowMean = (intro, row) => intro.delays.slice(row * cols, (row + 1) * cols).reduce((sum, delay) => sum + delay, 0) / cols

test('every pattern waits out the hold and shows every cell by the end', () => {
  for (const pattern of Object.keys(INTRO_PATTERNS)) {
    const intro = createIntro({ cols, rows, pattern })
    assert.equal(intro.delays.length, cols * rows)
    for (const delay of intro.delays) {
      assert.ok(delay >= INTRO_HOLD_MS && delay <= INTRO_HOLD_MS + INTRO_SPREAD_MS, pattern)
      assert.equal(cellReveal(delay, INTRO_HOLD_MS), 0)
      assert.equal(cellReveal(delay, INTRO_MS), 1)
    }
  }
})

test('a direction pattern reveals its starting edge first', () => {
  const up = createIntro({ cols, rows, pattern: 'up' })
  assert.ok(rowMean(up, rows - 1) < rowMean(up, 0))
  const down = createIntro({ cols, rows, pattern: 'down' })
  assert.ok(rowMean(down, 0) < rowMean(down, rows - 1))
  const centre = createIntro({ cols, rows, pattern: 'centre', random: () => 0.5 })
  assert.ok(centre.delays[Math.floor(rows / 2) * cols + cols / 2] < centre.delays[0])
})

test('each start picks any of the patterns', () => {
  const names = Object.keys(INTRO_PATTERNS)
  const picked = new Set(names.map((_, index) => pickPattern(() => (index + 0.5) / names.length)))
  assert.equal(picked.size, names.length)
})

test('a cell fades in through a few hard steps', () => {
  const seen = new Set(Array.from({ length: INTRO_FADE_MS + 1 }, (_, ms) => cellReveal(100, 100 + ms)))
  assert.deepEqual([...seen].sort(), Array.from({ length: INTRO_STEPS + 1 }, (_, step) => step / INTRO_STEPS))
})

test('the intro clock counts frame time, so a stalled frame cannot skip the fade', () => {
  const intro = createIntro({ cols: 2, rows: 2, random: () => 0.5 })
  assert.equal(advanceIntro(intro, 0), 0)
  assert.equal(advanceIntro(intro, 50), 50)
  assert.equal(advanceIntro(intro, 250), 300)
  assert.equal(isIntroDone(300), false)
  assert.equal(isIntroDone(INTRO_MS), true)
})
