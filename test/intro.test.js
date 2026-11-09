import { test } from 'node:test'
import assert from 'node:assert/strict'
import { INTRO_FADE_MS, INTRO_MS, INTRO_SPREAD_MS, INTRO_STEPS, cellReveal, createIntro, introElapsed, isIntroDone } from '../src/ui/intro.js'

test('every cell starts within the spread and is fully shown by the end of the intro', () => {
  const intro = createIntro({ cells: 500 })
  assert.equal(intro.delays.length, 500)
  for (const delay of intro.delays) {
    assert.ok(delay >= 0 && delay <= INTRO_SPREAD_MS)
    assert.equal(cellReveal(delay, delay - 1), 0)
    assert.equal(cellReveal(delay, INTRO_MS), 1)
  }
})

test('a cell fades in through a few hard steps', () => {
  const seen = new Set(Array.from({ length: INTRO_FADE_MS + 1 }, (_, ms) => cellReveal(100, 100 + ms)))
  assert.deepEqual([...seen].sort(), Array.from({ length: INTRO_STEPS + 1 }, (_, step) => step / INTRO_STEPS))
})

test('the intro clock starts on the first frame and ends after the intro', () => {
  const intro = createIntro({ cells: 4, random: () => 0.5 })
  assert.equal(introElapsed(intro, 5000), 0)
  assert.equal(introElapsed(intro, 5300), 300)
  assert.equal(isIntroDone(300), false)
  assert.equal(isIntroDone(INTRO_MS), true)
})
