import { app, BrowserWindow, Menu, protocol, screen, session, shell } from 'electron'
import path from 'node:path'
import { APP_ORIGIN, APP_SCHEME, isAppUrl, serveAppFile } from './app-files.mjs'
import { createInstallAccess, grantSandboxReadAccess } from './install-access.mjs'
import { SOURCE_URL, isExternalLink } from './links.mjs'
import { MIN_SIZE, createWindowState } from './window-state.mjs'

const BACKGROUND = '#050505'
const ALWAYS_ON_TOP_ID = 'always-on-top'
const HELP_ID = 'help'
const HELP_SIZE = { width: 660, height: 760 }
const HELP_MIN_SIZE = { width: 600, height: 320 }
const SHOW_FALLBACK_MS = 5000
const PAGE_URL = `${APP_ORIGIN}/index.html`
const HELP_URL = `${APP_ORIGIN}/help.html`
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

const state = { window: null, help: null, windowState: null, installAccess: null }

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
    copyright: 'Copyright © James Furey. GPL-3.0-or-later.',
    website: 'https://github.com/furey/noise',
  })
  app.on('second-instance', focusWindow)
  app.on('window-all-closed', () => app.quit())
  app.on('before-quit', () => state.installAccess?.endStart())
  app.on('web-contents-created', (_event, contents) => lockDownContents(contents))
  app.whenReady().then(start)
}

const start = () => {
  const distDir = path.join(app.getAppPath(), 'dist')
  lockDownSession(session.defaultSession)
  protocol.handle(APP_SCHEME, request => serveAppFile({ root: distDir, url: request.url }))
  Menu.setApplicationMenu(buildMenu())
  state.windowState = createWindowState({
    folder: app.getPath('userData'),
    displays: () => screen.getAllDisplays().map(display => display.workArea),
    pointerArea: () => screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea,
  })
  state.window = createWindow()
}

const createWindow = () => {
  const { maximized, alwaysOnTop, ...bounds } = state.windowState.load()
  const window = new BrowserWindow({
    ...bounds,
    alwaysOnTop,
    minWidth: MIN_SIZE.width,
    minHeight: MIN_SIZE.height,
    title: 'Noise',
    show: false,
    backgroundColor: BACKGROUND,
    ...(isMac ? { titleBarStyle: 'hiddenInset' } : { autoHideMenuBar: true }),
    webPreferences: WEB_PREFERENCES,
  })
  if (!isMac) window.setMenuBarVisibility(false)
  Menu.getApplicationMenu().getMenuItemById(ALWAYS_ON_TOP_ID).checked = alwaysOnTop
  const showFallback = setTimeout(() => revealWindow({ window, maximized }), SHOW_FALLBACK_MS)
  window.once('ready-to-show', () => {
    clearTimeout(showFallback)
    revealWindow({ window, maximized })
  })
  window.on('close', () => rememberBounds(window))
  window.on('closed', () => {
    state.window = null
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
  help.once('ready-to-show', () => help.show())
  help.on('closed', () => {
    state.help = null
  })
  help.loadURL(`${HELP_URL}?v=${encodeURIComponent(app.getVersion())}`).catch(() => null)
  return help
}

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

const revealWindow = ({ window, maximized }) => {
  if (window.isDestroyed() || window.isVisible()) return
  if (maximized) window.maximize()
  window.show()
  state.installAccess?.endStart()
}

const repairInstallAccess = () => {
  if (process.platform !== 'win32' || !app.isPackaged) return
  state.installAccess = createInstallAccess({ folder: app.getPath('userData'), electronVersion: process.versions.electron })
  if (!state.installAccess.needsRepair(state.installAccess.beginStart())) return
  state.installAccess.markRepaired()
  grantSandboxReadAccess(path.dirname(process.execPath))
}

const rememberBounds = window => {
  const { x, y, width, height } = window.getNormalBounds()
  state.windowState.save({ x, y, width, height, maximized: window.isMaximized(), alwaysOnTop: window.isAlwaysOnTop() })
}

const setAlwaysOnTop = ({ checked }) => {
  if (!state.window || state.window.isDestroyed()) return
  state.window.setAlwaysOnTop(checked)
  if (state.help && !state.help.isDestroyed()) state.help.setAlwaysOnTop(checked)
  rememberBounds(state.window)
}

const focusWindow = () => {
  if (!app.isReady()) return
  if (!state.window || state.window.isDestroyed()) {
    state.window = createWindow()
    return
  }
  if (state.window.isMinimized()) state.window.restore()
  state.window.show()
  state.window.focus()
}

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
    { id: ALWAYS_ON_TOP_ID, label: 'Always on Top', type: 'checkbox', click: setAlwaysOnTop },
    { type: 'separator' },
    { role: 'togglefullscreen' },
  ] },
  { role: 'windowMenu' },
  { role: 'help', submenu: [
    { id: HELP_ID, label: 'Noise Help', accelerator: isMac ? 'Command+?' : 'F1', click: openHelp },
    { type: 'separator' },
    { label: 'Source on GitHub', click: () => openExternalLink(SOURCE_URL) },
  ] },
])

main()
