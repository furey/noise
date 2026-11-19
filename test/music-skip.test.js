import { test } from 'node:test'
import assert from 'node:assert/strict'
import { HISTORY_LIMIT, RESTART_AFTER_S, albumIndex, previousStep, startOver, stepBack, stepForward } from '../electron/provider/skip.mjs'

const song = id => ({ id, title: id })

test('Previous restarts the song once it is more than 3 s in', () => {
  assert.equal(RESTART_AFTER_S, 3)
  assert.equal(previousStep({ seconds: 3.5, album: true, history: [song('a')] }), 'restart')
  assert.equal(previousStep({ seconds: 3.5, album: false, history: [song('a')] }), 'restart')
})

test('Previous within the first 3 s goes to the album song before, or back in the history', () => {
  assert.equal(previousStep({ seconds: 2.9, album: true, history: [] }), 'album')
  assert.equal(previousStep({ seconds: 3, album: false, history: [song('a')] }), 'history')
})

test('Previous with no history restarts the song', () => {
  assert.equal(previousStep({ seconds: 0, album: false, history: [] }), 'restart')
})

test('album steps wrap at both ends', () => {
  assert.equal(albumIndex({ index: 2, length: 3, step: 1 }), 0)
  assert.equal(albumIndex({ index: 0, length: 3, step: -1 }), 2)
  assert.equal(albumIndex({ index: 1, length: 3, step: -1 }), 0)
})

test('Previous takes the last played song and keeps the current one for Next', () => {
  const back = stepBack({ history: [song('a'), song('b')], ahead: [], current: song('c') })
  assert.deepEqual(back, { track: song('b'), history: [song('a')], ahead: [song('c')] })
  const forward = stepForward({ ...back, current: back.track })
  assert.deepEqual(forward, { track: song('c'), history: [song('a'), song('b')], ahead: [] })
})

test('Next with nothing ahead adds the current song to the history and leaves the pick to the queue', () => {
  assert.deepEqual(stepForward({ history: [song('a')], ahead: [], current: song('b') }), { track: null, history: [song('a'), song('b')], ahead: [] })
})

test('a retried Next does not add the same song twice', () => {
  assert.deepEqual(stepForward({ history: [song('a')], ahead: [], current: song('a') }).history, [song('a')])
})

test('a new search pick keeps the history and drops the songs ahead', () => {
  assert.deepEqual(startOver({ history: [song('a')], ahead: [song('c')], current: song('b') }), { history: [song('a'), song('b')], ahead: [] })
  assert.deepEqual(startOver({ history: [], ahead: [], current: null }), { history: [], ahead: [] })
})

test('the history keeps only the latest songs', () => {
  const history = Array.from({ length: HISTORY_LIMIT }, (_, index) => song(`s${index}`))
  const { history: kept } = stepForward({ history, ahead: [], current: song('new') })
  assert.equal(kept.length, HISTORY_LIMIT)
  assert.deepEqual([kept[0].id, kept.at(-1).id], ['s1', 'new'])
})
