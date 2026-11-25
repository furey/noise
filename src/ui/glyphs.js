export const GLYPH_PX = 2.8

export const PLUS = { half: 3, stroke: 2.4, x: -6.2, noteX: 5.4 }

const SOLID_THINNING = 2.4 / 2.8

export const glyphStroke = ({ on, plus = false, scale = 1 }) => (plus ? PLUS.stroke : GLYPH_PX) * (on ? SOLID_THINNING : 1) * scale

export const traceWaveGlyph = ({ g, box, scale = 1 }) => {
  const cx = box.left + box.width / 2
  const cy = box.top + box.height / 2
  const half = WAVE.half * scale
  const amp = WAVE.amp * scale
  for (let step = 0; step <= 24; step++) {
    const u = step / 24
    const x = cx - half + u * half * 2
    const y = cy - Math.sin(u * Math.PI * 2) * amp
    if (step) g.lineTo(x, y)
    else g.moveTo(x, y)
  }
}

export const tracePlus = ({ g, box, scale = 1 }) => {
  const x = box.left + box.width / 2 + PLUS.x * scale
  const y = box.top + box.height / 2
  const half = PLUS.half * scale
  g.moveTo(x - half, y)
  g.lineTo(x + half, y)
  g.moveTo(x, y - half)
  g.lineTo(x, y + half)
}

export const traceNoteGlyph = ({ g, box, rising, withPlus, scale = 1 }) => {
  const stem = NOTE.stem * scale
  const hook = { dx: NOTE.hook.dx * scale, dy: NOTE.hook.dy * scale }
  const x = box.left + box.width / 2 + (withPlus ? PLUS.noteX : NOTE.shift) * scale
  const top = box.top + box.height / 2 - stem / 2
  const lift = (rising ? 1 : -1) * NOTE.slope * scale / 2
  const left = { x: x - NOTE.half * scale, top: top + lift }
  const right = { x: x + NOTE.half * scale, top: top - lift }
  g.moveTo(left.x - hook.dx, left.top + stem + hook.dy)
  g.lineTo(left.x, left.top + stem)
  g.lineTo(left.x, left.top)
  g.lineTo(right.x, right.top)
  g.lineTo(right.x, right.top + stem)
  g.lineTo(right.x - hook.dx, right.top + stem + hook.dy)
}

const WAVE = { half: 8.5, amp: 4.6 }

const NOTE = { half: 3.6, stem: 8.6, slope: 3, hook: { dx: 2.8, dy: 1.1 }, shift: 0.94 }
