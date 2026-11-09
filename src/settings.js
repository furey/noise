import { clamp, clampPos } from './ui/colours.js'

export const STORE_KEY = 'noise-settings'
export const MIN_VOLUME = 0.1
export const DEFAULT_SETTINGS = Object.freeze({ pos: 0, volume: 0.6 })

export const clampVolume = volume => clamp(volume, MIN_VOLUME, 1)

export const loadSettings = (storage = browserStorage()) => {
  const saved = readSaved(storage)
  return {
    pos: Number.isFinite(saved.pos) ? clampPos(saved.pos) : DEFAULT_SETTINGS.pos,
    volume: Number.isFinite(saved.volume) ? clampVolume(saved.volume) : DEFAULT_SETTINGS.volume,
  }
}

export const saveSettings = ({ pos, volume }, storage = browserStorage()) => {
  try {
    storage.setItem(STORE_KEY, JSON.stringify({ pos, volume }))
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
