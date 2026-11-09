import { app, BrowserWindow, Menu, protocol, screen, session } from 'electron'
import path from 'node:path'
import { APP_ORIGIN, APP_SCHEME, isAppUrl, serveAppFile } from './app-files.mjs'
import { createInstallAccess, grantSandboxReadAccess } from './install-access.mjs'
import { MIN_SIZE, createWindowState } from './window-state.mjs'

const BACKGROUND = '#050505'
const ALWAYS_ON_TOP_ID = 'always-on-top'
const SHOW_FALLBACK_MS = 5000
const PAGE_URL = `${APP_ORIGIN}/index.html`
const BLOCKED_URLS = ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*', 'file://*/*']
const isMac = process.platform === 'darwin'

const state = { window: null, windowState: null, installAccess: null }

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
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false,
      devTools: !app.isPackaged,
    },
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
  })
  window.loadURL(PAGE_URL).catch(() => null)
  return window
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
  ...(isMac ? [{ role: 'appMenu' }] : [{ role: 'fileMenu' }]),
  { role: 'editMenu' },
  { label: 'View', submenu: [
    { id: ALWAYS_ON_TOP_ID, label: 'Always on Top', type: 'checkbox', click: setAlwaysOnTop },
    { type: 'separator' },
    { role: 'togglefullscreen' },
  ] },
  { role: 'windowMenu' },
])

main()
