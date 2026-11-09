import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { isAppUrl, mimeTypeOf, resolveAppFile, serveAppFile } from '../electron/app-files.mjs'
import { DEFAULT_BOUNDS, MIN_SIZE, createWindowState, usableState } from '../electron/window-state.mjs'
import { createInstallAccess } from '../electron/install-access.mjs'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'noise-desktop-'))
fs.mkdirSync(path.join(root, 'assets'))
fs.writeFileSync(path.join(root, 'index.html'), '<!doctype html>')
fs.writeFileSync(path.join(root, 'assets', 'noise.worklet.js'), 'registerProcessor()')
const display = { x: 0, y: 0, width: 1920, height: 1080 }

test('only app://noise URLs count as the app', () => {
  assert.equal(isAppUrl('app://noise/index.html'), true)
  assert.equal(isAppUrl('app://other/index.html'), false)
  assert.equal(isAppUrl('https://noise/index.html'), false)
  assert.equal(isAppUrl('not a url'), false)
})

test('app URLs resolve to files inside the root', () => {
  assert.equal(resolveAppFile({ root, url: 'app://noise/' }), path.join(root, 'index.html'))
  assert.equal(resolveAppFile({ root, url: 'app://noise/assets/noise.worklet.js' }), path.join(root, 'assets', 'noise.worklet.js'))
})

test('traversal and foreign hosts resolve to nothing', () => {
  const urls = [
    'app://noise/%2e%2e/secret',
    'app://noise/assets/%2e%2e/%2e%2e/secret',
    'app://noise/..%2f..%2fsecret',
    'app://noise/..%5c..%5csecret',
    'app://noise/%00',
    'app://noise/%E0%A4%A',
    'app://other/index.html',
  ]
  urls.forEach(url => {
    const resolved = resolveAppFile({ root, url })
    assert.ok(resolved === null || resolved.startsWith(`${root}${path.sep}`), url)
  })
  assert.equal(resolveAppFile({ root, url: 'app://noise/..%2f..%2fsecret' }), null)
  assert.equal(resolveAppFile({ root, url: 'app://other/index.html' }), null)
})

test('encoded, absolute, and Windows-style traversal stays inside the root on both path rules', () => {
  const urls = [
    'app://noise/..', 'app://noise/%2e%2e', 'app://noise/%2E%2E/secret', 'app://noise/.%2e/.%2e/secret',
    'app://noise/assets/..%2f..%2f..%2fsecret', 'app://noise/..%5c..%5csecret', 'app://noise/assets%5c..%5c..%5csecret',
    'app://noise/%5c%5cserver%5cshare%5csecret', 'app://noise//etc/passwd', 'app://noise/%2fetc%2fpasswd',
    'app://noise/C:%5cWindows%5cwin.ini', 'app://noise/C:/Windows/win.ini', 'app://noise/index.html%00.png',
    'app://noise/%c0%ae%c0%ae/secret', 'app://noise/%252e%252e/secret',
  ]
  const roots = [{ paths: path.posix, root: '/app/dist' }, { paths: path.win32, root: 'C:\\app\\dist' }]
  roots.forEach(({ paths, root: base }) => urls.forEach(url => {
    const resolved = resolveAppFile({ root: base, url, paths })
    assert.ok(resolved === null || resolved.startsWith(`${base}${paths.sep}`), `${url} -> ${resolved}`)
  }))
  assert.equal(resolveAppFile({ root: 'C:\\app\\dist', url: 'app://noise/..%5c..%5csecret', paths: path.win32 }), null)
  assert.equal(resolveAppFile({ root: 'C:\\app\\dist', url: 'app://noise/C:%5cWindows%5cwin.ini', paths: path.win32 }), null)
  assert.equal(resolveAppFile({ root: '/app/dist', url: 'app://noise/index.html%00.png', paths: path.posix }), null)
})

test('served files carry a MIME type, and missing files are 404', async () => {
  const worklet = await serveAppFile({ root, url: 'app://noise/assets/noise.worklet.js' })
  assert.equal(worklet.status, 200)
  assert.match(worklet.headers.get('content-type'), /^text\/javascript/)
  assert.equal((await serveAppFile({ root, url: 'app://noise/missing.js' })).status, 404)
  assert.equal((await serveAppFile({ root, url: 'app://noise/assets' })).status, 404)
  assert.equal((await serveAppFile({ root, url: 'app://noise/..%2fetc%2fpasswd' })).status, 404)
  assert.equal(mimeTypeOf('a.webmanifest'), 'application/manifest+json; charset=utf-8')
})

test('window state falls back to defaults for missing or bad data', () => {
  const defaults = { ...DEFAULT_BOUNDS, maximized: false }
  assert.deepEqual(usableState({ saved: null, displays: [display] }), defaults)
  assert.deepEqual(usableState({ saved: [1, 2], displays: [display] }), defaults)
  assert.deepEqual(usableState({ saved: { width: 10, height: 'x' }, displays: [display] }), defaults)
})

test('window state keeps a position only when it is on a display', () => {
  const saved = { x: 100, y: 80, width: 900, height: 600, maximized: true }
  assert.deepEqual(usableState({ saved, displays: [display] }), saved)
  assert.deepEqual(usableState({ saved: { ...saved, x: 5000 }, displays: [display] }), { width: 900, height: 600, maximized: true })
  assert.equal(usableState({ saved: { width: MIN_SIZE.width, height: MIN_SIZE.height }, displays: [] }).width, MIN_SIZE.width)
})

test('window state drops a position whose title bar is off every display', () => {
  const size = { width: 900, height: 600, maximized: false }
  assert.deepEqual(usableState({ saved: { ...size, x: 100, y: -300 }, displays: [display] }), size)
  assert.deepEqual(usableState({ saved: { ...size, x: 1900, y: 100 }, displays: [display] }), size)
  assert.deepEqual(usableState({ saved: { ...size, x: 100, y: 1070 }, displays: [display] }), size)
  assert.deepEqual(usableState({ saved: { ...size, x: -850, y: 100 }, displays: [display] }), { ...size, x: -850, y: 100 })
})

test('window state shrinks a window larger than its display', () => {
  const laptop = { x: 0, y: 0, width: 1440, height: 875 }
  assert.deepEqual(usableState({ saved: { x: 0, y: 0, width: 3840, height: 2160 }, displays: [laptop] }), { x: 0, y: 0, width: 1440, height: 875, maximized: false })
  assert.deepEqual(usableState({ saved: { x: 9000, y: 0, width: 3840, height: 2160 }, displays: [laptop, display] }), { width: 1920, height: 1080, maximized: false })
})

test('install access repairs once per Electron version, only after a start that never showed the window', () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'noise-access-'))
  const access = (electronVersion = '44.10.2') => createInstallAccess({ folder, electronVersion })
  const first = access()
  assert.equal(first.needsRepair(first.beginStart()), false)
  first.endStart()
  const shown = access()
  assert.equal(shown.needsRepair(shown.beginStart()), false)
  const crashed = access()
  assert.equal(crashed.needsRepair(crashed.beginStart()), true)
  crashed.markRepaired()
  const again = access()
  assert.equal(again.needsRepair(again.beginStart()), false)
  const upgraded = access('44.11.0')
  assert.equal(upgraded.needsRepair(upgraded.beginStart()), false)
  const upgradedCrash = access('44.11.0')
  assert.equal(upgradedCrash.needsRepair(upgradedCrash.beginStart()), true)
  fs.rmSync(folder, { recursive: true, force: true })
})

test('window state saves atomically and survives a corrupt file', () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'noise-state-'))
  const windowState = createWindowState({ folder, displays: () => [display] })
  fs.writeFileSync(path.join(folder, 'window-state.json'), '{not json')
  assert.deepEqual(windowState.load(), { ...DEFAULT_BOUNDS, maximized: false })
  assert.equal(windowState.save({ x: 10, y: 20, width: 800, height: 600, maximized: false }), true)
  assert.deepEqual(windowState.load(), { x: 10, y: 20, width: 800, height: 600, maximized: false })
  assert.deepEqual(fs.readdirSync(folder), ['window-state.json'])
})
