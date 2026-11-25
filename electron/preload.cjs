const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('noiseDesktop', {
  onAutoHide: listener => {
    ipcRenderer.on('auto-hide', (_event, { enabled, inside }) => listener({ enabled: enabled === true, inside: inside !== false }))
  },
  setChromeHidden: hidden => ipcRenderer.send('chrome-hidden', hidden === true),
  pointerEntered: () => ipcRenderer.send('pointer-entered'),
  onCommand: listener => {
    ipcRenderer.on('command', (_event, command) => listener(String(command)))
  },
  music: {
    onStatus: listener => {
      ipcRenderer.on('music-status', (_event, status) => listener({ ready: status?.ready === true }))
    },
    search: query => ipcRenderer.invoke('music-search', String(query ?? '')),
    play: track => ipcRenderer.invoke('music-play', track),
    cached: () => ipcRenderer.invoke('music-cached'),
    advance: () => ipcRenderer.invoke('music-advance'),
    upcoming: ({ step, seconds }) => ipcRenderer.invoke('music-upcoming', { step: step === -1 ? -1 : 1, seconds: Number(seconds) || 0 }),
    previous: seconds => ipcRenderer.invoke('music-previous', { seconds: Number(seconds) || 0 }),
    prepare: track => ipcRenderer.invoke('music-prepare', track),
    setSearchOpen: open => ipcRenderer.send('music-search-open', open === true),
  },
  setMenuState: ({ playing, colour, wave, music, timer, song }) =>
    ipcRenderer.send('menu-state', { playing, colour, wave, music, timer, song }),
})
