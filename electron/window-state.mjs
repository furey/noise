import fs from 'node:fs'
import path from 'node:path'

export const DEFAULT_BOUNDS = Object.freeze({ width: 1100, height: 720 })
export const MIN_SIZE = Object.freeze({ width: 420, height: 520 })

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
  if (placed && isOnSomeDisplay({ bounds, displays })) return { ...bounds, maximized }
  return { width, height, maximized }
}

const sizeOr = (value, { min, fallback }) =>
  Number.isInteger(value) && value >= min && value <= 100000 ? value : fallback

const isOnSomeDisplay = ({ bounds, displays }) => displays.some(area => overlaps(bounds, area))

const overlaps = (a, b) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

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
