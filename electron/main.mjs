import { app, BrowserWindow, ipcMain, Menu, protocol, screen, session, shell } from 'electron'
import path from 'node:path'
import { APP_ORIGIN, APP_SCHEME, isAppUrl, serveAppFile } from './app-files.mjs'
import { createInstallAccess, grantSandboxReadAccess } from './install-access.mjs'
import { controlsMenu, usableMenuState } from './controls-menu.mjs'
import { SOURCE_URL, isExternalLink } from './links.mjs'
import { MIN_SIZE, createWindowState, defaultBounds, parkedBounds, resumablePark, restoreBounds, sameBounds } from './window-state.mjs'
import { createMusic } from './provider/music.mjs'
import { musicFolder } from './provider/paths.mjs'

const BACKGROUND = '#050505'
const ALWAYS_ON_TOP_ID = 'always-on-top'
const AUTO_HIDE_ID = 'auto-hide-controls'
const AUTO_HIDE_KEY = 'h'
const PARK_ID = 'park-window'
const RESET_ID = 'reset-window'
const PARK_INSET_PX = 48
const POINTER_POLL_MS = 100
const PRELOAD = path.join(import.meta.dirname, 'preload.cjs')
const HELP_ID = 'help'
const HELP_SIZE = { width: 660, height: 760 }
const HELP_MIN_SIZE = { width: 600, height: 320 }
const SHOW_FALLBACK_MS = 5000
const PAGE_URL = `${APP_ORIGIN}/index.html`
const HELP_URL = `${APP_ORIGIN}/help.html`
const MUSIC_PARTITION = 'noise-music'
const BLOCKED_URLS = ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*', 'file://*/*']
const isMac = process.platform === 'darwin'
const WEB_PREFERENCES = {
  contextIsolation: true,
  sandbox: true,
  nodeIntegration: false,
  webSecurity: true,
  spellcheck: false,
  devTools: !app.isPackaged,
}

const state = { window: null, help: null, windowState: null, installAccess: null, autoHide: false, pointerInside: true, pointerPoll: 0, menu: usableMenuState(null), music: null, searchOpen: false, park: null }
const IS_QUIET_WINDOW = process.env.NOISE_QUIET_WINDOW === '1' && !app.isPackaged

const main = () => {
  if (process.env.NOISE_USER_DATA) app.setPath('userData', process.env.NOISE_USER_DATA)
  if (!app.requestSingleInstanceLock()) return app.quit()
  repairInstallAccess()
  protocol.registerSchemesAsPrivileged([{
    scheme: APP_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  }])
  app.enableSandbox()
  app.setAboutPanelOptions({
    applicationName: 'Noise',
    applicationVersion: app.getVersion(),
    copyright: 'Copyright © James Furey. PolyForm Noncommercial 1.0.0.',
    website: 'https://github.com/furey/noise',
  })
  app.on('second-instance', focusWindow)
  app.on('window-all-closed', () => app.quit())
  app.on('before-quit', () => state.installAccess?.endStart())
  app.on('will-quit', () => state.music?.stop())
  app.on('web-contents-created', (_event, contents) => lockDownContents(contents))
  ipcMain.on('chrome-hidden', (event, hidden) => showWindowButtons(event.sender, hidden !== true))
  ipcMain.on('pointer-entered', event => notePointerEntered(event.sender))
  ipcMain.on('menu-state', (event, menu) => updateMenuState(event.sender, menu))
  ipcMain.on('music-search-open', (event, open) => noteSearchOpen(event.sender, open))
  app.whenReady().then(() => {
    if (IS_QUIET_WINDOW && process.platform === 'darwin') app.setActivationPolicy('accessory')
    start()
  })
}

const start = () => {
  const distDir = path.join(app.getAppPath(), 'dist')
  lockDownSession(session.defaultSession)
  protocol.handle(APP_SCHEME, request => state.music?.handles(request.url)
    ? state.music.serve(request)
    : serveAppFile({ root: distDir, url: request.url }))
  Menu.setApplicationMenu(buildMenu())
  state.windowState = createWindowState({
    folder: app.getPath('userData'),
    displays: () => screen.getAllDisplays().map(display => display.workArea),
    pointerArea: () => screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea,
  })
  state.window = createWindow()
  state.music = createMusic({
    folder: musicFolder({ appData: app.getPath('appData'), override: process.env.NOISE_MUSIC_DIR }),
    origin: APP_ORIGIN,
    ipcMain,
    fetchSource: (url, init) => session.fromPartition(MUSIC_PARTITION).fetch(url, init),
    cacheLimitBytes: Number(process.env.NOISE_MUSIC_CACHE_BYTES) || undefined,
    idleMs: Number(process.env.NOISE_MUSIC_IDLE_MS) || undefined,
    isTrusted: contents => contents === state.window?.webContents,
    onStatus: () => {
      sendMusicStatus(state.window)
      refreshMenu()
    },
  })
  state.music.start()
}

const createWindow = () => {
  const { maximized, alwaysOnTop, autoHideControls, ...bounds } = state.windowState.load()
  const savedPark = state.windowState.loadPark()
  const window = new BrowserWindow({
    ...bounds,
    alwaysOnTop,
    minWidth: MIN_SIZE.width,
    minHeight: MIN_SIZE.height,
    title: 'Noise',
    show: false,
    backgroundColor: BACKGROUND,
    ...(isMac ? { titleBarStyle: 'hiddenInset' } : { autoHideMenuBar: true }),
    webPreferences: { ...WEB_PREFERENCES, preload: PRELOAD },
  })
  if (!isMac) window.setMenuBarVisibility(false)
  Menu.getApplicationMenu().getMenuItemById(ALWAYS_ON_TOP_ID).checked = alwaysOnTop
  Menu.getApplicationMenu().getMenuItemById(AUTO_HIDE_ID).checked = autoHideControls
  state.autoHide = autoHideControls
  window.webContents.on('before-input-event', (event, input) => {
    if (!isAutoHideKey(input) || state.searchOpen) return
    event.preventDefault()
    toggleAutoHide()
  })
  window.webContents.on('did-finish-load', () => {
    sendAutoHide(window)
    sendMusicStatus(window)
  })
  const showFallback = setTimeout(() => revealWindow({ window, maximized, savedPark, bounds }), SHOW_FALLBACK_MS)
  window.once('ready-to-show', () => {
    clearTimeout(showFallback)
    revealWindow({ window, maximized, savedPark, bounds })
  })
  window.on('move', () => endParkIfMoved(window))
  window.on('resize', () => endParkIfMoved(window))
  window.on('close', () => rememberBounds(window))
  window.on('closed', () => {
    state.window = null
    state.park = null
    stopPointerPoll()
    state.help?.close()
  })
  window.webContents.setWindowOpenHandler(({ url }) => openFromPage(url))
  window.loadURL(PAGE_URL).catch(() => null)
  return window
}

const openHelp = () => {
  if (state.help && !state.help.isDestroyed()) return state.help.focus()
  state.help = createHelpWindow()
}

const createHelpWindow = () => {
  const help = new BrowserWindow({
    ...HELP_SIZE,
    ...helpPosition(),
    alwaysOnTop: Boolean(state.window?.isAlwaysOnTop()),
    minWidth: HELP_MIN_SIZE.width,
    minHeight: HELP_MIN_SIZE.height,
    title: 'Noise Help',
    show: false,
    backgroundColor: BACKGROUND,
    ...(isMac ? {} : { autoHideMenuBar: true }),
    webPreferences: WEB_PREFERENCES,
  })
  if (!isMac) help.setMenuBarVisibility(false)
  help.webContents.setWindowOpenHandler(({ url }) => openExternalLink(url))
  help.once('ready-to-show', () => showWindow(help))
  help.on('closed', () => {
    state.help = null
  })
  help.loadURL(`${HELP_URL}?${helpPlace()}`).catch(() => null)
  return help
}

const helpPlace = () => new URLSearchParams({ v: app.getVersion(), desktop: '1', music: state.music?.isReady() ? '1' : '0' })

const helpPosition = () => {
  if (!state.window || state.window.isDestroyed()) return { center: true }
  const main = state.window.getBounds()
  const area = screen.getDisplayMatching(main).workArea
  const x = main.x + Math.round((main.width - HELP_SIZE.width) / 2)
  const y = main.y + Math.round((main.height - HELP_SIZE.height) / 2)
  return {
    x: clamp(x, area.x, area.x + area.width - HELP_SIZE.width),
    y: clamp(y, area.y, area.y + area.height - HELP_SIZE.height),
  }
}

const clamp = (value, min, max) => Math.max(min, Math.min(value, max))

const openFromPage = url => {
  if (isHelpUrl(url)) openHelp()
  return { action: 'deny' }
}

const isHelpUrl = url => isAppUrl(url) && new URL(url).pathname === '/help.html'

const openExternalLink = url => {
  if (isExternalLink(url)) shell.openExternal(url).catch(() => null)
  return { action: 'deny' }
}

const revealWindow = ({ window, maximized, savedPark, bounds }) => {
  if (window.isDestroyed() || window.isVisible()) return
  if (maximized) window.maximize()
  showWindow(window)
  resumePark({ window, savedPark, bounds })
  state.installAccess?.endStart()
}

const repairInstallAccess = () => {
  if (process.platform !== 'win32' || !app.isPackaged) return
  state.installAccess = createInstallAccess({ folder: app.getPath('userData'), electronVersion: process.versions.electron })
  if (!state.installAccess.needsRepair(state.installAccess.beginStart())) return
  state.installAccess.markRepaired()
  grantSandboxReadAccess(path.dirname(process.execPath))
}

const resumePark = ({ window, savedPark, bounds }) => {
  const restore = resumablePark({ saved: savedPark, expected: bounds, placed: window.getBounds() })
  if (!restore) return
  state.park = { restore, placed: window.getBounds() }
  refreshMenu()
}

const rememberBounds = window => {
  const { x, y, width, height } = window.getNormalBounds()
  const park = isParked() ? { park: state.park.restore } : {}
  state.windowState.save({ x, y, width, height, ...park, maximized: window.isMaximized(), alwaysOnTop: window.isAlwaysOnTop(), autoHideControls: state.autoHide })
}

const setAlwaysOnTop = ({ checked }) => {
  if (!state.window || state.window.isDestroyed()) return
  state.window.setAlwaysOnTop(checked)
  if (state.help && !state.help.isDestroyed()) state.help.setAlwaysOnTop(checked)
  rememberBounds(state.window)
}

const isParked = () => Boolean(state.park && state.window && !state.window.isDestroyed()
  && sameBounds(state.window.getBounds(), state.park.placed))

const endParkIfMoved = window => {
  if (!state.park || isParked()) return
  state.park = null
  if (!window.isDestroyed()) refreshMenu()
}

const toggleParkWindow = () => {
  const window = state.window
  if (!window || window.isDestroyed()) return
  if (isParked()) return unparkWindow(window)
  state.park = null
  parkWindow(window)
}

const restoreTargetFor = ({ window, saved }) => restoreBounds({
  saved,
  displays: screen.getAllDisplays().map(display => display.workArea),
  workArea: screen.getDisplayMatching(window.getBounds()).workArea,
})

const parkWindow = window => {
  const restore = restoreTargetFor({ window, saved: window.getNormalBounds() })
  leaveFullScreenThen(window, () => unmaximizeThenPark({ window, restore }))
}

const resetWindow = () => {
  const window = state.window
  if (!window || window.isDestroyed()) return
  state.park = null
  leaveFullScreenThen(window, () => placeAtDefault(window))
}

const leaveFullScreenThen = (window, then) => {
  if (!window.isFullScreen()) return then()
  window.once('leave-full-screen', then)
  window.setFullScreen(false)
}

const placeAtDefault = window => {
  if (window.isDestroyed()) return
  if (window.isMaximized()) window.unmaximize()
  const workArea = screen.getDisplayMatching(window.getBounds()).workArea
  window.setBounds(defaultBounds(workArea))
  refreshMenu()
}

const unmaximizeThenPark = ({ window, restore }) => {
  if (window.isDestroyed()) return
  if (window.isMaximized()) window.unmaximize()
  const workArea = screen.getDisplayMatching(window.getBounds()).workArea
  window.setBounds(parkedBounds({ workArea, size: MIN_SIZE, inset: PARK_INSET_PX }))
  state.park = { restore, placed: window.getBounds() }
  refreshMenu()
}

const unparkWindow = window => {
  const restore = restoreTargetFor({ window, saved: state.park.restore })
  state.park = null
  window.setBounds(restore)
  refreshMenu()
}

const isAutoHideKey = input => input.type === 'keyDown' && !input.isAutoRepeat && input.key.toLowerCase() === AUTO_HIDE_KEY
  && !input.meta && !input.control && !input.alt && !input.shift

const toggleAutoHide = () => {
  const item = Menu.getApplicationMenu().getMenuItemById(AUTO_HIDE_ID)
  item.checked = !item.checked
  setAutoHide(item)
}

const setAutoHide = ({ checked }) => {
  if (!state.window || state.window.isDestroyed()) return
  state.autoHide = checked
  sendAutoHide(state.window)
  rememberBounds(state.window)
}

const sendAutoHide = window => {
  if (window.isDestroyed()) return
  state.pointerInside = isPointerInside(window)
  window.webContents.send('auto-hide', { enabled: state.autoHide, inside: state.pointerInside })
  if (state.autoHide) return startPointerPoll()
  stopPointerPoll()
  showWindowButtons(window.webContents, true)
}

const sendMusicStatus = window => {
  if (!window || window.isDestroyed()) return
  window.webContents.send('music-status', { ready: Boolean(state.music?.isReady()) })
}

const startPointerPoll = () => {
  state.pointerPoll ||= setInterval(pollPointer, POINTER_POLL_MS)
}

const stopPointerPoll = () => {
  clearInterval(state.pointerPoll)
  state.pointerPoll = 0
}

const pollPointer = () => {
  const window = state.window
  if (!window || window.isDestroyed()) return stopPointerPoll()
  const inside = isPointerInside(window)
  if (inside === state.pointerInside) return
  state.pointerInside = inside
  window.webContents.send('auto-hide', { enabled: state.autoHide, inside })
}

const updateMenuState = (contents, menu) => {
  if (contents !== state.window?.webContents) return
  state.menu = usableMenuState(menu)
  refreshMenu()
}

const noteSearchOpen = (contents, open) => {
  if (contents !== state.window?.webContents) return
  state.searchOpen = open === true
  refreshMenu()
}

const refreshMenu = () => Menu.setApplicationMenu(buildMenu())

const sendCommand = command => {
  if (state.window && !state.window.isDestroyed()) state.window.webContents.send('command', command)
}

const notePointerEntered = contents => {
  if (contents === state.window?.webContents) state.pointerInside = true
}

const isPointerInside = window => {
  const { x, y } = screen.getCursorScreenPoint()
  const bounds = window.getBounds()
  return x >= bounds.x && x < bounds.x + bounds.width && y >= bounds.y && y < bounds.y + bounds.height
}

const showWindowButtons = (contents, visible) => {
  const window = state.window
  if (!isMac || !window || window.isDestroyed() || contents !== window.webContents) return
  window.setWindowButtonVisibility(visible)
}

const focusWindow = () => {
  if (!app.isReady()) return
  if (!state.window || state.window.isDestroyed()) {
    state.window = createWindow()
    return
  }
  if (state.window.isMinimized()) state.window.restore()
  showWindow(state.window)
  if (!IS_QUIET_WINDOW) state.window.focus()
}

const showWindow = window => IS_QUIET_WINDOW ? window.showInactive() : window.show()

const lockDownContents = contents => {
  contents.on('will-navigate', (event, url) => blockForeign(event, url))
  contents.on('will-redirect', (event, url) => blockForeign(event, url))
  contents.on('will-attach-webview', event => event.preventDefault())
  contents.setWindowOpenHandler(() => ({ action: 'deny' }))
}

const blockForeign = (event, url) => {
  if (!isAppUrl(url)) event.preventDefault()
}

const lockDownSession = target => {
  target.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  target.setPermissionCheckHandler(() => false)
  target.webRequest.onBeforeRequest({ urls: BLOCKED_URLS }, (_details, callback) => callback({ cancel: true }))
}

const buildMenu = () => Menu.buildFromTemplate([
  ...(isMac ? [{ role: 'appMenu' }] : []),
  { role: 'fileMenu' },
  { role: 'editMenu' },
  { label: 'View', submenu: [
    { id: ALWAYS_ON_TOP_ID, label: 'Always on Top', type: 'checkbox', checked: isWindowOnTop(), click: setAlwaysOnTop },
    { id: AUTO_HIDE_ID, label: 'Auto-Hide Controls', type: 'checkbox', checked: state.autoHide, accelerator: 'H', registerAccelerator: false, click: setAutoHide },
    { id: PARK_ID, label: isParked() ? 'Unpark Window' : 'Park Window', accelerator: 'Alt+CommandOrControl+P', click: toggleParkWindow },
    { id: RESET_ID, label: 'Reset Window', accelerator: 'Alt+CommandOrControl+R', click: resetWindow },
    { type: 'separator' },
    { role: 'togglefullscreen' },
  ] },
  controlsMenu({ state: state.menu, send: sendCommand, refresh: refreshMenu, searchOpen: state.searchOpen, musicReady: Boolean(state.music?.isReady()) }),
  { role: 'windowMenu' },
  { role: 'help', submenu: [
    { id: HELP_ID, label: 'Noise Help', accelerator: isMac ? 'Command+?' : 'F1', click: openHelp },
    { type: 'separator' },
    { label: 'Source on GitHub', click: () => openExternalLink(SOURCE_URL) },
  ] },
])

const isWindowOnTop = () => Boolean(state.window && !state.window.isDestroyed() && state.window.isAlwaysOnTop())

main()
