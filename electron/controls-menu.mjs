export const COLOUR_LABELS = Object.freeze(['Brown', 'Pink', 'White', 'Blue', 'Violet'])
export const MUSIC_LABELS = Object.freeze(['Off', 'Liquid Alone', 'Liquid with Noise', 'Helix Alone', 'Helix with Noise'])
export const TIMER_CHOICES = Object.freeze([
  { label: 'Off', minutes: 0, size: 0 },
  { label: '30 Minutes', minutes: 30, size: 3 },
  { label: '20 Minutes', minutes: 20, size: 2 },
  { label: '10 Minutes', minutes: 10, size: 1 },
])

export const usableMenuState = raw => ({
  playing: raw?.playing === true,
  colour: indexOr(raw?.colour, COLOUR_LABELS.length),
  wave: raw?.wave === true,
  music: indexOr(raw?.music, MUSIC_LABELS.length),
  timer: TIMER_CHOICES.some(choice => choice.size === raw?.timer) ? raw.timer : 0,
  song: raw?.song === true,
})

export const controlsMenu = ({ state, send, refresh, searchOpen = false, musicReady = false }) => {
  const item = ({ command, accelerator, ...rest }) => ({
    registerAccelerator: false,
    ...(accelerator && !searchOpen ? { accelerator } : {}),
    ...rest,
    click: (_item, _window, event) => event?.triggeredByAccelerator ? refresh() : send(command),
  })
  return {
    label: 'Controls',
    submenu: [
      ...(musicReady ? [
        item({ label: 'Search Music…', accelerator: '/', command: 'search' }),
        item({ label: 'Next Song', accelerator: 'CmdOrCtrl+Right', command: 'next-song', enabled: state.song }),
        item({ label: 'Previous Song', accelerator: 'CmdOrCtrl+Left', command: 'previous-song', enabled: state.song }),
        { type: 'separator' },
      ] : []),
      item({ label: state.playing ? 'Pause' : 'Play', accelerator: 'Space', command: 'play' }),
      item({ label: 'Stop', accelerator: 'Escape', command: 'stop' }),
      { type: 'separator' },
      ...COLOUR_LABELS.map((label, index) => item({
        label, type: 'checkbox', checked: state.colour === index, accelerator: `${index + 1}`, command: `colour:${index}`,
      })),
      item({ label: 'Colour Down', accelerator: 'Left', command: 'colour-down' }),
      item({ label: 'Colour Up', accelerator: 'Right', command: 'colour-up' }),
      { type: 'separator' },
      item({ label: 'Volume Up', accelerator: 'Up', command: 'volume-up' }),
      item({ label: 'Volume Down', accelerator: 'Down', command: 'volume-down' }),
      { type: 'separator' },
      item({ label: 'Wave Mode', type: 'checkbox', checked: state.wave, accelerator: 'W', command: 'wave' }),
      { label: 'Music', submenu: MUSIC_LABELS.map((label, step) => item({
        label, type: 'checkbox', checked: state.music === step, command: `music:${step}`,
      })) },
      item({ label: 'Next Music Step', accelerator: 'M', command: 'music-next' }),
      { label: 'Sleep Timer', submenu: TIMER_CHOICES.map(({ label, minutes, size }) => item({
        label, type: 'checkbox', checked: state.timer === size, command: `timer:${minutes}`,
      })) },
      item({ label: 'Next Timer Step', accelerator: 'T', command: 'timer-next' }),
    ],
  }
}

const indexOr = (value, length) => Number.isInteger(value) && value >= 0 && value < length ? value : -1
