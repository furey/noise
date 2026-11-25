import fs from 'node:fs'
import path from 'node:path'

export const DEFAULT_BOUNDS = Object.freeze({ width: 800, height: 600 })
export const MIN_SIZE = Object.freeze({ width: 280, height: 220 })

const TITLE_BAR_PX = 32
const FIRST_RUN_VIEW = Object.freeze({ alwaysOnTop: true, autoHideControls: true })
const MIN_VISIBLE_PX = 48

export const createWindowState = ({ folder, displays, pointerArea }) => {
  const filePath = path.join(folder, 'window-state.json')
  return {
    load: () => usableState({ saved: readJson(filePath), displays: displays(), pointerArea: pointerArea?.() }),
    loadPark: () => readJson(filePath)?.park ?? null,
    save: state => writeJsonAtomically({ filePath, value: state }),
  }
}

export const defaultBounds = workArea => centredIn(DEFAULT_BOUNDS, workArea)

export const parkedBounds = ({ workArea, size, inset }) => ({
  x: workArea.x + workArea.width - size.width - inset,
  y: workArea.y + workArea.height - size.height - inset,
  width: size.width,
  height: size.height,
})

export const usableState = ({ saved, displays, pointerArea = largestOf(displays) }) => {
  if (!isPlainObject(saved)) return { ...centredIn(DEFAULT_BOUNDS, pointerArea), maximized: false, ...FIRST_RUN_VIEW }
  const width = sizeOr(saved.width, { min: MIN_SIZE.width, fallback: DEFAULT_BOUNDS.width })
  const height = sizeOr(saved.height, { min: MIN_SIZE.height, fallback: DEFAULT_BOUNDS.height })
  const maximized = saved.maximized === true
  const alwaysOnTop = saved.alwaysOnTop === true
  const autoHideControls = saved.autoHideControls === true
  const placed = Number.isInteger(saved.x) && Number.isInteger(saved.y)
  const bounds = { x: saved.x, y: saved.y, width, height }
  const area = placed && displays.find(display => showsTitleBar(bounds, display))
  if (area) return { ...bounds, ...fitSize(bounds, area), maximized, alwaysOnTop, autoHideControls }
  return { ...centredIn({ width, height }, pointerArea), maximized, alwaysOnTop, autoHideControls }
}

export const restoreBounds = ({ saved, displays, workArea }) => {
  const fallback = centredIn(DEFAULT_BOUNDS, workArea)
  if (!isRestorable(saved)) return fallback
  const area = displays.find(display => showsTitleBar(saved, display))
  if (!area) return fallback
  const { x, y } = saved
  return { x, y, ...fitSize(saved, area) }
}

export const resumablePark = ({ saved, expected, placed }) =>
  isPlainObject(saved) && sameBounds(expected, placed) ? saved : null

export const sameBounds = (a, b) => a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height

const isRestorable = saved => isPlainObject(saved)
  && [saved.x, saved.y].every(Number.isInteger)
  && sizeOr(saved.width, { min: MIN_SIZE.width, fallback: 0 }) > 0
  && sizeOr(saved.height, { min: MIN_SIZE.height, fallback: 0 }) > 0
  && (saved.width > MIN_SIZE.width || saved.height > MIN_SIZE.height)

const centredIn = (size, area) => {
  if (!area) return { ...size }
  const { width, height } = fitSize(size, area)
  return { x: area.x + Math.round((area.width - width) / 2), y: area.y + Math.round((area.height - height) / 2), width, height }
}

const sizeOr = (value, { min, fallback }) =>
  Number.isInteger(value) && value >= min && value <= 100000 ? value : fallback

const showsTitleBar = (bounds, area) => {
  const visibleWidth = Math.min(bounds.x + bounds.width, area.x + area.width) - Math.max(bounds.x, area.x)
  return visibleWidth >= MIN_VISIBLE_PX && bounds.y >= area.y && bounds.y + TITLE_BAR_PX <= area.y + area.height
}

const fitSize = ({ width, height }, area) => area
  ? { width: Math.max(MIN_SIZE.width, Math.min(width, area.width)), height: Math.max(MIN_SIZE.height, Math.min(height, area.height)) }
  : { width, height }

const largestOf = displays => displays.reduce((largest, area) =>
  !largest || area.width * area.height > largest.width * largest.height ? area : largest, null)

const isPlainObject = value => typeof value === 'object' && value !== null && !Array.isArray(value)

const readJson = filePath => {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return null
  }
}

const writeJsonAtomically = ({ filePath, value }) => {
  const tempPath = `${filePath}.${process.pid}.tmp`
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(tempPath, JSON.stringify(value))
    fs.renameSync(tempPath, filePath)
  } catch {
    fs.rmSync(tempPath, { force: true })
    return false
  }
  return true
}
