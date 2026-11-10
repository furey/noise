import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { TIMER_FADE_MS, TIMER_STEPS } from '../src/ui/timer.js'

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8')
const controls = fs.readFileSync(new URL('../src/ui/controls.js', import.meta.url), 'utf8')
const about = html.slice(0, html.indexOf('-->'))

const KEYS = [
  { label: 'Space', code: "e.key === ' '" },
  { label: '1 – 5', code: 'digit >= 1' },
  { label: '← →', code: 'ArrowLeft' },
  { label: '↑ ↓', code: 'ArrowUp' },
  { label: 'T ', code: "e.key === 't'" },
  { label: 'Esc', code: "e.key === 'Escape'" },
]

test('the source comment comes before the doctype', () => {
  assert.ok(html.startsWith('<!--'))
  assert.ok(html.indexOf('<!doctype html>') > html.indexOf('-->'))
})

test('the source comment lists every key the app handles', () => {
  const keyLines = about.slice(about.indexOf('KEYS'), about.indexOf('WAVE MODE')).trim().split('\n').slice(1)
  assert.equal(keyLines.length, KEYS.length)
  for (const { label, code } of KEYS) {
    assert.ok(keyLines.some(line => line.trimStart().startsWith(label)), `missing ${label}`)
    assert.ok(controls.includes(code), `controls no longer handle ${label}`)
  }
})

test('the source comment matches the timer settings', () => {
  assert.ok(about.includes(`${TIMER_STEPS.map(step => step.minutes).join(' → ')}min → off`))
  assert.ok(about.includes(`last ${TIMER_FADE_MS / 1000}s`))
})
