import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { helpFor, placeOf } from '../src/help/place.js'
import { helpText } from '../src/help/render.js'

const SAMPLE = [
  'KEYS',
  '  Space ...... play or pause',
  '  H .......... auto-hide controls [desktop]',
  '  / .......... search music [desktop] [music]',
  '',
  'DESKTOP APP [desktop]',
  '  Always on top.',
  '  Search a song. [music]',
].join('\n')

const WEB = { desktop: false, music: false }
const DESKTOP = { desktop: true, music: false }
const DESKTOP_WITH_DRIVER = { desktop: true, music: true }

test('the website shows no desktop or music lines', () => {
  assert.equal(helpFor(SAMPLE, WEB), 'KEYS\n  Space ...... play or pause')
})

test('the desktop app shows desktop lines without the music ones until a driver is installed', () => {
  assert.equal(helpFor(SAMPLE, DESKTOP), 'KEYS\n  Space ...... play or pause\n  H .......... auto-hide controls\n\nDESKTOP APP\n  Always on top.')
  assert.equal(helpFor(SAMPLE, DESKTOP_WITH_DRIVER),
    'KEYS\n  Space ...... play or pause\n  H .......... auto-hide controls\n  / .......... search music\n\nDESKTOP APP\n  Always on top.\n  Search a song.')
})

test('the place comes from the help address', () => {
  assert.deepEqual(placeOf('?v=1.1.0&desktop=1&music=1'), DESKTOP_WITH_DRIVER)
  assert.deepEqual(placeOf('?v=1.1.0&desktop=1&music=0'), DESKTOP)
  assert.deepEqual(placeOf(''), WEB)
})

test('no marker is left in the help text for any place', () => {
  const text = helpText(fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8'))
  for (const place of [WEB, DESKTOP, DESKTOP_WITH_DRIVER]) assert.doesNotMatch(helpFor(text, place), /\[(desktop|music)\]/)
  assert.doesNotMatch(helpFor(text, WEB), /DESKTOP APP|auto-hide|search music/)
})
