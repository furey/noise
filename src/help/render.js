import { COLOURS } from '../ui/colours.js'

const LOGO_WIDTH = 16
const LOGO_MARK = /^[\s▄▀█]{16}/
const HEADING = /^[A-Z][A-Z ]+$/
const LEADER = /([^\s│][^│]*?)( \.{2,} )/g
const LINK = /https:\/\/[^\s<]+|@(\w+)/g
const COLOUR_WORD = new RegExp(`\\b(${COLOURS.map(({ id }) => id).join('|')})\\b`, 'gi')
const SLEEP_DOTS = /(sleep timer )■ ■ ■/
const WAVE_DOT = /^(│ )■( wave mode)/
const STRIP_RULE = /━+ COLOUR STRIP ━+/
const TAG = /(<[^>]+>)/

export const helpText = html => {
  const start = html.indexOf('<!--')
  const end = html.indexOf('-->')
  if (start !== 0 || end < 0) return ''
  return html.slice(start + 4, end).replace(/^\n+|\s+$/g, '')
}

export const renderHelp = ({ text, version = '' }) =>
  text.split('\n').map(line => renderLine({ line: escapeHtml(line), version })).join('\n')

export const linkFor = (match, handle) => handle ? `https://github.com/${handle}` : match

const renderLine = ({ line, version }) => {
  if (HEADING.test(line)) return renderHeading(line)
  if (LOGO_MARK.test(line)) return renderLogoLine({ line, version })
  return decorate(line)
}

const renderHeading = line => {
  const heading = `<span class="heading">${line}</span>`
  return line === 'WAVE MODE' ? `${heading}  <span id="wave" aria-hidden="true"></span>` : heading
}

const renderLogoLine = ({ line, version }) => {
  const logo = `<span class="logo">${line.slice(0, LOGO_WIDTH)}</span>`
  const rest = decorate(line.slice(LOGO_WIDTH))
  const withVersion = version ? rest.replace(/\bNOISE\b/, `NOISE <span class="dim">${escapeHtml(version)}</span>`) : rest
  return `${logo}${withVersion.replace(/\bNOISE\b/, '<span class="heading">NOISE</span>')}`
}

const decorate = line => [markLeaders, markLinks, markColours, markDiagram]
  .reduce((html, mark) => mapText(html, mark), line)

const markLeaders = text => text.replace(LEADER, '<span class="key">$1</span><span class="dim">$2</span>')

const markLinks = text => text.replace(LINK, (match, handle) =>
  `<a href="${linkFor(match, handle)}" target="_blank" rel="noreferrer">${match}</a>`)

const markColours = text => text.replace(COLOUR_WORD, word => `<span class="${word.toLowerCase()}">${word}</span>`)

const markDiagram = text => text
  .replace(STRIP_RULE, rule => `<span class="strip">${rule}</span>`)
  .replace(SLEEP_DOTS, '$1<span class="sleep"><i>■</i> <i>■</i> <i>■</i></span>')
  .replace(WAVE_DOT, '$1<span class="pulse">■</span>$2')
  .replace(/\bSYNTH\b/, '<span class="key">SYNTH</span>')

const mapText = (html, mark) => html.split(TAG).map(part => TAG.test(part) ? part : mark(part)).join('')

const escapeHtml = text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
