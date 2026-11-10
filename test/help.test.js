import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { helpText, renderHelp } from '../src/help/render.js'
import { playbackMessage } from '../src/ui/playback-channel.js'
import { SOURCE_URL, isExternalLink } from '../electron/links.mjs'

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8')
const text = helpText(html)
const rendered = renderHelp({ text, version: '1.2.3' })

const plainText = markup => markup
  .replace(/<span id="wave"[^>]*><\/span>/, '')
  .replace(/<[^>]+>/g, '')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')

const hrefs = markup => [...markup.matchAll(/href="([^"]+)"/g)].map(match => match[1])

test('the help text is the comment above the doctype', () => {
  assert.ok(text.includes('POINTER AND TOUCH'))
  assert.ok(!text.includes('<!--'))
  assert.ok(!text.includes('<!doctype'))
  assert.equal(helpText('<!doctype html>'), '')
})

test('the rendered help reads as the same text, plus the version', () => {
  assert.equal(plainText(rendered).replace('NOISE 1.2.3', 'NOISE').replace('WAVE MODE  ', 'WAVE MODE'), text)
  assert.ok(plainText(rendered).includes('NOISE 1.2.3'))
})

test('every address in the help text is a link that opens outside the app', () => {
  const addresses = text.match(/https:\/\/\S+/g)
  assert.ok(addresses.length >= 3)
  for (const address of addresses) assert.ok(hrefs(rendered).includes(address), `no link for ${address}`)
  assert.ok(hrefs(rendered).includes('https://github.com/furey'))
  assert.ok(hrefs(rendered).every(isExternalLink))
  assert.equal(rendered.match(/<a /g).length, rendered.match(/target="_blank" rel="noreferrer"/g).length)
})

test('the help text keeps its box diagram aligned', () => {
  const box = plainText(rendered).split('\n').filter(line => /^[│┌└]/.test(line))
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
