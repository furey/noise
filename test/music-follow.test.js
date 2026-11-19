import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  createFollow, createFollower, glidePos, holdInk, posToSlope, shownPos, slopeToPos, spectralSlope,
} from '../src/provider/follow.js'

const SAMPLE_RATE = 48000
const BINS = 2048

const spectrum = dbPerOctave => Float32Array.from({ length: BINS }, (_, bin) => {
  const hz = Math.max(1, bin) * SAMPLE_RATE / 2 / BINS
  return -40 + dbPerOctave * Math.log2(hz / 1000)
})

const near = (actual, expected, within = 0.05) => assert.ok(Math.abs(actual - expected) < within, `${actual} is not near ${expected}`)

test('spectral slope reads the noise colours in dB per octave', () => {
  for (const slope of [-6, -3, 0, 3, 6]) near(spectralSlope({ db: spectrum(slope), sampleRate: SAMPLE_RATE }), slope)
})

test('a silent spectrum has no slope', () => {
  assert.equal(spectralSlope({ db: new Float32Array(BINS).fill(-Infinity), sampleRate: SAMPLE_RATE }), null)
  assert.equal(spectralSlope({ db: new Float32Array(BINS).fill(-120), sampleRate: SAMPLE_RATE }), null)
})

test('slope maps linearly to colour position, clamped, and back', () => {
  const calibration = { brownDbPerOctave: -6, violetDbPerOctave: -2 }
  assert.equal(slopeToPos(-6, calibration), 0)
  assert.equal(slopeToPos(-4, calibration), 2)
  assert.equal(slopeToPos(-9, calibration), 0)
  assert.equal(slopeToPos(3, calibration), 4)
  assert.equal(posToSlope(2, calibration), -4)
})

test('the ink edge holds until the colour moves past it by a margin', () => {
  assert.equal(holdInk({ previous: 1.4, next: 1.55 }), 1.5 - 1e-6)
  assert.equal(holdInk({ previous: 1.4, next: 1.7 }), 1.7)
  assert.equal(holdInk({ previous: 2.6, next: 2.45 }), 2.5)
  assert.equal(holdInk({ previous: 0.5, next: 1.2 }), 1.2)
  assert.equal(holdInk({ previous: null, next: 1.55 }), 1.55)
})

test('the follower starts at a colour and glides toward the song over seconds', () => {
  const follower = createFollower({ calibration: { brownDbPerOctave: -6, violetDbPerOctave: 0 }, smoothingS: 3 })
  follower.start(0)
  const violet = spectrum(0)
  let pos = 0
  for (let frame = 0; frame < 180; frame++) pos = follower.step({ db: violet, sampleRate: SAMPLE_RATE, dt: 1 / 60 })
  near(pos, 4 * (1 - Math.exp(-1)), 0.05)
  assert.equal(follower.step({ db: new Float32Array(BINS).fill(-Infinity), sampleRate: SAMPLE_RATE, dt: 1 / 60 }), pos)
})

test('the shown colour is the song colour only while a song is on', () => {
  assert.equal(shownPos({ pos: 1, track: { status: 'active', pos: 3 } }), 3)
  assert.equal(shownPos({ pos: 1, track: { status: 'loading', pos: 3 } }), 3)
  assert.equal(shownPos({ pos: 1, track: { status: 'loading' } }), 1)
  assert.equal(shownPos({ pos: 1, track: { status: 'idle', pos: 3 } }), 1)
})

test('after a song the colour eases back instead of jumping', () => {
  const follow = createFollow()
  assert.equal(glidePos({ follow, state: { track: { status: 'active' } }, target: 3, dt: 1 / 60 }), 3)
  const first = glidePos({ follow, state: { track: { status: 'idle' } }, target: 1, dt: 1 / 60 })
  assert.ok(first < 3 && first > 1)
  let pos = first
  for (let frame = 0; frame < 240; frame++) pos = glidePos({ follow, state: { track: { status: 'idle' } }, target: 1, dt: 1 / 60 })
  assert.equal(pos, 1)
  assert.equal(glidePos({ follow, state: { track: { status: 'idle' } }, target: 2, dt: 1 / 60 }), 2)
})
