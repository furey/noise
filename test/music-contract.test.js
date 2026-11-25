import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SEARCH_LIMIT, cleanQuery, driverError, driverProblem, isDriverFunction, supportedResult, usableAlbum, usableResult, usableTrack } from '../electron/provider/contract.mjs'

const fullDriver = { apiVersion: 1, search: () => {}, stream: () => {}, next: () => {}, download: () => {} }

test('a driver is valid only with API version 1 and all four functions', () => {
  assert.equal(driverProblem(fullDriver), '')
  assert.match(driverProblem(null), /exports nothing/)
  assert.match(driverProblem({ ...fullDriver, apiVersion: 2 }), /apiVersion is 2/)
  assert.match(driverProblem({ ...fullDriver, next: undefined, download: 'no' }), /lacks next, download/)
})

test('a track needs a safe id and a title, and its text is tidied', () => {
  assert.deepEqual(usableTrack({ id: 'ab_C-1', title: '  Says \n', artist: 'Nils  Frahm', durationS: 498.4 }),
    { id: 'ab_C-1', title: 'Says', artist: 'Nils Frahm', durationS: 498 })
  assert.deepEqual(usableTrack({ id: 'x', title: 'Untimed' }), { id: 'x', title: 'Untimed', artist: '', durationS: 0 })
  assert.equal(usableTrack({ id: '../etc', title: 'Escape' }), null)
  assert.equal(usableTrack({ id: 'a'.repeat(65), title: 'Long id' }), null)
  assert.equal(usableTrack({ id: 'ok', title: '   ' }), null)
})

test('search results drop unusable tracks and keep at most five', () => {
  const raw = [{ id: 'bad id', title: 'No' }, ...Array.from({ length: 7 }, (_, i) => ({ id: `t${i}`, title: `Track ${i}` }))]
  const tracks = usableResult.search(raw)
  assert.equal(tracks.length, SEARCH_LIMIT)
  assert.equal(tracks[0].id, 't0')
  assert.deepEqual(usableResult.search('not a list'), [])
})

test('album is an optional driver function', () => {
  assert.equal(driverProblem({ ...fullDriver, album: () => {} }), '')
  assert.equal(driverProblem(fullDriver), '')
  assert.equal(isDriverFunction('album'), true)
  assert.equal(isDriverFunction('toString'), false)
})

test('a search result may be an album with a whole song count, and any other kind is a plain song', () => {
  const raw = [
    { id: 'al1', title: ' Kid ', artist: 'Band', kind: 'album', trackCount: 12, extra: 'x' },
    { id: 'al2', title: 'Odd count', kind: 'album', trackCount: 2.5 },
    { id: 's1', title: 'Song', kind: 'video', trackCount: 3, durationS: 61 },
    { id: 'bad id', title: 'No', kind: 'album', trackCount: 3 },
  ]
  assert.deepEqual(usableResult.search(raw), [
    { id: 'al1', title: 'Kid', artist: 'Band', durationS: 0, kind: 'album', trackCount: 12 },
    { id: 'al2', title: 'Odd count', artist: '', durationS: 0, kind: 'album', trackCount: 0 },
    { id: 's1', title: 'Song', artist: '', durationS: 61 },
  ])
  assert.equal(usableAlbum({ id: 's1', title: 'Song' }), null)
  assert.deepEqual(usableTrack(raw[0]), { id: 'al1', title: 'Kid', artist: 'Band', durationS: 0 })
})

test('album songs are plain tracks in order, and radio and album lists never keep albums', () => {
  const raw = [{ id: 'b', title: 'B', kind: 'album', trackCount: 2 }, { id: 'a', title: 'A', durationS: 9 }, { id: 'bad id', title: 'No' }]
  assert.deepEqual(usableResult.album(raw), [{ id: 'b', title: 'B', artist: '', durationS: 0 }, { id: 'a', title: 'A', artist: '', durationS: 9 }])
  assert.deepEqual(usableResult.next(raw).map(track => Object.keys(track).length), [4, 4])
  assert.deepEqual(usableResult.album('not a list'), [])
})

test('a driver without album never returns album search results', () => {
  const result = [{ id: 'al', title: 'Album', kind: 'album' }, { id: 's', title: 'Song' }]
  assert.deepEqual(supportedResult({ driver: fullDriver, method: 'search', result }), [{ id: 's', title: 'Song' }])
  assert.equal(supportedResult({ driver: { ...fullDriver, album: () => {} }, method: 'search', result }), result)
  assert.equal(supportedResult({ driver: fullDriver, method: 'next', result }), result)
  assert.equal(supportedResult({ driver: fullDriver, method: 'search', result: 'odd' }), 'odd')
})

test('a stream needs an https or loopback URL and keeps only string headers and an audio type', () => {
  assert.equal(usableResult.stream({ url: 'http://example.com/a' }), null)
  assert.equal(usableResult.stream({ url: 'not a url' }), null)
  assert.equal(usableResult.stream({ url: 'http://127.0.0.1:9/a' }).url, 'http://127.0.0.1:9/a')
  assert.equal(usableResult.stream({ url: 'http://192.168.0.2/a' }), null)
  assert.deepEqual(usableResult.stream({
    url: 'https://example.com/a', headers: { 'User-Agent': 'x', Bad: 1 }, mime: 'audio/webm', expiresAt: 5, track: { id: 'a', title: 'A' },
  }), { url: 'https://example.com/a', headers: { 'User-Agent': 'x' }, mime: 'audio/webm', expiresAt: 5, track: { id: 'a', title: 'A', artist: '', durationS: 0 } })
  assert.deepEqual(usableResult.stream({ url: 'https://example.com/a', mime: 'text/html' }),
    { url: 'https://example.com/a', headers: {}, mime: '', expiresAt: 0, track: null })
})

test('driver errors keep known codes and fall back to unavailable', () => {
  assert.deepEqual(driverError({ code: 'not-found', message: 'No match' }), { code: 'not-found', message: 'No match' })
  assert.deepEqual(driverError(new Error('Boom')), { code: 'unavailable', message: 'Boom' })
  assert.equal(driverError({ message: 'x'.repeat(500) }).message.length, 300)
})

test('a query is trimmed and collapsed', () => {
  assert.equal(cleanQuery('  nils   frahm \n says '), 'nils frahm says')
  assert.equal(cleanQuery(42), '')
})
