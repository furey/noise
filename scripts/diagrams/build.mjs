import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '../..')
const OUT = path.join(ROOT, 'docs', 'diagrams')
const CONTROLS = path.join(ROOT, 'docs', 'controls')
const APP = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).name

const APPS = {
  noise: {
    wave: [38, 38], music: [400, 38], timer: [762, 38], centre: [400, 300], colour: [150, 556],
    colourName: 'Colour slider', buttonRadius: 12,
  },
  'noise-8bit': {
    wave: [33, 33], music: [400, 33], timer: [767, 33], centre: [400, 300], colour: [150, 567],
    colourName: 'Colour strip', buttonRadius: 4,
  },
}

const THEMES = {
  light: { ink: '#1f2328', muted: '#59636e', line: '#a8a8ae', page: '#ffffff', panel: 'rgba(142,150,170,0.14)', accent: '#b45309' },
  dark: { ink: '#e6edf3', muted: '#9198a1', line: '#5c5c63', page: '#0d1117', panel: 'rgba(101,117,133,0.16)', accent: '#fbbf24' },
}

const CYCLES = [
  ['Wave mode', [['wave-off', 'Off'], ['wave-on', 'On']]],
  ['Music', [['music-off', 'Off'], ['music-liquid-alone', 'Liquid'], ['music-liquid-noise', 'Liquid + noise'], ['music-helix-alone', 'Helix'], ['music-helix-noise', 'Helix + noise']]],
  ['Sleep timer', [['timer-off', 'Off'], ['timer-30', '30 min'], ['timer-20', '20 min'], ['timer-10', '10 min']]],
]

const main = () => {
  const app = APPS[APP]
  if (!app) throw new Error(`no diagram settings for ${APP}`)
  fs.mkdirSync(OUT, { recursive: true })
  for (const [theme, th] of Object.entries(THEMES)) {
    write(`buttons-screen-${theme}.svg`, screen({ app, th, wide: true }))
    write(`buttons-screen-phone-${theme}.svg`, screen({ app, th, wide: false }))
    write(`buttons-cycles-${theme}.svg`, cycles({ app, th }))
    write(`buttons-cycles-phone-${theme}.svg`, cyclesPhone({ app, th }))
  }
}

const write = (name, svg) => {
  fs.writeFileSync(path.join(OUT, name), svg)
  console.log(path.join('docs', 'diagrams', name))
}

const screen = ({ app, th, wide }) => {
  const W = wide ? 680 : 360
  const H = wide ? 640 : 560
  const sw = wide ? 440 : 320
  const sh = sw * 0.75
  const sx = (W - sw) / 2
  const sy = wide ? 170 : 150
  const s = sw / 800
  const at = ([x, y]) => [sx + x * s, sy + y * s]
  const [wx, wy] = at(app.wave)
  const [mx, my] = at(app.music)
  const [tx, ty] = at(app.timer)
  const [cx, cy] = at(app.centre)
  const [lx, ly] = at(app.colour)
  const labelX = wide ? [110, 340, 570] : [62, 180, 298]
  const title = wide ? 15 : 13.5
  const sub = wide ? 13 : 11.5
  const top = (x, heading, lines) => text(heading, x, 46, { size: title, weight: 600, fill: th.ink })
    + lines.map((line, i) => text(line, x, 64 + i * (sub + 5), { size: sub, fill: th.muted })).join('')
  const musicLines = wide ? ['Tap for Liquid or Helix,', 'alone or over the noise'] : ['Liquid or Helix,', 'alone or over', 'the noise']
  const sideLines = wide ? ['Tap to turn on or off'] : ['Tap to turn', 'on or off']
  const timerLines = wide ? ['Tap for 30, 20, or 10 min'] : ['Tap for 30,', '20, or 10 min']
  const lowY = H - (wide ? 62 : 70)
  const bottom = (x, heading, lines) => text(heading, x, lowY, { size: title, weight: 600, fill: th.ink })
    + lines.map((line, i) => text(line, x, lowY + 20 + i * (sub + 5), { size: sub, fill: th.muted })).join('')
  const topEnd = 64 + (musicLines.length - 1) * (sub + 5) + 10
  const sideEnd = 64 + (sideLines.length - 1) * (sub + 5) + 10
  const [leftX, rightX] = wide ? [160, 520] : [90, 270]
  return svg(W, H, `
<defs><clipPath id="win"><rect x="${sx}" y="${sy}" width="${sw}" height="${sh}" rx="12"/></clipPath></defs>
<image href="${screenshot()}" x="${sx}" y="${sy}" width="${sw}" height="${sh}" clip-path="url(#win)"/>
<rect x="${sx}" y="${sy}" width="${sw}" height="${sh}" rx="12" fill="none" stroke="${th.line}" stroke-opacity=".5"/>
${top(labelX[0], 'Wave mode', sideLines)}${top(labelX[1], 'Music', musicLines)}${top(labelX[2], 'Sleep timer', timerLines)}
${link(`M${labelX[0]} ${sideEnd} C${labelX[0]} ${sideEnd + 40} ${wx} ${wy - 50} ${wx} ${wy - 13}`, th)}${ring(wx, wy, th)}
${link(`M${labelX[1]} ${topEnd} L${mx} ${my - 13}`, th)}${ring(mx, my, th)}
${link(`M${labelX[2]} ${sideEnd + (timerLines.length - sideLines.length) * (sub + 5)} C${labelX[2]} ${sideEnd + 40} ${tx} ${ty - 50} ${tx} ${ty - 13}`, th)}${ring(tx, ty, th)}
${dot(cx, cy, th)}${link(`M${cx} ${cy} C${cx + 40} ${cy + 100} ${rightX} ${lowY - 60} ${rightX} ${lowY - 22}`, th)}
${bottom(rightX, 'Anywhere on the screen', wide ? ['Tap to play or pause', 'Drag up or down for volume'] : ['Tap: play or pause', 'Drag up or down:', 'volume'])}
${dot(lx, ly, th)}${link(`M${lx} ${ly} C${lx - 30} ${ly + 50} ${leftX} ${lowY - 60} ${leftX} ${lowY - 22}`, th)}
${bottom(leftX, app.colourName, wide ? ['Tap or drag to pick a colour'] : ['Tap or drag', 'to pick a colour'])}`)
}

const cycles = ({ app, th }) => {
  const W = 680
  const rowH = 170
  const H = 70 + CYCLES.length * rowH
  const body = CYCLES.map(([name, states], r) => {
    const y = 70 + r * rowH
    const step = 120
    const x0 = 70
    const items = states.map(([image, label], i) => {
      const x = x0 + i * step
      const arrow = i < states.length - 1
        ? `<path d="M${x + 44} ${y + 70} L${x + step - 44} ${y + 70}" stroke="${th.line}" stroke-width="1.5" stroke-linecap="round" marker-end="url(#chev)"/>`
        : ''
      return button({ app, image, cx: x, cy: y + 70, id: `c${r}${i}` }) + text(label, x, y + 116, { size: 12.5, fill: th.muted }) + arrow
    }).join('')
    const xe = x0 + (states.length - 1) * step
    const back = returnLine([[xe, y + 126], [xe, y + 144], [x0, y + 144], [x0, y + 128]], th)
    return `<rect x="20" y="${y}" width="${W - 40}" height="${rowH - 16}" rx="18" fill="${th.panel}"/>`
      + text(name, 40, y + 28, { size: 14, weight: 600, fill: th.ink, anchor: 'start' }) + items + back
  }).join('')
  return svg(W, H + 24, `<defs>${marker(th)}</defs>
${text('Each tap moves a button to its next setting', W / 2, 34, { size: 15, weight: 600, fill: th.ink })}
${body}
${text('The dashed line: the next tap goes back to the start.', W / 2, H + 12, { size: 12.5, fill: th.muted })}`)
}

const cyclesPhone = ({ app, th }) => {
  const W = 360
  const colW = 108
  const stepY = 84
  const top = 92
  const longest = Math.max(...CYCLES.map(([, states]) => states.length))
  const H = top + (longest - 1) * stepY + 58 + 56
  const body = CYCLES.map(([name, states], c) => {
    const x = 18 + colW / 2 + c * (colW + 9)
    const items = states.map(([image, label], i) => {
      const y = top + i * stepY
      const arrow = i < states.length - 1
        ? `<path d="M${x} ${y + 44} L${x} ${y + stepY - 30}" stroke="${th.line}" stroke-width="1.5" stroke-linecap="round" marker-end="url(#chev)"/>`
        : ''
      return button({ app, image, cx: x, cy: y, id: `p${c}${i}`, size: 40 }) + text(label, x, y + 37, { size: 12, fill: th.muted }) + arrow
    }).join('')
    const yEnd = top + (states.length - 1) * stepY
    const back = returnLine([[x + 24, yEnd], [x + 44, yEnd], [x + 44, top], [x + 25, top]], th)
    return `<rect x="${x - colW / 2}" y="44" width="${colW}" height="${top - 44 + (states.length - 1) * stepY + 58}" rx="18" fill="${th.panel}"/>`
      + text(name, x, 64, { size: 13.5, weight: 600, fill: th.ink }) + items + (states.length > 1 ? back : '')
  }).join('')
  return svg(W, H, `<defs>${marker(th)}</defs>
${text('Each tap moves a button to its next setting', W / 2, 26, { size: 13.5, weight: 600, fill: th.ink })}
${body}
${text('Dashed line: the next tap goes back to the start.', W / 2, H - 18, { size: 11.5, fill: th.muted })}`)
}

const button = ({ app, image, cx, cy, id, size = 52 }) => {
  const file = path.join(CONTROLS, `${image}.png`)
  const [w, h] = pngSize(file)
  const width = size * w / h
  return `<clipPath id="${id}"><rect x="${cx - width / 2}" y="${cy - size / 2}" width="${width}" height="${size}" rx="${app.buttonRadius}"/></clipPath>`
    + `<image href="data:image/png;base64,${fs.readFileSync(file).toString('base64')}" x="${cx - width / 2}" y="${cy - size / 2}" width="${width}" height="${size}" clip-path="url(#${id})"/>`
}

const pngSize = file => {
  const head = fs.readFileSync(file).subarray(16, 24)
  return [head.readUInt32BE(0), head.readUInt32BE(4)]
}

const screenshot = () => `data:image/jpeg;base64,${fs.readFileSync(path.join(OUT, 'app-screen.jpg')).toString('base64')}`

const svg = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" ${FONT}>${body}</svg>\n`

const text = (t, x, y, { size = 13, weight = 400, fill, anchor = 'middle' } = {}) =>
  `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${t}</text>`

const link = (d, th) => `<path d="${d}" fill="none" stroke="${th.line}" stroke-width="1.5" stroke-linecap="round"/>`

const returnLine = (points, th) => {
  const [first, ...rest] = points
  const r = 8
  const corners = rest.slice(0, -1).map((point, i) => {
    const prev = points[i]
    const next = rest[i + 1]
    const into = toward(point, prev, r)
    const out = toward(point, next, r)
    return `L${into[0]} ${into[1]} Q${point[0]} ${point[1]} ${out[0]} ${out[1]}`
  }).join(' ')
  const end = points.at(-1)
  const before = points.at(-2)
  const stub = toward(end, before, 10)
  const dashed = `<path d="M${first[0]} ${first[1]} ${corners} L${stub[0]} ${stub[1]}" fill="none" stroke="${th.line}" stroke-width="1.5" stroke-dasharray="4 4" stroke-linecap="round" stroke-linejoin="round"/>`
  const solid = `<path d="M${stub[0]} ${stub[1]} L${end[0]} ${end[1]}" fill="none" stroke="${th.line}" stroke-width="1.5" stroke-linecap="round"/>`
  return dashed + solid + arrowHead(end, before, th)
}

const toward = ([x, y], [tx, ty], r) => {
  const length = Math.hypot(tx - x, ty - y) || 1
  return [+(x + (tx - x) / length * r).toFixed(1), +(y + (ty - y) / length * r).toFixed(1)]
}

const arrowHead = ([x, y], [fx, fy], th) => {
  const angle = Math.atan2(y - fy, x - fx)
  const size = 7.5
  const wing = side => [x - size * Math.cos(angle + side * 0.6), y - size * Math.sin(angle + side * 0.6)].map(v => +v.toFixed(1))
  const [a, b] = [wing(1), wing(-1)]
  return `<path d="M${a[0]} ${a[1]} L${x} ${y} L${b[0]} ${b[1]}" fill="none" stroke="${th.line}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`
}

const ring = (x, y, th) => `<circle cx="${x}" cy="${y}" r="13" fill="none" stroke="${th.accent}" stroke-width="2"/>`

const dot = (x, y, th) => `<circle cx="${x}" cy="${y}" r="3.5" fill="${th.accent}"/>`

const marker = th => `<marker id="chev" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M1 1.5 L8 5 L1 8.5" fill="none" stroke="${th.line}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></marker>`

const FONT = `font-family="Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"`

main()
