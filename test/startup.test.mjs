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

const withApp = async run => {
  const userData = await fs.mkdtemp(path.join(tmpRoot, 'profile-'))
  const app = await launch(userData)
  try {
    const page = await app.firstWindow()
    await waitForApp({ app, what: 'a visible window', check: ({ BrowserWindow }) => BrowserWindow.getAllWindows().some(window => window.isVisible()) })
    const watch = await watchReload({ app, page })
    await run({ app, page, watch, userData })
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

const launch = userData => {
  const env = { ...process.env, NOISE_USER_DATA: userData }
  return packagedExecutable
    ? electron.launch({ executablePath: packagedExecutable, env })
    : electron.launch({ args: [appRoot], cwd: appRoot, env })
}

const runUntilExit = async ({ userData }) => {
  const env = { ...process.env, NOISE_USER_DATA: userData }
  const child = packagedExecutable
    ? spawn(packagedExecutable, [], { env, stdio: 'ignore' })
    : spawn(electronBinary, [appRoot], { cwd: appRoot, env, stdio: 'ignore' })
  const exit = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })))
  const result = await Promise.race([exit, delay(EXIT_WITHIN_MS).then(() => null)])
  if (result) return result
  child.kill('SIGKILL')
  throw new Error(`The second start did not exit within ${EXIT_WITHIN_MS} ms`)
}

const waitFor = async ({ page, ms, what, check }) => {
  const deadline = Date.now() + ms
  while (Date.now() < deadline) {
    if (await page.evaluate(check)) return
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
