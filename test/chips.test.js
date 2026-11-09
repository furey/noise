import { test } from 'node:test'
import assert from 'node:assert/strict'
import { reassignChips, stepChips } from '../src/ui/chips.js'

const COLS = 24
const SEGMENTS = 20
const DT = 1 / 60
const LOUD = Array.from({ length: COLS }, (_, i) => 0.25 + 0.5 * (i / (COLS - 1)))
const QUIET = Array.from({ length: COLS }, () => 0.1)
const FLAT = Array.from({ length: COLS }, () => 0)

const run = ({ chips, levels, seconds, reducedMotion = false }) => {
  for (let t = 0; t < seconds; t += DT) stepChips({ chips, levels, dt: DT, segments: SEGMENTS, reducedMotion })
}

const floorOf = level => Math.round(level * SEGMENTS) / SEGMENTS

test('playing gives one cap per column', () => {
  const chips = []
  reassignChips({ chips, cols: COLS, playing: true })
  assert.equal(chips.length, COLS)
  assert.ok(chips.every(chip => chip.role === 'cap'))
})

test('caps jump to the crest and rest on it', () => {
  const chips = []
  reassignChips({ chips, cols: COLS, playing: true })
  run({ chips, levels: LOUD, seconds: 1 })
  chips.forEach(chip => assert.equal(chip.y, floorOf(LOUD[chip.col])))
})

test('caps hold, then fall and settle on a lower crest', () => {
  const chips = []
  reassignChips({ chips, cols: COLS, playing: true })
  run({ chips, levels: QUIET, seconds: 1 })
  run({ chips, levels: LOUD, seconds: DT })
  run({ chips, levels: QUIET, seconds: 0.2 })
  assert.ok(chips.every(chip => chip.y === floorOf(LOUD[chip.col])), 'caps hold first')
  run({ chips, levels: QUIET, seconds: 2 })
  chips.forEach(chip => {
    assert.equal(chip.y, floorOf(QUIET[chip.col]))
    assert.equal(chip.vy, 0)
  })
})

test('pausing drops every cap and leaves no leftovers', () => {
  const chips = []
  reassignChips({ chips, cols: COLS, playing: true })
  run({ chips, levels: LOUD, seconds: 1 })
  reassignChips({ chips, cols: COLS, playing: false })
  assert.ok(chips.every(chip => chip.role === 'debris'))
  run({ chips, levels: FLAT, seconds: 2 })
  assert.equal(chips.length, 0)
})

test('rapid play and pause settles with no leftovers', () => {
  const chips = []
  for (const playing of [true, false, true, false, true, false]) {
    reassignChips({ chips, cols: COLS, playing })
    run({ chips, levels: playing ? LOUD : FLAT, seconds: 0.1 })
  }
  run({ chips, levels: FLAT, seconds: 2 })
  assert.equal(chips.length, 0)
})

test('reduced motion clears debris on the next step', () => {
  const chips = []
  reassignChips({ chips, cols: COLS, playing: true })
  run({ chips, levels: LOUD, seconds: 0.5 })
  reassignChips({ chips, cols: COLS, playing: false })
  stepChips({ chips, levels: FLAT, dt: DT, segments: SEGMENTS, reducedMotion: true })
  assert.equal(chips.length, 0)
})

test('playing again soon after a pause starts each cap where its falling chip or bar is', () => {
  const chips = []
  reassignChips({ chips, cols: COLS, playing: true })
  run({ chips, levels: LOUD, seconds: 1 })
  reassignChips({ chips, cols: COLS, playing: false })
  run({ chips, levels: FLAT, seconds: 0.1 })
  const falling = chips.map(chip => chip.y)
  reassignChips({ chips, cols: COLS, playing: true, levels: QUIET })
  assert.equal(chips.length, COLS)
  chips.forEach((chip, col) => {
    assert.equal(chip.role, 'cap')
    assert.equal(chip.y, Math.max(falling[col], QUIET[col]))
  })
})
