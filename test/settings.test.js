import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_SETTINGS, MIN_VOLUME, STORE_KEY, loadSettings, saveSettings } from '../src/settings.js'

const memoryStorage = (initial = {}) => {
  const data = new Map(Object.entries(initial))
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)), data }
}

const brokenStorage = {
  getItem: () => { throw new Error('denied') },
  setItem: () => { throw new Error('quota') },
}

test('settings round-trip through storage', () => {
  const storage = memoryStorage()
  assert.equal(saveSettings({ pos: 2.5, volume: 0.45 }, storage), true)
  assert.deepEqual(loadSettings(storage), { pos: 2.5, volume: 0.45 })
})

test('saved values clamp into range', () => {
  const storage = memoryStorage({ [STORE_KEY]: JSON.stringify({ pos: 9, volume: 4 }) })
  assert.deepEqual(loadSettings(storage), { pos: 4, volume: 1 })
})

test('volume never drops below the 10% minimum', () => {
  const storage = memoryStorage({ [STORE_KEY]: JSON.stringify({ pos: -2, volume: 0 }) })
  assert.deepEqual(loadSettings(storage), { pos: 0, volume: MIN_VOLUME })
})

test('missing, corrupt, or wrongly typed storage falls back to defaults', () => {
  const cases = [undefined, 'not json', 'null', '42', JSON.stringify({ pos: 'x', volume: null })]
  cases.forEach(value => {
    const storage = memoryStorage(value === undefined ? {} : { [STORE_KEY]: value })
    assert.deepEqual(loadSettings(storage), DEFAULT_SETTINGS)
  })
})

test('throwing or absent storage never throws', () => {
  assert.deepEqual(loadSettings(brokenStorage), DEFAULT_SETTINGS)
  assert.deepEqual(loadSettings(null), DEFAULT_SETTINGS)
  assert.equal(saveSettings({ pos: 1, volume: 0.5 }, brokenStorage), false)
  assert.equal(saveSettings({ pos: 1, volume: 0.5 }, null), false)
})
