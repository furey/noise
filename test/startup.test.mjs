import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import electronBinary from 'electron'
import { _electron as electron } from 'playwright-core'

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const packagedExecutable = process.env.NOISE_E2E_EXECUTABLE
const APP_URL_PREFIX = 'app://noise/'
const VISIBLE_WITHIN_MS = 30000
const SOUND_WITHIN_MS = 15000
const EXIT_WITHIN_MS = 30000
const STOP_WITHIN_MS = 5000
const TEST_TIMEOUT_MS = 120000

let tmpRoot = null

before(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'noise-startup-'))
})

after(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 }).catch(() => {})
})

test('the window opens on app://noise/ with no console errors, CSP violations, or network requests', { timeout: TEST_TIMEOUT_MS }, async () => {
  await withApp(async ({ app, page, watch }) => {
    assert.ok(page.url().startsWith(APP_URL_PREFIX), page.url())
    assert.equal(await page.title(), 'Noise')
    assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length), 1)
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains('desktop')), true)
    assert.equal(await page.evaluate(() => navigator.serviceWorker.controller), null)
    assert.deepEqual(watch.errors, [])
    assert.deepEqual(await page.evaluate(() => window.__noiseTest.csp), [])
    assert.deepEqual(watch.requests.filter(url => !url.startsWith(APP_URL_PREFIX)), [])
  })
})

test('the Mac title bar strip drags the window and leaves the timer clickable', { timeout: TEST_TIMEOUT_MS, skip: process.platform !== 'darwin' && 'macOS only' }, async () => {
  await withApp(async ({ page }) => {
    const regions = await page.evaluate(() => ({
      strip: getComputedStyle(document.querySelector('.titlebar')).getPropertyValue('-webkit-app-region'),
      timer: getComputedStyle(document.getElementById('timer')).getPropertyValue('-webkit-app-region'),
    }))
    assert.deepEqual(regions, { strip: 'drag', timer: 'no-drag' })
  })
})

test('tapping the synth starts audio that is not silent', { timeout: TEST_TIMEOUT_MS }, async () => {
  await withApp(async ({ page, watch }) => {
    await page.click('#surface')
    await waitFor({ page, ms: SOUND_WITHIN_MS, what: 'non-silent running audio', check: () => window.__noiseTest.sounding() })
    assert.equal(await page.evaluate(() => document.body.classList.contains('playing')), true)
    assert.deepEqual(watch.errors, [])
  })
})

test('music alone plays sound with the noise turned off', { timeout: TEST_TIMEOUT_MS }, async () => {
  await withApp(async ({ page, watch }) => {
    await page.keyboard.press('m')
    await delay(3000)
    assert.equal(await page.evaluate(() => window.__noiseTest.analysers[0].context.state), 'running')
    await waitFor({ page, ms: SOUND_WITHIN_MS, what: 'non-silent music', check: () => window.__noiseTest.sounding() })
    assert.equal(await page.evaluate(() => document.getElementById('music').getAttribute('aria-label')), 'Music alone: Liquid')
    assert.deepEqual(watch.errors, [])
  })
})

test('an interrupted audio output shows as paused, and the next tap plays again', { timeout: TEST_TIMEOUT_MS }, async () => {
  await withApp(async ({ page, watch }) => {
    await page.click('#surface')
    await waitFor({ page, ms: SOUND_WITHIN_MS, what: 'non-silent running audio', check: () => window.__noiseTest.sounding() })
    await page.evaluate(() => window.__noiseTest.analysers[0].context.suspend())
    await waitFor({ page, ms: STOP_WITHIN_MS, what: 'the paused state after a suspended context', check: () => !document.body.classList.contains('playing') })
    await page.click('#surface')
    await waitFor({ page, ms: SOUND_WITHIN_MS, what: 'audio after the interruption', check: () => window.__noiseTest.sounding() })
    await page.evaluate(() => window.__noiseTest.elements.forEach(element => element.pause()))
    await waitFor({ page, ms: STOP_WITHIN_MS, what: 'the paused state after a paused output', check: () => !document.body.classList.contains('playing') })
    assert.equal(await page.evaluate(() => window.__noiseTest.contexts.size), 1)
    assert.deepEqual(watch.errors, [])
  })
})

test('background throttling stays on so a minimised window stops drawing', { timeout: TEST_TIMEOUT_MS }, async () => {
  await withApp(async ({ app }) => {
    assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.getBackgroundThrottling()), true)
  })
})

test('navigation away from app://noise and new windows are blocked', { timeout: TEST_TIMEOUT_MS }, async () => {
  await withApp(async ({ app, page, watch }) => {
    await page.evaluate(() => {
      location.href = 'https://example.com/'
    })
    await delay(1000)
    assert.ok(page.url().startsWith(APP_URL_PREFIX), page.url())
    assert.equal(await page.evaluate(() => window.open('https://example.com/')), null)
    await delay(500)
    assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length), 1)
    assert.deepEqual(watch.requests.filter(url => !url.startsWith(APP_URL_PREFIX)), [])
  })
})

test('a second start focuses the open window and quits', { timeout: TEST_TIMEOUT_MS }, async () => {
  await withApp(async ({ app, userData }) => {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].minimize())
    const { code } = await runUntilExit({ userData })
    assert.equal(code, 0)
    await waitForApp({ app, what: 'the window restored', check: ({ BrowserWindow }) => !BrowserWindow.getAllWindows()[0].isMinimized() })
    assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length), 1)
  })
})

test('a first start pins the window on top, and turning Always on Top off survives a restart', { timeout: TEST_TIMEOUT_MS }, async () => {
  const userData = await withApp(async ({ app, userData }) => {
    assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isAlwaysOnTop()), true)
    assert.equal(await app.evaluate(({ Menu }) => Menu.getApplicationMenu().getMenuItemById('always-on-top').checked), true)
    await app.evaluate(({ Menu }) => Menu.getApplicationMenu().getMenuItemById('always-on-top').click())
    assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isAlwaysOnTop()), false)
    return userData
  })
  await withApp(async ({ app }) => {
    assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isAlwaysOnTop()), false)
    assert.equal(await app.evaluate(({ Menu }) => Menu.getApplicationMenu().getMenuItemById('always-on-top').checked), false)
  }, userData)
})

test('Auto-Hide Controls starts on, turns off with one H press, and survives a restart', { timeout: TEST_TIMEOUT_MS }, async () => {
  const userData = await withApp(async ({ app, userData }) => {
    assert.equal(await app.evaluate(({ Menu }) => Menu.getApplicationMenu().getMenuItemById('auto-hide-controls').checked), true)
    await pressKey({ app, keyCode: 'H' })
    assert.equal(await app.evaluate(({ Menu }) => Menu.getApplicationMenu().getMenuItemById('auto-hide-controls').checked), false)
    await pressKey({ app, keyCode: 'H' })
    assert.equal(await app.evaluate(({ Menu }) => Menu.getApplicationMenu().getMenuItemById('auto-hide-controls').checked), true)
    await app.evaluate(({ Menu }) => Menu.getApplicationMenu().getMenuItemById('auto-hide-controls').click())
    return userData
  })
  await withApp(async ({ app }) => {
    assert.equal(await app.evaluate(({ Menu }) => Menu.getApplicationMenu().getMenuItemById('auto-hide-controls').checked), false)
  }, userData)
})

test('Park Window shrinks the window into the lower-right corner, and Unpark Window restores it', { timeout: TEST_TIMEOUT_MS }, async () => {
  await withApp(async ({ app }) => {
    const before = await windowBounds(app)
    const expected = await app.evaluate(({ BrowserWindow, screen }) => {
      const { workArea } = screen.getDisplayMatching(BrowserWindow.getAllWindows()[0].getBounds())
      return { x: workArea.x + workArea.width - 280 - 48, y: workArea.y + workArea.height - 220 - 48, width: 280, height: 220 }
    })
    await clickParkWindow(app)
    await waitForBounds({ app, what: 'the parked bounds', expected })
    await clickParkWindow(app)
    await waitForBounds({ app, what: 'the bounds before parking', expected: before })
  })
})

test('a park survives a restart, and Unpark Window brings the old bounds back', { timeout: TEST_TIMEOUT_MS }, async () => {
  let before = null
  const userData = await withApp(async ({ app, userData }) => {
    before = await windowBounds(app)
    await clickParkWindow(app)
    await waitForBounds({ app, what: 'the parked bounds', expected: await parkedTarget(app) })
    return userData
  })
  await withApp(async ({ app }) => {
    assert.equal(await parkLabel(app), 'Unpark Window')
    await clickParkWindow(app)
    await waitForBounds({ app, what: 'the bounds before parking', expected: before })
  }, userData)
})

test('Unpark Window gives the centred default size when the saved restore bounds are unusable', { timeout: TEST_TIMEOUT_MS }, async () => {
  const userData = await withApp(async ({ app, userData }) => {
    await clickParkWindow(app)
    await waitForBounds({ app, what: 'the parked bounds', expected: await parkedTarget(app) })
    return userData
  })
  const statePath = path.join(userData, 'window-state.json')
  const saved = JSON.parse(await fs.readFile(statePath, 'utf8'))
  await fs.writeFile(statePath, JSON.stringify({ ...saved, park: { x: 0, y: 0, width: 10, height: 10 } }))
  await withApp(async ({ app }) => {
    assert.equal(await parkLabel(app), 'Unpark Window')
    const expected = await app.evaluate(({ BrowserWindow, screen }) => {
      const { workArea } = screen.getDisplayMatching(BrowserWindow.getAllWindows()[0].getBounds())
      return { x: workArea.x + Math.round((workArea.width - 800) / 2), y: workArea.y + Math.round((workArea.height - 600) / 2), width: 800, height: 600 }
    })
    await clickParkWindow(app)
    await waitForBounds({ app, what: 'the centred default bounds', expected })
  }, userData)
})

test('Reset Window ends a park and gives the centred default size', { timeout: TEST_TIMEOUT_MS }, async () => {
  await withApp(async ({ app }) => {
    await clickParkWindow(app)
    await waitForBounds({ app, what: 'the parked bounds', expected: await parkedTarget(app) })
    await app.evaluate(({ Menu }) => Menu.getApplicationMenu().getMenuItemById('reset-window').click())
    await waitForBounds({ app, what: 'the centred default bounds', expected: await centredDefault(app) })
    assert.equal(await parkLabel(app), 'Park Window')
  })
})

const centredDefault = app => app.evaluate(({ BrowserWindow, screen }) => {
  const { workArea } = screen.getDisplayMatching(BrowserWindow.getAllWindows()[0].getBounds())
  return { x: workArea.x + Math.round((workArea.width - 800) / 2), y: workArea.y + Math.round((workArea.height - 600) / 2), width: 800, height: 600 }
})

const parkedTarget = app => app.evaluate(({ BrowserWindow, screen }) => {
  const { workArea } = screen.getDisplayMatching(BrowserWindow.getAllWindows()[0].getBounds())
  return { x: workArea.x + workArea.width - 280 - 48, y: workArea.y + workArea.height - 220 - 48, width: 280, height: 220 }
})

const parkLabel = app => app.evaluate(({ Menu }) => Menu.getApplicationMenu().getMenuItemById('park-window').label)

const windowBounds = app => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds())

const clickParkWindow = app => app.evaluate(({ Menu }) => Menu.getApplicationMenu().getMenuItemById('park-window').click())

const waitForBounds = async ({ app, what, expected }) => {
  const deadline = Date.now() + VISIBLE_WITHIN_MS
  while (Date.now() < deadline) {
    const actual = await windowBounds(app)
    if (Object.keys(expected).every(key => actual[key] === expected[key])) return
    await delay(100)
  }
  throw new Error(`No ${what} within ${VISIBLE_WITHIN_MS} ms`)
}

test('on a first start, playing with the pointer outside hides the Mac window buttons', { timeout: TEST_TIMEOUT_MS, skip: process.platform !== 'darwin' && 'macOS only' }, async () => {
  await withApp(async ({ app, page }) => {
    await spyOnWindowButtons(app)
    await page.click('#surface')
    await waitFor({ page, ms: SOUND_WITHIN_MS, what: 'non-silent running audio', check: () => window.__noiseTest.sounding() })
    await waitForApp({ app, what: 'the window buttons hidden', check: () => globalThis.buttonCalls.at(-1) === false })
    await page.keyboard.press('Space')
    await waitForApp({ app, what: 'the window buttons shown after pause', check: () => globalThis.buttonCalls.at(-1) === true })
  })
})

test('Auto-Hide Controls saved as on hides the Mac window buttons after a restart', { timeout: TEST_TIMEOUT_MS, skip: process.platform !== 'darwin' && 'macOS only' }, async () => {
  const userData = await withApp(async ({ userData }) => userData)
  await withApp(async ({ app, page }) => {
    await spyOnWindowButtons(app)
    await page.click('#surface')
    await waitFor({ page, ms: SOUND_WITHIN_MS, what: 'non-silent running audio', check: () => window.__noiseTest.sounding() })
    await waitForApp({ app, what: 'the window buttons hidden', check: () => globalThis.buttonCalls.at(-1) === false })
  }, userData)
})

test('with no music driver, music search stays off and has no handler', { timeout: TEST_TIMEOUT_MS }, async () => {
  await withApp(async ({ page }) => {
    await delay(1000)
    assert.equal(await page.evaluate(() => document.documentElement.hasAttribute('data-music')), false)
    await assert.rejects(page.evaluate(() => window.noiseDesktop.music.search('anything')), /No handler registered/)
    await assert.rejects(page.evaluate(() => window.noiseDesktop.music.play({ id: 'x', title: 'X' })), /No handler registered/)
  })
})

test('a valid music driver turns music search on and answers searches', { timeout: TEST_TIMEOUT_MS }, async () => {
  const musicDir = await copyFixture('music-driver')
  await withApp(async ({ page }) => {
    await waitFor({ page, ms: STOP_WITHIN_MS, what: 'music search turned on', check: () => document.documentElement.hasAttribute('data-music') })
    assert.deepEqual(await page.evaluate(() => window.noiseDesktop.music.search('  says ')),
      { tracks: [{ id: 'fake-1', title: 'Fake says', artist: 'Fixture', durationS: 3 }] })
    assert.equal((await page.evaluate(() => window.noiseDesktop.music.search('nothing'))).error.code, 'not-found')
    const [first, second] = await page.evaluate(() => Promise.all(['slow', 'quick'].map(query => window.noiseDesktop.music.search(query))))
    assert.equal(first.error.code, 'cancelled')
    assert.equal(second.tracks[0].title, 'Fake quick')
  }, undefined, musicDir)
})

test('a played track streams through the app with byte ranges and loads as audio', { timeout: TEST_TIMEOUT_MS }, async () => {
  const musicDir = await copyFixture('music-driver')
  await withApp(async ({ page }) => {
    await waitFor({ page, ms: STOP_WITHIN_MS, what: 'music search turned on', check: () => document.documentElement.hasAttribute('data-music') })
    const played = await page.evaluate(() => window.noiseDesktop.music.play({ id: 'fake-1', title: 'Fake' }))
    assert.match(played.url, /^app:\/\/noise\/stream\/[0-9a-f]{32}$/)
    assert.deepEqual(played.track, { id: 'fake-1', title: 'Fake', artist: 'Fixture Artist', durationS: 20 })
    const answers = await page.evaluate(async url => {
      const whole = await fetch(url)
      const part = await fetch(url, { headers: { Range: 'bytes=0-99' } })
      const missing = await fetch(url.replace(/[0-9a-f]{32}$/, '0'.repeat(32)))
      const audio = new Audio(url)
      await new Promise((resolve, reject) => {
        audio.addEventListener('loadedmetadata', resolve)
        audio.addEventListener('error', () => reject(new Error(`audio error ${audio.error?.code}`)))
      })
      return {
        whole: { status: whole.status, type: whole.headers.get('content-type'), bytes: (await whole.arrayBuffer()).byteLength },
        part: { status: part.status, range: part.headers.get('content-range'), bytes: (await part.arrayBuffer()).byteLength },
        missing: missing.status,
        duration: Math.round(audio.duration),
      }
    }, played.url)
    assert.deepEqual(answers, {
      whole: { status: 200, type: 'audio/wav', bytes: 320044 },
      part: { status: 206, range: 'bytes 0-99/320044', bytes: 100 },
      missing: 404,
      duration: 20,
    })
  }, undefined, musicDir)
})

test('an expired stream link is renewed once from the driver', { timeout: TEST_TIMEOUT_MS }, async () => {
  const musicDir = await copyFixture('music-driver')
  await withApp(async ({ page }) => {
    await waitFor({ page, ms: STOP_WITHIN_MS, what: 'music search turned on', check: () => document.documentElement.hasAttribute('data-music') })
    const status = await page.evaluate(async () => {
      const { url } = await window.noiseDesktop.music.play({ id: 'expiring', title: 'Expiring' })
      return (await fetch(url)).status
    })
    assert.equal(status, 200)
    const log = await logOnceMatching({ musicDir, pattern: /stream expiring \d/g, count: 2 })
    assert.deepEqual(log.match(/stream expiring \d/g), ['stream expiring 1', 'stream expiring 2'])
  }, undefined, musicDir)
})

test('a played song is cached, replays from the cache, and falls back when the file goes', { timeout: TEST_TIMEOUT_MS }, async () => {
  const musicDir = await copyFixture('music-driver')
  await withApp(async ({ page }) => {
    await waitFor({ page, ms: STOP_WITHIN_MS, what: 'music search turned on', check: () => document.documentElement.hasAttribute('data-music') })
    const first = await page.evaluate(() => window.noiseDesktop.music.play({ id: 'fake-1', title: 'Fake', artist: 'Fixture' }))
    assert.equal(first.cached, false)
    await waitFor({ page, ms: STOP_WITHIN_MS, what: 'the song in the cache', check: async () => (await window.noiseDesktop.music.cached()).entries.some(entry => entry.track.id === 'fake-1') })
    const { entries } = await page.evaluate(() => window.noiseDesktop.music.cached())
    assert.deepEqual(entries.find(entry => entry.track.id === 'fake-1').track, { id: 'fake-1', title: 'Fake', artist: 'Fixture Artist', durationS: 20 })
    const again = await page.evaluate(() => window.noiseDesktop.music.play({ id: 'fake-1', title: 'Fake' }))
    assert.equal(again.cached, true)
    const part = await page.evaluate(async url => {
      const answer = await fetch(url, { headers: { Range: 'bytes=44-143' } })
      return { status: answer.status, range: answer.headers.get('content-range'), type: answer.headers.get('content-type'), bytes: (await answer.arrayBuffer()).byteLength }
    }, again.url)
    assert.deepEqual(part, { status: 206, range: 'bytes 44-143/320044', type: 'audio/wav', bytes: 100 })
    await fs.rm(path.join(musicDir, 'cache', 'fake-1'), { recursive: true })
    assert.equal(await page.evaluate(async url => (await fetch(url)).status, again.url), 200)
    const log = await logOnceMatching({ musicDir, pattern: /(stream|download) fake-1 ?\d*/g, count: 3 })
    assert.deepEqual(log.match(/(stream|download) fake-1 ?\d*/g), ['stream fake-1 1', 'download fake-1', 'stream fake-1 2'])
  }, undefined, musicDir)
})

const songStatus = page => page.evaluate(() => window.__noiseTest.track())

const playSong = async (page, track) => {
  await page.evaluate(song => window.__noiseTest.player.play(song), track)
  await waitForSong(page, track.id)
}

const waitForSong = (page, id) => waitFor({ page, ms: SOUND_WITHIN_MS, what: `${id} sounding`, check: song => window.__noiseTest.track().status === 'active' && window.__noiseTest.track().current.id === song, arg: id })

test('a song plays through the app sound and pauses and resumes with Space', { timeout: TEST_TIMEOUT_MS }, async () => {
  const musicDir = await copyFixture('music-driver')
  await withApp(async ({ page }) => {
    await waitFor({ page, ms: STOP_WITHIN_MS, what: 'music search turned on', check: () => document.documentElement.hasAttribute('data-music') })
    await playSong(page, { id: 'fake-1', title: 'Fake' })
    await waitFor({ page, ms: SOUND_WITHIN_MS, what: 'the song in the analyser', check: () => window.__noiseTest.sounding() })
    await page.keyboard.press('Space')
    await waitFor({ page, ms: STOP_WITHIN_MS, what: 'the paused song', check: () => !document.body.classList.contains('playing') })
    await delay(200)
    const pausedAt = (await page.evaluate(() => window.__noiseTest.trackTime())).current
    await delay(500)
    const stillAt = (await page.evaluate(() => window.__noiseTest.trackTime())).current
    assert.ok(stillAt - pausedAt < 0.05, `the paused song moved from ${pausedAt} to ${stillAt}`)
    await page.keyboard.press('Space')
    await waitFor({ page, ms: STOP_WITHIN_MS, what: 'the resumed song', check: paused => window.__noiseTest.trackTime().current > paused, arg: pausedAt })
    assert.equal((await songStatus(page)).current.id, 'fake-1')
  }, undefined, musicDir)
})

test('during a song, W, M, and colour keys do nothing, and the arrows seek', { timeout: TEST_TIMEOUT_MS }, async () => {
  const musicDir = await copyFixture('music-driver')
  await withApp(async ({ app, page }) => {
    await waitFor({ page, ms: STOP_WITHIN_MS, what: 'music search turned on', check: () => document.documentElement.hasAttribute('data-music') })
    await playSong(page, { id: 'fake-1', title: 'Fake' })
    for (const key of ['w', 'm', '3']) await page.keyboard.press(key)
    await delay(300)
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains('wave')), false)
    assert.deepEqual(await app.evaluate(({ Menu }) => {
      const controls = Menu.getApplicationMenu().items.find(item => item.label === 'Controls').submenu.items
      return { brown: controls.find(item => item.label === 'Brown').checked, musicOff: controls.find(item => item.label === 'Music').submenu.items[0].checked }
    }), { brown: true, musicOff: true })
    const before = (await page.evaluate(() => window.__noiseTest.trackTime())).current
    await page.keyboard.press('ArrowRight')
    const after = (await page.evaluate(() => window.__noiseTest.trackTime())).current
    assert.ok(after - before >= 9, `seeked from ${before} to ${after}`)
    assert.equal((await songStatus(page)).current.id, 'fake-1')
  }, undefined, musicDir)
})

test('the next song plays when a song ends', { timeout: TEST_TIMEOUT_MS }, async () => {
  const musicDir = await copyFixture('music-driver')
  await withApp(async ({ page }) => {
    await waitFor({ page, ms: STOP_WITHIN_MS, what: 'music search turned on', check: () => document.documentElement.hasAttribute('data-music') })
    await playSong(page, { id: 'fake-1', title: 'Fake' })
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    await waitFor({ page, ms: SOUND_WITHIN_MS, what: 'the next song sounding', check: () => window.__noiseTest.track().current?.id === 'fake-2' && window.__noiseTest.track().status === 'active' })
  }, undefined, musicDir)
})

test('an album search plays the album in order and repeats it from the first song', { timeout: TEST_TIMEOUT_MS }, async () => {
  const musicDir = await copyFixture('music-driver')
  await withApp(async ({ page }) => {
    await waitFor({ page, ms: STOP_WITHIN_MS, what: 'music search turned on', check: () => document.documentElement.hasAttribute('data-music') })
    await page.keyboard.press('/')
    await page.keyboard.type('fixture album')
    await waitFor({ page, ms: STOP_WITHIN_MS, what: 'the album row', check: () => document.querySelector('.music-row.album') !== null })
    assert.deepEqual(await page.evaluate(() => [...document.querySelector('.music-row.album').children].map(part => part.textContent)),
      ['', 'Album', 'Fixture Album · Fixture', '', '3 songs'])
    await page.keyboard.press('Enter')
    for (const id of ['side-1', 'side-2', 'side-3']) {
      await waitForSong(page, id)
      await page.keyboard.press('ArrowRight')
      await page.keyboard.press('ArrowRight')
    }
    await waitForSong(page, 'side-1')
    await playSong(page, { id: 'fake-1', title: 'Fake' })
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    await waitFor({ page, ms: SOUND_WITHIN_MS, what: 'the radio song after a single song', check: () => window.__noiseTest.track().current?.id === 'fake-2' && window.__noiseTest.track().status === 'active' })
  }, undefined, musicDir)
})

const SKIP_MODIFIER = process.platform === 'darwin' ? 'Meta' : 'Control'

const skipSong = (page, arrow) => page.keyboard.press(`${SKIP_MODIFIER}+${arrow}`)

test('Next and Previous step through an album, wrap at both ends, and Previous restarts a song after 3 s', { timeout: TEST_TIMEOUT_MS }, async () => {
  const musicDir = await copyFixture('music-driver')
  await withApp(async ({ app, page }) => {
    await waitFor({ page, ms: STOP_WITHIN_MS, what: 'music search turned on', check: () => document.documentElement.hasAttribute('data-music') })
    await searchAndEnter(page, 'fixture album')
    await waitForSong(page, 'side-1')
    await waitForApp({ app, what: 'the song items enabled', check: ({ Menu }) =>
      Menu.getApplicationMenu().items.find(item => item.label === 'Controls').submenu.items.filter(item => item.label?.endsWith(' Song')).every(item => item.enabled) })
    await skipSong(page, 'ArrowLeft')
    await waitForSong(page, 'side-3')
    await skipSong(page, 'ArrowRight')
    await waitForSong(page, 'side-1')
    await skipSong(page, 'ArrowRight')
    await waitForSong(page, 'side-2')
    await page.keyboard.press('ArrowRight')
    assert.ok((await page.evaluate(() => window.__noiseTest.trackTime())).current > 3)
    await skipSong(page, 'ArrowLeft')
    await waitFor({ page, ms: STOP_WITHIN_MS, what: 'side-2 restarted', check: () => window.__noiseTest.trackTime().current < 2 && window.__noiseTest.track().current.id === 'side-2' })
    await page.keyboard.press('ArrowLeft')
    await skipSong(page, 'ArrowLeft')
    await waitForSong(page, 'side-1')
    await app.evaluate(({ Menu }) => Menu.getApplicationMenu().items.find(item => item.label === 'Controls').submenu.items.find(item => item.label === 'Next Song').click())
    await waitForSong(page, 'side-2')
  }, undefined, musicDir)
})

test('Previous in radio play goes back to the song before, and Next returns without losing the queue', { timeout: TEST_TIMEOUT_MS }, async () => {
  const musicDir = await copyFixture('music-driver')
  await withApp(async ({ page }) => {
    await waitFor({ page, ms: STOP_WITHIN_MS, what: 'music search turned on', check: () => document.documentElement.hasAttribute('data-music') })
    await playSong(page, { id: 'fake-1', title: 'Fake' })
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    await waitForSong(page, 'fake-2')
    await page.keyboard.press('ArrowLeft')
    await skipSong(page, 'ArrowLeft')
    await waitForSong(page, 'fake-1')
    await skipSong(page, 'ArrowRight')
    await waitForSong(page, 'fake-2')
    await skipSong(page, 'ArrowRight')
    await waitForSong(page, 'fake-3')
  }, undefined, musicDir)
})

test('two quick Next presses end on the third song, audible and not faded to silence', { timeout: TEST_TIMEOUT_MS }, async () => {
  const musicDir = await copyFixture('music-driver')
  await withApp(async ({ page }) => {
    await waitFor({ page, ms: STOP_WITHIN_MS, what: 'music search turned on', check: () => document.documentElement.hasAttribute('data-music') })
    await playSong(page, { id: 'fake-1', title: 'Fake' })
    await waitFor({ page, ms: SOUND_WITHIN_MS, what: 'the song in the analyser', check: () => window.__noiseTest.sounding() })
    await skipSong(page, 'ArrowRight')
    await skipSong(page, 'ArrowRight')
    await waitForSong(page, 'fake-3')
    await waitFor({ page, ms: SOUND_WITHIN_MS, what: 'the third song in the analyser', check: () => window.__noiseTest.sounding() })
  }, undefined, musicDir)
})

test('the song keys edit the text in an open search field and change songs once it closes', { timeout: TEST_TIMEOUT_MS }, async () => {
  const musicDir = await copyFixture('music-driver')
  await withApp(async ({ page }) => {
    await waitFor({ page, ms: STOP_WITHIN_MS, what: 'music search turned on', check: () => document.documentElement.hasAttribute('data-music') })
    await playSong(page, { id: 'fake-1', title: 'Fake' })
    await page.keyboard.press('/')
    await page.keyboard.type('says')
    await waitFor({ page, ms: STOP_WITHIN_MS, what: 'a live result row', check: () => document.querySelector('.music-row') !== null })
    await skipSong(page, 'ArrowLeft')
    assert.equal(await page.evaluate(() => document.getElementById('music-query').selectionStart), 0)
    await skipSong(page, 'ArrowRight')
    assert.equal(await page.evaluate(() => document.getElementById('music-query').selectionStart), 4)
    await delay(500)
    assert.equal((await songStatus(page)).current.id, 'fake-1')
    assert.equal(await musicMode(page), 'search')
    await page.keyboard.press('Escape')
    await page.keyboard.press('Escape')
    assert.equal(await musicMode(page), 'bar')
    await skipSong(page, 'ArrowRight')
    await waitForSong(page, 'fake-2')
  }, undefined, musicDir)
})

test('three failing songs in a row stop playback', { timeout: TEST_TIMEOUT_MS }, async () => {
  const musicDir = await copyFixture('music-driver')
  await withApp(async ({ page }) => {
    await waitFor({ page, ms: STOP_WITHIN_MS, what: 'music search turned on', check: () => document.documentElement.hasAttribute('data-music') })
    await page.evaluate(() => window.__noiseTest.player.play({ id: 'broken-1', title: 'Broken 1' }))
    await waitFor({ page, ms: SOUND_WITHIN_MS, what: 'playback stopped after failures', check: () => window.__noiseTest.track().status === 'idle' && !document.body.classList.contains('playing') })
    const log = await logOnceMatching({ musicDir, pattern: /stream broken-\d/g, count: 3 })
    assert.deepEqual(log.match(/stream broken-\d/g), ['stream broken-1', 'stream broken-2', 'stream broken-3'])
  }, undefined, musicDir)
})

const searchAndEnter = async (page, query) => {
  await page.keyboard.press('/')
  await page.keyboard.type(query)
  await waitFor({ page, ms: STOP_WITHIN_MS, what: 'the album row', check: () => document.querySelector('.music-row.album') !== null })
  await page.keyboard.press('Enter')
}

const searchState = page => page.evaluate(() => ({
  mode: document.querySelector('.music-ui').dataset.mode,
  query: document.querySelector('.music-input').value,
  rows: document.querySelectorAll('.music-row').length,
  status: document.querySelector('.music-status').textContent,
  kind: document.querySelector('.music-status').dataset.kind ?? null,
}))

const waitForStatus = (page, text) => waitFor({ page, ms: SOUND_WITHIN_MS, what: `the status ${text}`, check: expected => document.querySelector('.music-status').textContent === expected, arg: text })

test('an album that fails to load keeps the song playing and reopens the search with a message', { timeout: TEST_TIMEOUT_MS }, async () => {
  const musicDir = await copyFixture('music-driver')
  await withApp(async ({ page }) => {
    await waitFor({ page, ms: STOP_WITHIN_MS, what: 'music search turned on', check: () => document.documentElement.hasAttribute('data-music') })
    await playSong(page, { id: 'fake-1', title: 'Fake' })
    for (const query of ['lost set', 'empty set']) {
      await searchAndEnter(page, query)
      await waitForStatus(page, "Couldn't load that album. Try another.")
      assert.deepEqual(await searchState(page), { mode: 'search', query, rows: 1, status: "Couldn't load that album. Try another.", kind: 'error' })
      const song = await songStatus(page)
      assert.equal(song.current.id, 'fake-1')
      assert.equal(song.status, 'active')
      await page.keyboard.press('Escape')
      await page.keyboard.press('Escape')
    }
  }, undefined, musicDir)
})

test('an album that fails to load with nothing playing leaves the sound unchanged', { timeout: TEST_TIMEOUT_MS }, async () => {
  const musicDir = await copyFixture('music-driver')
  await withApp(async ({ page }) => {
    await waitFor({ page, ms: STOP_WITHIN_MS, what: 'music search turned on', check: () => document.documentElement.hasAttribute('data-music') })
    await searchAndEnter(page, 'lost set')
    await waitForStatus(page, "Couldn't load that album. Try another.")
    assert.equal((await songStatus(page)).status, 'idle')
    assert.equal((await searchState(page)).mode, 'search')
  }, undefined, musicDir)
})

test('an unplayable album song is skipped for the next album song', { timeout: TEST_TIMEOUT_MS }, async () => {
  const musicDir = await copyFixture('music-driver')
  await withApp(async ({ page }) => {
    await waitFor({ page, ms: STOP_WITHIN_MS, what: 'music search turned on', check: () => document.documentElement.hasAttribute('data-music') })
    await searchAndEnter(page, 'skippy set')
    await waitForSong(page, 'skip-1')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    await waitForSong(page, 'skip-3')
    assert.equal((await searchState(page)).status, '')
  }, undefined, musicDir)
})

test('an album with three unplayable songs in a row stops and reopens the search with a message', { timeout: TEST_TIMEOUT_MS }, async () => {
  const musicDir = await copyFixture('music-driver')
  await withApp(async ({ page }) => {
    await waitFor({ page, ms: STOP_WITHIN_MS, what: 'music search turned on', check: () => document.documentElement.hasAttribute('data-music') })
    await searchAndEnter(page, 'broken set')
    await waitForStatus(page, "Couldn't play this album.")
    assert.equal((await songStatus(page)).status, 'idle')
    assert.deepEqual(await searchState(page), { mode: 'search', query: 'broken set', rows: 1, status: "Couldn't play this album.", kind: 'error' })
  }, undefined, musicDir)
})

test('Esc ends a song and stops, and a saved wave setting stays on', { timeout: TEST_TIMEOUT_MS }, async () => {
  const musicDir = await copyFixture('music-driver')
  await withApp(async ({ page }) => {
    await waitFor({ page, ms: STOP_WITHIN_MS, what: 'music search turned on', check: () => document.documentElement.hasAttribute('data-music') })
    await page.keyboard.press('w')
    await waitFor({ page, ms: STOP_WITHIN_MS, what: 'wave mode on', check: () => document.documentElement.classList.contains('wave') })
    await playSong(page, { id: 'fake-1', title: 'Fake' })
    await page.keyboard.press('Escape')
    await waitFor({ page, ms: STOP_WITHIN_MS, what: 'the song ended and stopped', check: () => window.__noiseTest.track().status === 'idle' && !document.body.classList.contains('playing') })
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains('wave')), true)
  }, undefined, musicDir)
})

test('during a song the colour follows its sound without changing the saved colour', { timeout: TEST_TIMEOUT_MS }, async () => {
  const musicDir = await copyFixture('music-driver')
  await withApp(async ({ app, page }) => {
    await waitFor({ page, ms: STOP_WITHIN_MS, what: 'music search turned on', check: () => document.documentElement.hasAttribute('data-music') })
    await playSong(page, { id: 'bright-1', title: 'Bright' })
    await waitFor({ page, ms: SOUND_WITHIN_MS, what: 'the colour moved toward violet', check: () => window.__noiseTest.track().pos > 2.5 })
    const coolShare = await page.evaluate(() => ['blue', 'violet']
      .reduce((sum, id) => sum + Number(document.querySelector(`.layer[data-id="${id}"]`).style.opacity || 0), 0))
    assert.ok(coolShare > 0.5, `blue and violet layers at ${coolShare}`)
    assert.equal(await app.evaluate(({ Menu }) => Menu.getApplicationMenu().items.find(item => item.label === 'Controls').submenu.items.find(item => item.label === 'Brown').checked), true)
    await page.keyboard.press('Escape')
    await waitFor({ page, ms: STOP_WITHIN_MS, what: 'the brown layer back', check: () => Number(document.querySelector('.layer[data-id="brown"]').style.opacity) === 1 })
  }, undefined, musicDir)
})

const controlsMenuItem = (app, label) => app.evaluate(({ Menu }, name) => {
  const item = Menu.getApplicationMenu().items.find(entry => entry.label === 'Controls').submenu.items.find(entry => entry.label === name)
  return item ? { checked: item.checked, accelerator: item.accelerator ?? null } : null
}, label)

const musicMode = page => page.evaluate(() => document.querySelector('.music-ui')?.dataset.mode ?? null)

test('without a music driver, / and the Search Music menu item do nothing', { timeout: TEST_TIMEOUT_MS }, async () => {
  await withApp(async ({ app, page }) => {
    await delay(1000)
    await page.keyboard.press('/')
    assert.equal(await musicMode(page), 'off')
    assert.equal(await controlsMenuItem(app, 'Search Music…'), null)
  })
})

test('/ opens music search, and typed keys go into the field, not the app', { timeout: TEST_TIMEOUT_MS }, async () => {
  const musicDir = await copyFixture('music-driver')
  await withApp(async ({ app, page }) => {
    await waitFor({ page, ms: STOP_WITHIN_MS, what: 'music search turned on', check: () => document.documentElement.hasAttribute('data-music') })
    assert.deepEqual(await controlsMenuItem(app, 'Search Music…'), { checked: false, accelerator: '/' })
    await page.keyboard.press('/')
    assert.equal(await musicMode(page), 'search')
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'music-query')
    await waitForApp({ app, what: 'single keys removed from the menu', check: ({ Menu }) =>
      Menu.getApplicationMenu().items.find(item => item.label === 'Controls').submenu.items.find(item => item.label === 'Wave Mode').accelerator == null })
    const autoHide = () => app.evaluate(({ Menu }) => Menu.getApplicationMenu().getMenuItemById('auto-hide-controls').checked)
    const autoHideBefore = await autoHide()
    await page.keyboard.type('h w m 3 says')
    assert.equal(await page.evaluate(() => document.getElementById('music-query').value), 'h w m 3 says')
    assert.equal(await autoHide(), autoHideBefore)
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains('wave')), false)
    assert.equal((await controlsMenuItem(app, 'Brown')).checked, true)
    await waitFor({ page, ms: STOP_WITHIN_MS, what: 'a live result row', check: () => document.querySelector('.music-row .music-text')?.textContent === 'Fake h w m 3 says · Fixture' })
  }, undefined, musicDir)
})

test('Enter plays the best result, closes search, and shows the loading bar until the song sounds', { timeout: TEST_TIMEOUT_MS }, async () => {
  const musicDir = await copyFixture('music-driver')
  await withApp(async ({ page }) => {
    await waitFor({ page, ms: STOP_WITHIN_MS, what: 'music search turned on', check: () => document.documentElement.hasAttribute('data-music') })
    await page.keyboard.press('/')
    await page.keyboard.type('says')
    await waitFor({ page, ms: STOP_WITHIN_MS, what: 'a live result row', check: () => document.querySelector('.music-row') !== null })
    await page.keyboard.press('Enter')
    assert.equal(await musicMode(page), 'bar')
    await waitFor({ page, ms: SOUND_WITHIN_MS, what: 'the best result sounding', check: () => window.__noiseTest.track().status === 'active' && document.querySelector('.music-ui').dataset.track === 'active' })
    assert.equal(await page.evaluate(() => document.querySelector('.music-bar-track .music-scroll').textContent), 'Fake says · Fixture Artist')
    await page.keyboard.press('/')
    await waitFor({ page, ms: STOP_WITHIN_MS, what: 'the playing row marked', check: () => document.querySelector('.music-row.playing') !== null })
    await page.keyboard.press('Escape')
    await page.keyboard.press('Escape')
    assert.equal(await musicMode(page), 'bar')
    await page.keyboard.press('Escape')
    await waitFor({ page, ms: STOP_WITHIN_MS, what: 'the song stopped and the slider back', check: () => window.__noiseTest.track().status === 'idle' && document.querySelector('.music-ui').dataset.mode === 'off' })
  }, undefined, musicDir)
})

test('a cached song shows in the list, arrows select it, and the bar seeks on click', { timeout: TEST_TIMEOUT_MS }, async () => {
  const musicDir = await copyFixture('music-driver')
  await withApp(async ({ page }) => {
    await waitFor({ page, ms: STOP_WITHIN_MS, what: 'music search turned on', check: () => document.documentElement.hasAttribute('data-music') })
    await playSong(page, { id: 'fake-2', title: 'Cached Tune', artist: 'Fixture' })
    await waitFor({ page, ms: STOP_WITHIN_MS, what: 'the song in the cache', check: async () => (await window.noiseDesktop.music.cached()).entries.some(entry => entry.track.id === 'fake-2') })
    const bar = await page.evaluate(() => document.querySelector('.music-bar').getBoundingClientRect().toJSON())
    await page.mouse.click(bar.x + bar.width * 0.75, bar.y + bar.height / 2)
    const { current } = await page.evaluate(() => window.__noiseTest.trackTime())
    assert.ok(current > 13 && current < 17, `seeked to ${current}`)
    await waitFor({ page, ms: STOP_WITHIN_MS, what: 'the progress fill redrawn', check: () => parseFloat(getComputedStyle(document.querySelector('.music-ui')).getPropertyValue('--music-progress')) > 50 })
    const onTop = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('.music-bar-layer')?.className ?? '', { x: bar.x + 30, y: bar.y + bar.height / 2 })
    assert.match(onTop, /music-bar-fill/)
    await page.keyboard.press('/')
    await page.keyboard.type('cach')
    await waitFor({ page, ms: STOP_WITHIN_MS, what: 'the cached row', check: () => [...document.querySelectorAll('.music-row.cached .music-text')].some(node => node.textContent === 'Cached Tune · Fixture Artist') })
    await page.keyboard.press('ArrowUp')
    assert.equal(await page.evaluate(() => document.getElementById('music-query').getAttribute('aria-activedescendant')), 'music-row-0')
  }, undefined, musicDir)
})

test('the Search Music menu item opens music search', { timeout: TEST_TIMEOUT_MS }, async () => {
  const musicDir = await copyFixture('music-driver')
  await withApp(async ({ app, page }) => {
    await waitFor({ page, ms: STOP_WITHIN_MS, what: 'music search turned on', check: () => document.documentElement.hasAttribute('data-music') })
    await waitForApp({ app, what: 'the Search Music item', check: ({ Menu }) => Boolean(Menu.getApplicationMenu().items.find(item => item.label === 'Controls').submenu.items.find(item => item.label === 'Search Music…')) })
    await app.evaluate(({ Menu }) => Menu.getApplicationMenu().items.find(item => item.label === 'Controls').submenu.items.find(item => item.label === 'Search Music…').click())
    await waitFor({ page, ms: STOP_WITHIN_MS, what: 'music search open', check: () => document.querySelector('.music-ui').dataset.mode === 'search' })
  }, undefined, musicDir)
})

test('the music driver process sleeps when idle and wakes for the next search', { timeout: TEST_TIMEOUT_MS }, async () => {
  const musicDir = await copyFixture('music-driver')
  await withApp(async ({ app, page }) => {
    await waitFor({ page, ms: STOP_WITHIN_MS, what: 'music search turned on', check: () => document.documentElement.hasAttribute('data-music') })
    const driverProcesses = () => app.evaluate(({ app: electronApp }) => electronApp.getAppMetrics().filter(metric => metric.serviceName === 'Noise Music Driver').length)
    await waitForApp({ app, what: 'the driver process asleep', check: ({ app: electronApp }) => !electronApp.getAppMetrics().some(metric => metric.serviceName === 'Noise Music Driver') })
    assert.equal(await driverProcesses(), 0)
    assert.equal((await page.evaluate(() => window.noiseDesktop.music.search('wake'))).tracks[0].title, 'Fake wake')
  }, undefined, musicDir, { NOISE_MUSIC_IDLE_MS: '500' })
})

test('an invalid music driver leaves music search off and logs why', { timeout: TEST_TIMEOUT_MS }, async () => {
  const musicDir = await copyFixture('music-driver-invalid')
  await withApp(async ({ page }) => {
    const log = path.join(musicDir, 'driver.log')
    const deadline = Date.now() + STOP_WITHIN_MS
    while (Date.now() < deadline && !(await fs.readFile(log, 'utf8').catch(() => '')).includes('apiVersion is 2')) await delay(100)
    assert.match(await fs.readFile(log, 'utf8'), /Driver rejected: the driver apiVersion is 2, not 1/)
    assert.equal(await page.evaluate(() => document.documentElement.hasAttribute('data-music')), false)
  }, undefined, musicDir)
})

const logOnceMatching = async ({ musicDir, pattern, count }) => {
  const file = path.join(musicDir, 'driver.log')
  const deadline = Date.now() + STOP_WITHIN_MS
  while (Date.now() < deadline) {
    const log = await fs.readFile(file, 'utf8').catch(() => '')
    if ((log.match(pattern) ?? []).length >= count) return log
    await delay(100)
  }
  return fs.readFile(file, 'utf8').catch(() => '')
}

const copyFixture = async name => {
  const musicDir = await fs.mkdtemp(path.join(tmpRoot, 'music-'))
  await fs.cp(path.join(appRoot, 'test', 'fixtures', name), musicDir, { recursive: true })
  return musicDir
}

const spyOnWindowButtons = app => app.evaluate(({ BrowserWindow, screen }) => {
  const window = BrowserWindow.getAllWindows()[0]
  globalThis.buttonCalls = []
  const setVisibility = window.setWindowButtonVisibility.bind(window)
  window.setWindowButtonVisibility = visible => {
    globalThis.buttonCalls.push(visible)
    setVisibility(visible)
  }
  screen.getCursorScreenPoint = () => ({ x: -100000, y: -100000 })
})

test('the Controls menu drives the app, and its ticks follow key presses', { timeout: TEST_TIMEOUT_MS }, async () => {
  await withApp(async ({ app, page }) => {
    const controlsItem = label => app.evaluate(({ Menu }, name) =>
      Menu.getApplicationMenu().items.find(item => item.label === 'Controls').submenu.items.find(item => item.label === name).checked, label)
    await app.evaluate(({ Menu }) => Menu.getApplicationMenu().items.find(item => item.label === 'Controls').submenu.items.find(item => item.label === 'Wave Mode').click())
    await waitFor({ page, ms: STOP_WITHIN_MS, what: 'wave mode on', check: () => document.documentElement.classList.contains('wave') })
    assert.equal(await controlsItem('Wave Mode'), true)
    await page.keyboard.press('Escape')
    await waitFor({ page, ms: STOP_WITHIN_MS, what: 'wave mode off', check: () => !document.documentElement.classList.contains('wave') })
    await waitForApp({ app, what: 'Wave Mode unticked', check: ({ Menu }) =>
      !Menu.getApplicationMenu().items.find(item => item.label === 'Controls').submenu.items.find(item => item.label === 'Wave Mode').checked })
    await page.keyboard.press('3')
    await waitForApp({ app, what: 'White ticked', check: ({ Menu }) =>
      Menu.getApplicationMenu().items.find(item => item.label === 'Controls').submenu.items.find(item => item.label === 'White').checked })
    assert.equal(await controlsItem('Brown'), false)
  })
})

test('a key press after clicking a button leaves no focus ring', { timeout: TEST_TIMEOUT_MS }, async () => {
  await withApp(async ({ page }) => {
    await page.click('#timer')
    await page.keyboard.press('ArrowUp')
    assert.equal(await page.evaluate(() => document.querySelector(':focus-visible')), null)
    await page.keyboard.press('Tab')
    assert.notEqual(await page.evaluate(() => document.querySelector(':focus-visible')), null)
  })
})

const pressKey = async ({ app, keyCode }) => {
  await app.evaluate(({ BrowserWindow }, code) => {
    const contents = BrowserWindow.getAllWindows()[0].webContents
    contents.sendInputEvent({ type: 'keyDown', keyCode: code })
    contents.sendInputEvent({ type: 'keyUp', keyCode: code })
  }, keyCode)
  await delay(300)
}

test('Help → Noise Help opens one help window whose links open in the browser', { timeout: TEST_TIMEOUT_MS }, async () => {
  await withApp(async ({ app, watch }) => {
    await app.evaluate(({ shell }) => {
      globalThis.openedLinks = []
      shell.openExternal = async url => globalThis.openedLinks.push(url)
    })
    const opened = app.waitForEvent('window')
    await app.evaluate(({ Menu }) => Menu.getApplicationMenu().getMenuItemById('help').click())
    const help = await opened
    await help.waitForSelector('#help a')
    await app.evaluate(({ Menu }) => Menu.getApplicationMenu().getMenuItemById('help').click())
    await delay(500)
    assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length), 2)
    assert.equal(await help.title(), 'Noise Help')
    assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().every(window => !window.getParentWindow())), true)
    assert.match(await help.textContent('#help'), /NOISE \d+\.\d+\.\d+/)
    await help.click('a[href="https://about.me/jamesfurey"]')
    await help.evaluate(() => window.open('https://example.com/'))
    await waitForApp({ app, what: 'the link opened in the browser', check: () => globalThis.openedLinks.length > 0 })
    await delay(500)
    assert.deepEqual(await app.evaluate(() => globalThis.openedLinks), ['https://about.me/jamesfurey'])
    await help.keyboard.press('Escape').catch(() => null)
    await waitForApp({ app, what: 'the help window closed', check: ({ BrowserWindow }) => BrowserWindow.getAllWindows().length === 1 })
    assert.deepEqual(watch.errors, [])
    assert.deepEqual(watch.requests.filter(url => !url.startsWith(APP_URL_PREFIX)), [])
  })
})

test('the ? key opens the help window', { timeout: TEST_TIMEOUT_MS }, async () => {
  await withApp(async ({ app, page, watch }) => {
    const opened = app.waitForEvent('window')
    await page.keyboard.press('Shift+Slash')
    const help = await opened
    await help.waitForSelector('#help a')
    assert.ok(help.url().startsWith(`${APP_URL_PREFIX}help.html`), help.url())
    assert.deepEqual(watch.errors, [])
  })
})

const INIT_SCRIPT = () => {
  const noiseTest = { csp: [], analysers: [], contexts: new Set(), elements: new Set() }
  window.__noiseTest = noiseTest
  addEventListener('securitypolicyviolation', event => noiseTest.csp.push(`${event.violatedDirective} ${event.blockedURI}`))
  const createAnalyser = BaseAudioContext.prototype.createAnalyser
  BaseAudioContext.prototype.createAnalyser = function () {
    const analyser = createAnalyser.call(this)
    noiseTest.analysers.push(analyser)
    noiseTest.contexts.add(this)
    return analyser
  }
  const play = HTMLMediaElement.prototype.play
  HTMLMediaElement.prototype.play = function () {
    noiseTest.elements.add(this)
    return play.call(this)
  }
  noiseTest.sounding = () => document.body.classList.contains('playing') && noiseTest.analysers.some(analyser => {
    if (analyser.context.state !== 'running') return false
    const samples = new Float32Array(analyser.fftSize)
    analyser.getFloatTimeDomainData(samples)
    return samples.some(sample => Math.abs(sample) > 1e-4)
  })
}

const withApp = async (run, existingUserData, musicDir, extraEnv) => {
  const userData = existingUserData ?? await fs.mkdtemp(path.join(tmpRoot, 'profile-'))
  const app = await launch(userData, musicDir, extraEnv)
  try {
    const page = await app.firstWindow()
    await waitForApp({ app, what: 'a visible window', check: ({ BrowserWindow }) => BrowserWindow.getAllWindows().some(window => window.isVisible()) })
    const watch = await watchReload({ app, page })
    return await run({ app, page, watch, userData })
  } finally {
    await closeApp(app)
  }
}

const watchReload = async ({ app, page }) => {
  const watch = { errors: [], requests: [] }
  await app.context().addInitScript(INIT_SCRIPT)
  page.on('console', message => {
    if (message.type() === 'error') watch.errors.push(message.text())
  })
  page.on('pageerror', error => watch.errors.push(error.message))
  page.on('request', request => watch.requests.push(request.url()))
  await page.reload({ waitUntil: 'load' })
  return watch
}

const launch = (userData, musicDir, extraEnv = {}) => {
  const env = { ...appEnv({ userData, musicDir }), ...extraEnv }
  return packagedExecutable
    ? electron.launch({ executablePath: packagedExecutable, env })
    : electron.launch({ args: [appRoot], cwd: appRoot, env })
}

const appEnv = ({ userData, musicDir }) => ({
  ...process.env, NOISE_USER_DATA: userData, NOISE_QUIET_WINDOW: '1', NOISE_MUSIC_DIR: musicDir ?? path.join(userData, 'no-music'),
})

const runUntilExit = async ({ userData }) => {
  const env = appEnv({ userData })
  const child = packagedExecutable
    ? spawn(packagedExecutable, [], { env, stdio: 'ignore' })
    : spawn(electronBinary, [appRoot], { cwd: appRoot, env, stdio: 'ignore' })
  const exit = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })))
  const result = await Promise.race([exit, delay(EXIT_WITHIN_MS).then(() => null)])
  if (result) return result
  child.kill('SIGKILL')
  throw new Error(`The second start did not exit within ${EXIT_WITHIN_MS} ms`)
}

const waitFor = async ({ page, ms, what, check, arg }) => {
  const deadline = Date.now() + ms
  while (Date.now() < deadline) {
    if (await page.evaluate(check, arg)) return
    await delay(100)
  }
  throw new Error(`No ${what} within ${ms} ms`)
}

const waitForApp = async ({ app, what, check }) => {
  const deadline = Date.now() + VISIBLE_WITHIN_MS
  while (Date.now() < deadline) {
    if (await app.evaluate(check)) return
    await delay(100)
  }
  throw new Error(`No ${what} within ${VISIBLE_WITHIN_MS} ms`)
}

const closeApp = async app => {
  const child = app.process()
  const closed = await Promise.race([app.close().then(() => true, () => false), delay(STOP_WITHIN_MS).then(() => false)])
  if (!closed && child.exitCode === null) child.kill('SIGKILL')
}

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
