import { test } from 'node:test'
import assert from 'node:assert/strict'
import { menuState, runCommand } from '../src/ui/commands.js'
import { COLOUR_LABELS, MUSIC_LABELS, TIMER_CHOICES, controlsMenu, usableMenuState } from '../electron/controls-menu.mjs'

const fakeApp = (state = {}) => {
  const calls = []
  const record = name => (...args) => calls.push([name, ...args])
  return {
    calls,
    state: { playing: false, pos: 2, wave: false, timer: { left: 0, fading: false }, track: { status: 'idle' }, ...state },
    musicStep: () => 3,
    togglePlay: record('togglePlay'),
    stop: record('stop'),
    selectColour: record('selectColour'),
    nudgePos: record('nudgePos'),
    nudgeVolume: record('nudgeVolume'),
    toggleWave: record('toggleWave'),
    chooseMusic: record('chooseMusic'),
    cycleMusic: record('cycleMusic'),
    chooseTimer: record('chooseTimer'),
    cycleTimer: record('cycleTimer'),
  }
}

test('each menu command calls the matching app action', () => {
  const app = fakeApp()
  const commands = ['play', 'stop', 'colour:4', 'colour-down', 'colour-up', 'volume-up', 'volume-down', 'wave', 'music:2', 'music-next', 'timer:20', 'timer-next']
  commands.forEach(command => runCommand(app, command))
  assert.deepEqual(app.calls, [
    ['togglePlay'], ['stop'], ['selectColour', 4], ['nudgePos', -1], ['nudgePos', 1], ['nudgeVolume', 1], ['nudgeVolume', -1],
    ['toggleWave'], ['chooseMusic', 2], ['cycleMusic'], ['chooseTimer', 20], ['cycleTimer'],
  ])
})

test('an unknown menu command does nothing', () => {
  const app = fakeApp()
  runCommand(app, 'format-disk')
  assert.deepEqual(app.calls, [])
})

test('the menu state names the colour only when the slider sits on one', () => {
  assert.equal(menuState(fakeApp({ pos: 2 })).colour, 2)
  assert.equal(menuState(fakeApp({ pos: 2.25 })).colour, -1)
  assert.deepEqual(menuState(fakeApp({ playing: true, wave: true, timer: { left: 25 * 60000, fading: false } })),
    { playing: true, colour: 2, wave: true, music: 3, timer: 3, song: false })
  assert.equal(menuState(fakeApp({ track: { status: 'loading' } })).song, true)
})

test('the main process accepts only menu state values it can show', () => {
  assert.deepEqual(usableMenuState({ playing: true, colour: 4, wave: true, music: 4, timer: 3, song: true }), { playing: true, colour: 4, wave: true, music: 4, timer: 3, song: true })
  assert.deepEqual(usableMenuState({ playing: 'yes', colour: 9, wave: 1, music: -2, timer: 7, song: 1 }), { playing: false, colour: -1, wave: false, music: -1, timer: 0, song: false })
  assert.deepEqual(usableMenuState(null), { playing: false, colour: -1, wave: false, music: -1, timer: 0, song: false })
})

test('the Controls menu ticks the current choices and shows each key', () => {
  const sent = []
  const menu = controlsMenu({ state: usableMenuState({ playing: true, colour: 1, wave: true, music: 2, timer: 1 }), send: command => sent.push(command), refresh: () => sent.push('refresh') })
  const items = menu.submenu.filter(item => item.label)
  const byLabel = label => items.find(item => item.label === label)
  assert.equal(byLabel('Pause').accelerator, 'Space')
  assert.deepEqual(COLOUR_LABELS.map(label => byLabel(label).checked), [false, true, false, false, false])
  assert.deepEqual(COLOUR_LABELS.map(label => byLabel(label).accelerator), ['1', '2', '3', '4', '5'])
  assert.equal(byLabel('Wave Mode').checked, true)
  assert.deepEqual(byLabel('Music').submenu.map(item => item.checked), MUSIC_LABELS.map((_, step) => step === 2))
  assert.deepEqual(byLabel('Sleep Timer').submenu.map(item => item.checked), TIMER_CHOICES.map(({ size }) => size === 1))
  assert.ok(items.every(item => item.submenu || item.registerAccelerator === false))
  byLabel('Wave Mode').click(null, null, { triggeredByAccelerator: false })
  byLabel('Wave Mode').click(null, null, { triggeredByAccelerator: true })
  assert.deepEqual(sent, ['wave', 'refresh'])
})

test('the song items show only with music, take their keys, and turn on only during a song', () => {
  const sent = []
  const songItems = song => controlsMenu({ state: usableMenuState({ song }), send: command => sent.push(command), refresh: () => sent.push('refresh'), musicReady: true })
    .submenu.filter(item => item.label?.endsWith(' Song'))
  assert.deepEqual(songItems(true).map(({ label, accelerator, enabled }) => ({ label, accelerator, enabled })), [
    { label: 'Next Song', accelerator: 'CmdOrCtrl+Right', enabled: true },
    { label: 'Previous Song', accelerator: 'CmdOrCtrl+Left', enabled: true },
  ])
  assert.deepEqual(songItems(false).map(item => item.enabled), [false, false])
  assert.equal(controlsMenu({ state: usableMenuState({ song: true }), send: () => {}, refresh: () => {} }).submenu.some(item => item.label === 'Next Song'), false)
  const [next, previous] = songItems(true)
  next.click(null, null, { triggeredByAccelerator: false })
  previous.click(null, null, { triggeredByAccelerator: false })
  next.click(null, null, { triggeredByAccelerator: true })
  assert.deepEqual(sent, ['next-song', 'previous-song', 'refresh'])
})

test('an open search takes the song keys off the menu', () => {
  const items = controlsMenu({ state: usableMenuState({ song: true }), send: () => {}, refresh: () => {}, musicReady: true, searchOpen: true }).submenu
  assert.equal(items.find(item => item.label === 'Next Song').accelerator, undefined)
})
