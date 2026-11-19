import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createCache } from '../electron/provider/cache.mjs'
import { byteRange } from '../electron/provider/stream-route.mjs'

const tempFolder = () => fs.mkdtemp(path.join(os.tmpdir(), 'noise-cache-'))

const fakeDownload = ({ bytes = 100, calls = [] } = {}) => async (track, { path: target }) => {
  calls.push(track.id)
  await fs.writeFile(target, Buffer.alloc(bytes, 1))
  return { mime: 'audio/webm' }
}

const clock = (start = 1000) => {
  let time = start
  return Object.assign(() => time, { advance: ms => { time += ms } })
}

test('a stored song can be found, listed, and touched', async () => {
  const now = clock()
  const cache = createCache({ folder: await tempFolder(), download: fakeDownload(), now })
  await cache.store({ id: 'song-1', title: 'Song One', artist: 'Band' })
  const found = await cache.find('song-1')
  assert.equal(found.mime, 'audio/webm')
  assert.equal((await fs.stat(found.file)).size, 100)
  now.advance(500)
  await cache.touch('song-1')
  assert.deepEqual(await cache.list(), [{ track: { id: 'song-1', title: 'Song One', artist: 'Band', durationS: 0 }, lastPlayed: 1500, plays: 2, bytes: 100 }])
})

test('a song with an unsafe id is never stored', async () => {
  const calls = []
  const cache = createCache({ folder: await tempFolder(), download: fakeDownload({ calls }) })
  assert.equal(await cache.store({ id: '../escape', title: 'Bad' }), null)
  assert.deepEqual(calls, [])
  assert.equal(await cache.find('../escape'), null)
})

test('one app downloads a song once, even when asked twice at the same time', async () => {
  const calls = []
  const cache = createCache({ folder: await tempFolder(), download: fakeDownload({ calls }) })
  await Promise.all([cache.store({ id: 'a', title: 'A' }), cache.store({ id: 'a', title: 'A' })])
  assert.deepEqual(calls, ['a'])
})

test('two apps storing the same song leave one copy and no temporary folders', async () => {
  const folder = await tempFolder()
  const [first, second] = [createCache({ folder, download: fakeDownload() }), createCache({ folder, download: fakeDownload() })]
  await Promise.all([first.store({ id: 'shared', title: 'Shared' }), second.store({ id: 'shared', title: 'Shared' })])
  assert.deepEqual(await fs.readdir(path.join(folder, 'cache')), ['shared'])
  assert.ok(await first.find('shared'))
})

test('eviction deletes the least recently played songs first and spares kept ones', async () => {
  const now = clock()
  const cache = createCache({ folder: await tempFolder(), download: fakeDownload({ bytes: 100 }), now, limitBytes: 250 })
  for (const id of ['old', 'kept', 'new']) {
    await cache.store({ id, title: id }, { keep: ['old', 'kept', 'new'] })
    now.advance(10)
  }
  await cache.evict({ keep: ['kept'] })
  assert.deepEqual((await cache.list()).map(({ track }) => track.id).sort(), ['kept', 'new'])
})

test('two apps evicting at once do not fail', async () => {
  const folder = await tempFolder()
  const now = clock()
  const writer = createCache({ folder, download: fakeDownload({ bytes: 100 }), now, limitBytes: 1000 })
  for (const id of ['a', 'b', 'c', 'd']) {
    await writer.store({ id, title: id })
    now.advance(10)
  }
  const [first, second] = [createCache({ folder, download: fakeDownload(), now, limitBytes: 100 }), createCache({ folder, download: fakeDownload(), now, limitBytes: 100 })]
  await Promise.all([first.evict(), second.evict()])
  assert.deepEqual((await first.list()).map(({ track }) => track.id), ['d'])
})

test('a failed download leaves nothing behind', async () => {
  const folder = await tempFolder()
  const cache = createCache({ folder, download: async () => { throw new Error('offline') } })
  await assert.rejects(cache.store({ id: 'x', title: 'X' }), /offline/)
  assert.deepEqual(await fs.readdir(path.join(folder, 'cache')), [])
})

test('temporary folders older than an hour are cleared', async () => {
  const folder = await tempFolder()
  const leftover = path.join(folder, 'cache', 'x.1.abcd.tmp')
  await fs.mkdir(leftover, { recursive: true })
  await createCache({ folder, download: fakeDownload(), now: () => Date.now() + 2 * 60 * 60 * 1000 }).clearStale()
  assert.deepEqual(await fs.readdir(path.join(folder, 'cache')), [])
})

test('byte ranges cover whole, open, closed, suffix, and impossible requests', () => {
  assert.deepEqual(byteRange(null, 100), { start: 0, end: 99, partial: false })
  assert.deepEqual(byteRange('bytes=10-', 100), { start: 10, end: 99, partial: true })
  assert.deepEqual(byteRange('bytes=10-19', 100), { start: 10, end: 19, partial: true })
  assert.deepEqual(byteRange('bytes=90-500', 100), { start: 90, end: 99, partial: true })
  assert.deepEqual(byteRange('bytes=-30', 100), { start: 70, end: 99, partial: true })
  assert.equal(byteRange('bytes=100-', 100), null)
  assert.equal(byteRange('bytes=-', 100), null)
  assert.equal(byteRange('items=0-1', 100), null)
})
