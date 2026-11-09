import { test } from 'node:test'
import assert from 'node:assert/strict'
import { INTRO_FADE_MS, INTRO_HOLD_MS, INTRO_MS, INTRO_SPREAD_MS, INTRO_STEPS, advanceIntro, cellReveal, createIntro, isIntroDone } from '../src/ui/intro.js'

test('every cell waits out the hold, starts within the spread, and is fully shown by the end', () => {
  const intro = createIntro({ cells: 500 })
  assert.equal(intro.delays.length, 500)
  for (const delay of intro.delays) {
    assert.ok(delay >= INTRO_HOLD_MS && delay <= INTRO_HOLD_MS + INTRO_SPREAD_MS)
    assert.equal(cellReveal(delay, INTRO_HOLD_MS), 0)
    assert.equal(cellReveal(delay, delay - 1), 0)
    assert.equal(cellReveal(delay, INTRO_MS), 1)
  }
})

test('a cell fades in through a few hard steps', () => {
  const seen = new Set(Array.from({ length: INTRO_FADE_MS + 1 }, (_, ms) => cellReveal(100, 100 + ms)))
  assert.deepEqual([...seen].sort(), Array.from({ length: INTRO_STEPS + 1 }, (_, step) => step / INTRO_STEPS))
})

test('the intro clock counts frame time, so a stalled frame cannot skip the fade', () => {
  const intro = createIntro({ cells: 4, random: () => 0.5 })
  assert.equal(advanceIntro(intro, 0), 0)
  assert.equal(advanceIntro(intro, 50), 50)
  assert.equal(advanceIntro(intro, 250), 300)
  assert.equal(isIntroDone(300), false)
  assert.equal(isIntroDone(INTRO_MS), true)
})
