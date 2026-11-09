export const CAP_GRAVITY = 1.4
export const CAP_HOLD_S = 0.35
export const DEBRIS_GRAVITY = 3.2

export const reassignChips = ({ chips, cols, playing, levels = [] }) => {
  if (!playing) return dropChips(chips)
  const heights = Array.from({ length: cols }, (_, col) => resumeHeight({ chips, col, level: levels[col] }))
  chips.length = 0
  for (let col = 0; col < cols; col++) chips.push(createChip(col, heights[col]))
}

export const stepChips = ({ chips, levels, dt, segments, reducedMotion }) => {
  for (let i = chips.length - 1; i >= 0; i--) {
    const chip = chips[i]
    const floor = Math.round((levels[chip.col] || 0) * segments) / segments
    if (chip.role === 'cap') stepCap({ chip, floor, dt })
    else if (stepDebris({ chip, dt, reducedMotion })) chips.splice(i, 1)
  }
}

export const chipSegment = (chip, segments) => Math.max(0, Math.min(segments - 1, Math.floor(chip.y * segments)))

const createChip = (col, y = 0) => ({ col, y, vy: 0, role: 'cap', hold: 0, rose: false })

const resumeHeight = ({ chips, col, level = 0 }) =>
  chips.reduce((height, chip) => chip.col === col ? Math.max(height, chip.y) : height, Math.max(0, level))

const dropChips = chips => {
  for (const chip of chips) {
    chip.role = 'debris'
    chip.vy = Math.min(chip.vy, 0)
  }
}

const stepCap = ({ chip, floor, dt }) => {
  chip.rose = floor > chip.y
  if (chip.rose) {
    chip.y = floor
    chip.vy = 0
    chip.hold = CAP_HOLD_S
    return
  }
  if (chip.hold > 0) {
    chip.hold -= dt
    return
  }
  chip.vy -= CAP_GRAVITY * dt
  chip.y = Math.max(floor, chip.y + chip.vy * dt)
  if (chip.y === floor) chip.vy = 0
}

const stepDebris = ({ chip, dt, reducedMotion }) => {
  if (reducedMotion) return true
  chip.vy -= DEBRIS_GRAVITY * dt
  chip.y += chip.vy * dt
  return chip.y < 0
}
