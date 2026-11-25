import { clamp, clampPos } from './ui/colours.js'

export const STORE_KEY = 'noise-settings'
export const MIN_VOLUME = 0.1
export const MUSIC_STEPS = Object.freeze(['off', 'over', 'alone'])
export const PIECES = Object.freeze(['liquid', 'helix'])
export const MUSIC_CYCLE = Object.freeze([
  { music: 'off', piece: 'liquid' },
  { music: 'alone', piece: 'liquid' },
  { music: 'over', piece: 'liquid' },
  { music: 'alone', piece: 'helix' },
  { music: 'over', piece: 'helix' },
])
export const DEFAULT_SETTINGS = Object.freeze({ pos: 0, volume: 0.6, wave: false, music: 'off', piece: 'liquid' })

export const clampVolume = volume => clamp(volume, MIN_VOLUME, 1)

export const loadSettings = (storage = browserStorage()) => {
  const saved = readSaved(storage)
  return {
    pos: Number.isFinite(saved.pos) ? clampPos(saved.pos) : DEFAULT_SETTINGS.pos,
    volume: Number.isFinite(saved.volume) ? clampVolume(saved.volume) : DEFAULT_SETTINGS.volume,
    wave: saved.wave === true,
    music: MUSIC_STEPS.includes(saved.music) ? saved.music : DEFAULT_SETTINGS.music,
    piece: PIECES.includes(saved.piece) ? saved.piece : DEFAULT_SETTINGS.piece,
  }
}

export const saveSettings = ({ pos, volume, wave, music, piece }, storage = browserStorage()) => {
  try {
    storage.setItem(STORE_KEY, JSON.stringify({ pos, volume, wave, music, piece }))
    return true
  } catch {
    return false
  }
}

const readSaved = storage => {
  try {
    const saved = JSON.parse(storage.getItem(STORE_KEY))
    return saved && typeof saved === 'object' ? saved : {}
  } catch {
    return {}
  }
}

const browserStorage = () => {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}
