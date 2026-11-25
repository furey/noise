import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clockText, createMemo, keepRowAt, lengthText, mergeRows, trackText } from '../src/provider/results.js'

const song = (id, title, artist = 'Band') => ({ id, title, artist, durationS: 100 })

test('a row shows title and artist, or the title alone', () => {
  assert.equal(trackText(song('a', 'River')), 'River · Band')
  assert.equal(trackText({ id: 'b', title: 'Alone' }), 'Alone')
})

test('an album row keeps the plain title and counts its songs', () => {
  const album = { id: 'a1', title: 'Kid', artist: 'Band', durationS: 0, kind: 'album', trackCount: 12 }
  assert.equal(trackText(album), 'Kid · Band')
  assert.equal(lengthText(album), '12 songs')
  assert.equal(lengthText({ ...album, trackCount: 1 }), '1 song')
  assert.equal(lengthText({ ...album, trackCount: 0 }), '')
  assert.equal(lengthText(song('s', 'River')), '1:40')
})

test('rows put the best live result first, then cached matches, then other live results, without repeats', () => {
  const cached = [song('c1', 'River Song'), song('l2', 'Riverside')]
  const live = [song('l1', 'Push the River'), song('l2', 'Riverside'), song('l3', 'Dam That River')]
  const rows = mergeRows({ query: 'river', cached, live })
  assert.deepEqual(rows.map(row => [row.track.id, row.cached]), [['l1', false], ['c1', true], ['l2', true], ['l3', false]])
  assert.ok(rows[0].hits.length > 0)
})

test('rows hold at most five and show cached matches before any live results arrive', () => {
  const cached = Array.from({ length: 8 }, (_, index) => song(`c${index}`, `River ${index}`))
  assert.equal(mergeRows({ query: 'river', cached, live: [] }).length, 5)
  assert.deepEqual(mergeRows({ query: '', cached, live: [] }), [])
})

test('the memo returns recent answers, ignores case and spacing, and forgets old or extra ones', () => {
  let time = 0
  const memo = createMemo({ limit: 2, forMs: 1000, now: () => time })
  memo.set('Nils  Frahm', ['a'])
  assert.deepEqual(memo.get(' nils frahm'), ['a'])
  memo.set('b', ['b'])
  memo.set('c', ['c'])
  assert.equal(memo.get('nils frahm'), null)
  time = 2000
  assert.equal(memo.get('c'), null)
})

test('clock text shows minutes and seconds, with hours when needed', () => {
  assert.equal(clockText(0), '0:00')
  assert.equal(clockText(65.4), '1:05')
  assert.equal(clockText(3725), '1:02:05')
  assert.equal(clockText(-3), '0:00')
})

test('a selected row keeps its place when new results arrive', () => {
  const held = { track: song('c1', 'River Song'), hits: [], cached: true }
  const live = [song('l1', 'Push the River'), song('l2', 'Riverside'), song('c1', 'River Song'), song('l3', 'Dam That River')]
  const rows = mergeRows({ query: 'river', cached: [], live })
  const kept = keepRowAt({ rows, row: held, index: 1 })
  assert.equal(kept[1], held)
  assert.deepEqual(kept.map(row => row.track.id), ['l1', 'c1', 'l2', 'l3'])
})

test('a selected row stays even when new results leave it out', () => {
  const held = { track: song('gone', 'Old River'), hits: [], cached: false }
  const live = Array.from({ length: 5 }, (_, index) => song(`l${index}`, `River ${index}`))
  const kept = keepRowAt({ rows: mergeRows({ query: 'river', cached: [], live }), row: held, index: 4 })
  assert.equal(kept.length, 5)
  assert.equal(kept[4], held)
})
