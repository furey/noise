import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TRACK_FADE_IN_S, TRACK_FADE_OUT_S, isTrackAudible, rampGain } from '../src/audio/track-fade.js'

test('the fade times are 250 ms out and 400 ms in', () => {
  assert.equal(TRACK_FADE_OUT_S, 0.25)
  assert.equal(TRACK_FADE_IN_S, 0.4)
})

test('a track fades out only while it is live, sounding, playing, and not ended', () => {
  const sounding = { live: true, sounding: true, paused: false, ended: false }
  assert.equal(isTrackAudible(sounding), true)
  assert.equal(isTrackAudible({ ...sounding, live: false }), false)
  assert.equal(isTrackAudible({ ...sounding, sounding: false }), false)
  assert.equal(isTrackAudible({ ...sounding, paused: true }), false)
  assert.equal(isTrackAudible({ ...sounding, ended: true }), false)
})

test('a ramp restarts from the current gain and reaches the target after the given seconds', () => {
  const calls = []
  const param = {
    value: 0.35,
    cancelScheduledValues: time => calls.push(['cancel', time]),
    setValueAtTime: (value, time) => calls.push(['set', value, time]),
    linearRampToValueAtTime: (value, time) => calls.push(['ramp', value, time]),
  }
  rampGain({ ctx: { currentTime: 2 }, param, value: 0, seconds: 0.25 })
  assert.deepEqual(calls, [['cancel', 2], ['set', 0.35, 2], ['ramp', 0, 2.25]])
})
