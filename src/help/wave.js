import { COLOURS } from '../ui/colours.js'

export const WAVE_SPEED_MS = 900
export const WAVE_PERIOD_MS = Math.round(2 * Math.PI * WAVE_SPEED_MS)
export const WAVE_BARS = '▁▂▃▄▅▆▇█'

const COLUMN_SPREAD = 5

export const waveLevel = ({ column, phase }) => (Math.sin(column / COLUMN_SPREAD - phase) + 1) / 2

export const waveStep = level => Math.min(WAVE_BARS.length - 1, Math.floor(level * WAVE_BARS.length))

export const waveColour = level => COLOURS[Math.min(COLOURS.length - 1, Math.floor(level * COLOURS.length))]

export const columnLagMs = column => WAVE_SPEED_MS * column / COLUMN_SPREAD
