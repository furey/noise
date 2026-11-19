import { COLOURS } from '../ui/colours.js'
import { controlDrawings, logoMark, zoneDrawings } from './drawings.js'

const LOGO_WIDTH = 16
const LOGO_MARK = /^[\s▄▀█]{16}/
const LEADER = /^(.*?) \.{2,} (.*)$/
const BOX_TOP = '┌'
const BOX_BOTTOM = '└'
const BOX_SIDES = /^│|│$/g
const DIAGRAM_MARKS = /[■♫━]/g
const LINK = /https:\/\/[^\s<]+|@(\w+)/g
const COLOUR_WORD = new RegExp(`\\b(${COLOURS.map(({ id }) => id).join('|')})\\b`, 'gi')
const RANGE = /\d[\d.]*–\d[\d.]*\w*/g
const TAG = /(<[^>]+>)/

export const helpText = html => {
  const start = html.indexOf('<!--')
  const end = html.indexOf('-->')
  if (start !== 0 || end < 0) return ''
  return html.slice(start + 4, end).replace(/\r\n?/g, '\n').replace(/^\n+|\s+$/g, '')
}

export const parseHelp = text => {
  const lines = text.split('\n')
  const top = lines.findIndex(line => line.startsWith(BOX_TOP))
  const bottom = lines.findIndex(line => line.startsWith(BOX_BOTTOM))
  return {
    title: parseTitle(lines.slice(0, top)),
    diagram: parseDiagram(lines.slice(top + 1, bottom)),
    sections: parseSections(lines.slice(bottom + 1)),
  }
}

export const renderHelp = ({ help, version = '' }) => {
  const controls = controlDrawings()
  const lists = help.sections.filter(section => section.rows)
  const texts = help.sections.filter(section => section.paragraphs)
  const states = statesByRow({ lists, controls })
  return [
    renderTitle({ title: help.title, version }),
    renderDiagram({ diagram: help.diagram, controls }),
    ...lists.map(section => renderList({ section, states })),
    `<div class="texts">${texts.map(renderText).join('')}</div>`,
  ].join('\n')
}

export const linkFor = (match, handle) => handle ? `https://github.com/${handle}` : match

const parseTitle = lines => {
  const [name, ...rest] = lines.filter(line => LOGO_MARK.test(line)).map(line => line.slice(LOGO_WIDTH).trim())
  return { name, lines: rest }
}

const parseDiagram = lines => {
  const [bar, ...rest] = lines.map(line => line.replace(BOX_SIDES, '').replace(DIAGRAM_MARKS, '').trim()).filter(Boolean)
  return { buttons: bar.split(/\s{2,}/), zones: rest.reduce(addToZones, []) }
}

const addToZones = (zones, line) => {
  const row = parseRow(line)
  if (!row) return [...zones, { name: line, rows: [] }]
  const zone = zones.at(-1)
  return [...zones.slice(0, -1), { ...zone, rows: [...zone.rows, row] }]
}

const parseSections = lines => lines.join('\n').trim().split(/\n{2,}/).map(block => {
  const [heading, ...body] = block.split('\n').map(line => line.trim())
  return body.some(parseRow) ? { heading, rows: body.reduce(addToRows, []) } : { heading, paragraphs: body.reduce(addToParagraphs, []) }
})

const parseRow = line => {
  const match = line.match(LEADER)
  return match && { key: match[1], value: match[2] }
}

const addToRows = (rows, line) => {
  const row = parseRow(line)
  if (row) return [...rows, row]
  const last = rows.at(-1)
  return [...rows.slice(0, -1), { ...last, value: `${last.value} ${line}` }]
}

const addToParagraphs = (paragraphs, line) => {
  const open = paragraphs.at(-1)
  if (!open || open.endsWith('.')) return [...paragraphs, line]
  return [...paragraphs.slice(0, -1), `${open} ${line}`]
}

const renderTitle = ({ title, version }) => {
  const [tagline, ...credits] = title.lines.map(line => markLinks(escapeHtml(line)))
  const number = version ? ` <small>${escapeHtml(version)}</small>` : ''
  return `<header class="title">${logoMark()}<div><h1>${escapeHtml(title.name)}${number}</h1><p>${tagline}</p><p class="credits">${credits.map(credit => `<span>${credit}</span>`).join(' ')}</p></div></header>`
}

const renderDiagram = ({ diagram, controls }) => {
  const drawings = zoneDrawings()
  const bar = diagram.buttons.map(label => `<div class="button">${controls[label]?.mark ?? ''}<span>${escapeHtml(label)}</span></div>`)
  const zones = diagram.zones.map(zone => {
    const rows = zone.rows.map(({ key, value }) => `<p><b>${escapeHtml(key)}</b> ${markColours(escapeHtml(value))}</p>`)
    return `<div class="zone"><h2>${escapeHtml(zone.name)}</h2>${drawings[zone.name] ?? ''}${rows.join('')}</div>`
  })
  return `<section class="screen"><div class="bar">${bar.join('')}</div>${zones.join('')}</section>`
}

const statesByRow = ({ lists, controls }) => {
  const rows = lists.flatMap(section => section.rows)
  return new Map(Object.entries(controls).map(([label, control]) => [rows.find(row => row.value.startsWith(label)), control.states]))
}

const renderList = ({ section, states }) => {
  const rows = section.rows.map(row =>
    `<div><dt>${escapeHtml(row.key)}</dt><dd>${markColours(escapeHtml(row.value))}${states.has(row) ? renderStates(states.get(row)) : ''}</dd></div>`)
  return `<section class="list ${slug(section.heading)}"><h2>${escapeHtml(section.heading)}</h2><dl>${rows.join('')}</dl></section>`
}

const renderStates = states =>
  `<div class="states">${states.map(({ id, caption, drawing }) => `<figure data-state="${id}">${drawing}<figcaption>${escapeHtml(caption)}</figcaption></figure>`).join('')}</div>`

const renderText = section =>
  `<section class="${slug(section.heading)}"><h2>${escapeHtml(section.heading)}</h2>${section.paragraphs.map(paragraph => `<p>${markRanges(markLinks(escapeHtml(paragraph)))}</p>`).join('')}</section>`

const markLinks = html => html.replace(LINK, (match, handle) =>
  `<a href="${linkFor(match, handle)}" target="_blank" rel="noreferrer">${match.replace('https://', '')}</a>`)

const markRanges = html => mapText(html, text => text.replace(RANGE, '<span class="range">$&</span>'))

const markColours = html => mapText(html, text => text.replace(COLOUR_WORD, word => `<span class="${word.toLowerCase()}">${word}</span>`))

const mapText = (html, mark) => html.split(TAG).map(part => TAG.test(part) ? part : mark(part)).join('')

const slug = heading => heading.toLowerCase().replaceAll(' ', '-')

const escapeHtml = text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
