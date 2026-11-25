import { test } from 'node:test'
import assert from 'node:assert/strict'
import { FADE_IN_S, FADE_OUT_S, HIDE_DELAY_S, KEY_REVEAL_S, createAutoHide, revealForKey, stepAutoHide, stepSongControls, SONG_CONTROLS_FADE_S } from '../src/ui/auto-hide.js'

const STEP_S = 1 / 60

const run = ({ auto, playing = true, seconds, reducedMotion = false }) => {
  for (let t = 0; t < seconds; t += STEP_S) stepAutoHide({ auto, playing, dt: STEP_S, reducedMotion })
  return auto.alpha
}

const hiddenSetup = () => Object.assign(createAutoHide(), { enabled: true, inside: false })

test('controls stay shown while the setting is off', () => {
  const auto = Object.assign(createAutoHide(), { inside: false })
  assert.equal(run({ auto, seconds: 2 }), 1)
})

test('controls stay shown while the pointer is over the window', () => {
  const auto = Object.assign(createAutoHide(), { enabled: true })
  assert.equal(run({ auto, seconds: 2 }), 1)
})

test('controls stay shown while the sound is paused', () => {
  const auto = hiddenSetup()
  assert.equal(run({ auto, playing: false, seconds: 2 }), 1)
})

test('controls wait, then fade out when the pointer leaves during play', () => {
  const auto = hiddenSetup()
  assert.equal(run({ auto, seconds: HIDE_DELAY_S - 0.05 }), 1)
  assert.equal(run({ auto, seconds: FADE_OUT_S + 0.1 }), 0)
})

test('controls fade back in when the pointer returns', () => {
  const auto = hiddenSetup()
  run({ auto, seconds: 1 })
  auto.inside = true
  assert.equal(run({ auto, seconds: FADE_IN_S + 0.05 }), 1)
})

test('controls fade back in when the sound pauses', () => {
  const auto = hiddenSetup()
  run({ auto, seconds: 1 })
  assert.equal(run({ auto, playing: false, seconds: FADE_IN_S + 0.05 }), 1)
})

test('a key press shows the controls, which hide again afterwards', () => {
  const auto = hiddenSetup()
  run({ auto, seconds: 1 })
  revealForKey(auto)
  assert.equal(run({ auto, seconds: KEY_REVEAL_S - 0.1 }), 1)
  assert.equal(run({ auto, seconds: HIDE_DELAY_S + FADE_OUT_S + 0.2 }), 0)
})

test('controls stay shown while a drag is held, then hide after release', () => {
  const auto = Object.assign(hiddenSetup(), { held: true })
  assert.equal(run({ auto, seconds: 1 }), 1)
  auto.held = false
  assert.equal(run({ auto, seconds: HIDE_DELAY_S + FADE_OUT_S + 0.1 }), 0)
})

test('reduced motion hides and shows without a fade', () => {
  const auto = hiddenSetup()
  assert.equal(run({ auto, seconds: HIDE_DELAY_S + STEP_S, reducedMotion: true }), 0)
  auto.inside = true
  stepAutoHide({ auto, playing: true, dt: STEP_S, reducedMotion: true })
  assert.equal(auto.alpha, 1)
})

test('song-mode buttons fade fully out during a song and back in after it', () => {
  const fade = ({ trackOn, seconds, alpha }) => {
    for (let t = 0; t < seconds; t += STEP_S) alpha = stepSongControls({ alpha, trackOn, dt: STEP_S, reducedMotion: false })
    return alpha
  }
  const half = fade({ trackOn: true, seconds: SONG_CONTROLS_FADE_S / 2, alpha: 1 })
  assert.ok(half > 0.4 && half < 0.6)
  const out = fade({ trackOn: true, seconds: SONG_CONTROLS_FADE_S + 0.1, alpha: 1 })
  assert.equal(out, 0)
  assert.equal(fade({ trackOn: false, seconds: SONG_CONTROLS_FADE_S + 0.1, alpha: out }), 1)
  assert.equal(stepSongControls({ alpha: 1, trackOn: true, dt: STEP_S, reducedMotion: true }), 0)
})
