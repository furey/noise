import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { helpFor } from '../src/help/place.js'
import { helpText, parseHelp, renderHelp } from '../src/help/render.js'
import { MUSIC_CYCLE } from '../src/settings.js'
import { TIMER_STEPS } from '../src/ui/timer.js'
import { playbackMessage } from '../src/ui/playback-channel.js'
import { SOURCE_URL, isExternalLink } from '../electron/links.mjs'

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8')
const text = helpFor(helpText(html), { desktop: true, music: true })
const help = parseHelp(text)
const rendered = renderHelp({ help, version: '1.2.3' })

const HEADING = /^[A-Z][A-Z ]+$/
const DECORATION = /[┌┐└┘─│━■♫▄▀█]/g
const LEADER = / \.{2,} /g

const words = plain => plain.replaceAll('https://', '').split(/\s+/).filter(Boolean)

const commentWords = words(text.replace(DECORATION, ' ').replace(LEADER, ' '))

const pageWords = markup => words(markup
  .replace(/<small>[^<]*<\/small>|<figcaption>[^<]*<\/figcaption>/g, ' ')
  .replace(/<\/?(?:a|b|span)\b[^>]*>/g, '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'))

const hrefs = markup => [...markup.matchAll(/href="([^"]+)"/g)].map(match => match[1])

const count = (markup, part) => markup.split(part).length - 1

test('the help text is the comment above the doctype', () => {
  assert.ok(text.includes('POINTER AND TOUCH'))
  assert.ok(!text.includes('<!--'))
  assert.ok(!text.includes('<!doctype'))
  assert.equal(helpText('<!doctype html>'), '')
})

test('the page shows every word of the comment once, in the same order', () => {
  assert.deepEqual(pageWords(rendered), commentWords)
})

test('every heading in the comment is a section of the page', () => {
  const headings = text.split('\n').filter(line => HEADING.test(line))
  assert.ok(headings.length >= 7)
  assert.deepEqual(help.sections.map(section => section.heading), headings)
  for (const heading of headings) assert.equal(count(rendered, `<h2>${heading}</h2>`), 1, heading)
  assert.ok(help.sections.every(section => (section.rows ?? section.paragraphs).length > 0))
})

test('every label in the diagram is part of the screen drawing', () => {
  const screen = rendered.slice(rendered.indexOf('<section class="screen">'), rendered.indexOf('</section>'))
  assert.deepEqual(help.diagram.buttons, ['wave mode', 'music', 'sleep timer'])
  assert.equal(count(screen, '<div class="button"><svg'), help.diagram.buttons.length)
  for (const label of help.diagram.buttons) assert.ok(screen.includes(`<span>${label}</span>`), label)
  for (const zone of help.diagram.zones) assert.ok(screen.includes(`<h2>${zone.name}</h2>`), zone.name)
  assert.ok(help.diagram.zones.every(zone => zone.rows.length > 0))
  assert.equal(count(screen, 'class="slider"'), 1)
})

test('every state of the three buttons has one drawing', () => {
  const states = [
    'wave-off', 'wave-on',
    ...MUSIC_CYCLE.map(step => `music-${step.music}-${step.piece}`),
    'timer-0', ...TIMER_STEPS.map(step => `timer-${step.size}`),
  ]
  for (const state of states) assert.equal(count(rendered, `<figure data-state="${state}"><svg`), 1, state)
  assert.equal(count(rendered, '<figure '), states.length)
})

test('the page shows the version beside the name', () => {
  assert.ok(rendered.includes('<h1>NOISE <small>1.2.3</small></h1>'))
  assert.ok(renderHelp({ help }).includes('<h1>NOISE</h1>'))
  assert.ok(renderHelp({ help, version: '<b>' }).includes('<small>&lt;b&gt;</small>'))
})

test('every address in the help text is a link that opens outside the app', () => {
  const addresses = text.match(/https:\/\/\S+/g)
  assert.ok(addresses.length >= 3)
  for (const address of addresses) assert.ok(hrefs(rendered).includes(address), `no link for ${address}`)
  assert.ok(hrefs(rendered).includes('https://github.com/furey'))
  assert.ok(hrefs(rendered).every(isExternalLink))
  assert.equal(rendered.match(/<a /g).length, rendered.match(/target="_blank" rel="noreferrer"/g).length)
})

test('the page has no inline styles or scripts', () => {
  assert.ok(!/ style=|<style|<script| on\w+=/.test(rendered))
})

test('the comment keeps its box diagram aligned', () => {
  const box = text.split('\n').filter(line => /^[│┌└]/.test(line))
  assert.ok(box.length > 5)
  assert.equal(new Set(box.map(line => [...line].length)).size, 1)
})

test('only https links to the known sites open in the browser', () => {
  assert.equal(isExternalLink(SOURCE_URL), true)
  assert.equal(isExternalLink('https://about.me/jamesfurey'), true)
  assert.equal(isExternalLink('http://github.com/furey'), false)
  assert.equal(isExternalLink('https://example.com/'), false)
  assert.equal(isExternalLink('https://user@github.com/'), false)
  assert.equal(isExternalLink('file:///etc/passwd'), false)
  assert.equal(isExternalLink('not a url'), false)
})

test('the playback message names the nearest colour', () => {
  assert.deepEqual(playbackMessage({ playing: true, pos: 1.2 }), { type: 'state', playing: true, colour: 'pink' })
  assert.deepEqual(playbackMessage({ playing: false, pos: 0 }), { type: 'state', playing: false, colour: 'brown' })
})

test('the help text reads the same from a file checked out with Windows line endings', () => {
  assert.equal(helpFor(helpText(html.replace(/\r?\n/g, '\r\n')), { desktop: true, music: true }), text)
})
