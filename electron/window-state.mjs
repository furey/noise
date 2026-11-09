import fs from 'node:fs'
import path from 'node:path'

export const DEFAULT_BOUNDS = Object.freeze({ width: 960, height: 600 })
export const MIN_SIZE = Object.freeze({ width: 280, height: 220 })

const TITLE_BAR_PX = 32
const MIN_VISIBLE_PX = 48

export const createWindowState = ({ folder, displays }) => {
  const filePath = path.join(folder, 'window-state.json')
  return {
    load: () => usableState({ saved: readJson(filePath), displays: displays() }),
    save: state => writeJsonAtomically({ filePath, value: state }),
  }
}

export const usableState = ({ saved, displays }) => {
  if (!isPlainObject(saved)) return { ...DEFAULT_BOUNDS, maximized: false }
  const width = sizeOr(saved.width, { min: MIN_SIZE.width, fallback: DEFAULT_BOUNDS.width })
  const height = sizeOr(saved.height, { min: MIN_SIZE.height, fallback: DEFAULT_BOUNDS.height })
  const maximized = saved.maximized === true
  const placed = Number.isInteger(saved.x) && Number.isInteger(saved.y)
  const bounds = { x: saved.x, y: saved.y, width, height }
  const area = placed && displays.find(display => showsTitleBar(bounds, display))
  if (area) return { ...bounds, ...fitSize(bounds, area), maximized }
  return { ...fitSize(bounds, largestOf(displays)), maximized }
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
