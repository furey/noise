import { MUSIC_CYCLE } from '../settings.js'
import { COLOURS } from '../ui/colours.js'
import { glyphStroke, traceNoteGlyph, tracePlus, traceWaveGlyph } from '../ui/glyphs.js'
import { CONTROL_PX, DOT_GAP_PX, DOT_PX, FULL_CHROME, timerWidth } from '../ui/layout.js'
import { TIMER_STEPS } from '../ui/timer.js'

const BOX = { left: 0, top: 0, width: CONTROL_PX, height: CONTROL_PX }
const LOGO = { half: 217, amp: 175, stroke: 119, steps: 48, width: 58 }
const MUSIC_CAPTIONS = { off: () => 'Off', alone: piece => `${piece} alone`, over: piece => `${piece} +\u00a0noise` }

export const controlDrawings = () => ({
  'wave mode': { mark: wavePill(false), states: [false, true].map(waveState) },
  music: { mark: musicPill(MUSIC_CYCLE[0]), states: MUSIC_CYCLE.map(musicState) },
  'sleep timer': { mark: timerPill(TIMER_STEPS[0].size), states: [0, ...TIMER_STEPS.map(step => step.size)].map(timerState) },
})

export const zoneDrawings = () => ({ 'COLOUR SLIDER': '<div class="slider"><i></i></div>' })

export const logoMark = () => {
  const reach = LOGO.half + LOGO.stroke / 2
  const rise = LOGO.amp + LOGO.stroke / 2
  const points = Array.from({ length: LOGO.steps + 1 }, (_, step) => {
    const u = step / LOGO.steps
    return `${round(-LOGO.half + u * LOGO.half * 2)},${round(-Math.sin(u * Math.PI * 2) * LOGO.amp)}`
  })
  const stops = COLOURS.map(({ hex }, index) => `<stop offset="${index / (COLOURS.length - 1)}" stop-color="${hex}"/>`)
  return `<svg class="logo" width="${LOGO.width}" height="${round(LOGO.width * rise / reach)}" viewBox="${-reach} ${-rise} ${reach * 2} ${rise * 2}" aria-hidden="true">`
    + `<defs><linearGradient id="logo-colours" gradientUnits="userSpaceOnUse" x1="${-reach}" y1="0" x2="${reach}" y2="0">${stops.join('')}</linearGradient></defs>`
    + `<polyline points="${points.join(' ')}" fill="none" stroke="url(#logo-colours)" stroke-width="${LOGO.stroke}" stroke-linecap="round" stroke-linejoin="round"/></svg>`
}

const waveState = on => ({ id: `wave-${on ? 'on' : 'off'}`, caption: on ? 'On' : 'Off', drawing: wavePill(on) })

const musicState = step => ({
  id: `music-${step.music}-${step.piece}`,
  caption: MUSIC_CAPTIONS[step.music](capitalise(step.piece)),
  drawing: musicPill(step),
})

const timerState = size => ({
  id: `timer-${size}`,
  caption: size ? `${TIMER_STEPS.find(step => step.size === size).minutes} min` : 'Off',
  drawing: timerPill(size),
})

const wavePill = on => pill({ on, glyph: strokePath({ d: traced(g => traceWaveGlyph({ g, box: BOX })), width: glyphStroke({ on }) }) })

const musicPill = ({ music, piece }) => {
  const withPlus = music === 'over'
  const on = music !== 'off'
  const note = strokePath({ d: traced(g => traceNoteGlyph({ g, box: BOX, rising: piece === 'helix', withPlus })), width: glyphStroke({ on }) })
  const plus = withPlus ? strokePath({ d: traced(g => tracePlus({ g, box: BOX })), width: glyphStroke({ on, plus: true }) }) : ''
  return pill({ on, glyph: note + plus })
}

const timerPill = size => {
  const width = timerWidth(FULL_CHROME, size)
  const dots = Array.from({ length: Math.max(1, size) }, (_, dot) => width - CONTROL_PX / 2 - dot * (DOT_PX + DOT_GAP_PX))
  return pill({ width, on: size > 0, glyph: dots.map(x => `<circle cx="${x}" cy="${CONTROL_PX / 2}" r="${DOT_PX / 2}" stroke="none"/>`).join('') })
}

const pill = ({ width = CONTROL_PX, on, glyph }) =>
  `<svg class="pill" width="${width}" height="${CONTROL_PX}" viewBox="0 0 ${width} ${CONTROL_PX}" aria-hidden="true">`
  + `<rect class="pill-body" width="${width}" height="${CONTROL_PX}" rx="${CONTROL_PX / 2}"/><g class="${on ? 'ink' : 'cut'}">${glyph}</g></svg>`

const strokePath = ({ d, width }) =>
  `<path d="${d}" fill="none" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`

const traced = trace => {
  const parts = []
  trace({
    moveTo: (x, y) => parts.push(`M${round(x)} ${round(y)}`),
    lineTo: (x, y) => parts.push(`L${round(x)} ${round(y)}`),
  })
  return parts.join('')
}

const capitalise = word => `${word[0].toUpperCase()}${word.slice(1)}`

const round = value => Math.round(value * 100) / 100
