import { test } from 'node:test'
import assert from 'node:assert/strict'
import { FOCUS_CLICK_MS, ignoreFocusClicks, isFocusClick } from '../src/ui/focus-click.js'

const createPage = () => {
  const target = new EventTarget()
  const clock = { time: 1000, now: () => clock.time }
  const heard = []
  ignoreFocusClicks(target, clock)
  for (const type of ['pointerdown', 'pointermove', 'pointerup', 'click']) target.addEventListener(type, () => heard.push(type))
  const fire = type => target.dispatchEvent(new Event(type, { cancelable: true }))
  return { clock, heard, fire, focus: () => target.dispatchEvent(new Event('focus')) }
}

const clickThrough = fire => ['pointerdown', 'pointermove', 'pointerup', 'click'].forEach(fire)

test('a press right after the window gets focus counts as a focus click', () => {
  assert.equal(isFocusClick({ focusedAt: 1000, now: 1000 + FOCUS_CLICK_MS - 1 }), true)
  assert.equal(isFocusClick({ focusedAt: 1000, now: 1000 + FOCUS_CLICK_MS }), false)
  assert.equal(isFocusClick({ focusedAt: -Infinity, now: 0 }), false)
})

test('the click that focuses the window does not reach the app', () => {
  const { clock, heard, fire, focus } = createPage()
  focus()
  clock.time += 5
  clickThrough(fire)
  assert.deepEqual(heard, [])
  fire('pointermove')
  assert.deepEqual(heard, ['pointermove'])
})

test('the next click after a focus click reaches the app', () => {
  const { clock, heard, fire, focus } = createPage()
  focus()
  clickThrough(fire)
  clock.time += 1000
  clickThrough(fire)
  assert.deepEqual(heard, ['pointerdown', 'pointermove', 'pointerup', 'click'])
})

test('clicks in a window that already has focus reach the app', () => {
  const { heard, fire } = createPage()
  clickThrough(fire)
  assert.deepEqual(heard, ['pointerdown', 'pointermove', 'pointerup', 'click'])
})
