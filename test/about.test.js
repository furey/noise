import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { TIMER_FADE_MS, TIMER_STEPS } from '../src/ui/timer.js'

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8')
const controls = fs.readFileSync(new URL('../src/ui/controls.js', import.meta.url), 'utf8')
const desktop = fs.readFileSync(new URL('../electron/main.mjs', import.meta.url), 'utf8')
const musicUi = fs.readFileSync(new URL('../src/provider/music-ui.js', import.meta.url), 'utf8')
const about = html.slice(0, html.indexOf('-->'))

const KEYS = [
  { label: 'Space', code: "e.key === ' '" },
  { label: '1 – 5', code: 'digit >= 1' },
  { label: '← →', code: 'ArrowLeft' },
  { label: '↑ ↓', code: 'ArrowUp' },
  { label: 'T ', code: "e.key === 't'" },
  { label: 'W ', code: "e.key === 'w'" },
  { label: 'M ', code: "e.key === 'm'" },
  { label: '? ', code: "e.key === '?'" },
  { label: 'H ', code: "AUTO_HIDE_KEY = 'h'", source: desktop },
  { label: '/ ', code: "event.key !== '/'", source: musicUi },
  { label: '⌘← ⌘→', code: 'ArrowRight: ui => ui.player.next()', source: musicUi },
  { label: 'Esc', code: "e.key === 'Escape'" },
]

test('the source comment comes before the doctype', () => {
  assert.ok(html.startsWith('<!--'))
  assert.ok(html.indexOf('<!doctype html>') > html.indexOf('-->'))
})

test('the source comment lists every key the app handles', () => {
  const keyLines = about.slice(about.indexOf('KEYS'), about.indexOf('WAVE MODE')).trim().split('\n').slice(1)
  assert.equal(keyLines.length, KEYS.length)
  for (const { label, code, source = controls } of KEYS) {
    assert.ok(keyLines.some(line => line.trimStart().startsWith(label)), `missing ${label}`)
    assert.ok(source.includes(code), `the app no longer handles ${label}`)
  }
})

test('the source comment matches the timer settings', () => {
  assert.ok(about.includes(`${TIMER_STEPS.map(step => step.minutes).join(' → ')}min → off`))
  assert.ok(about.includes(`last ${TIMER_FADE_MS / 1000}s`))
})
