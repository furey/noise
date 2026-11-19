import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fuzzyMatch, rankMatches } from '../src/provider/fuzzy.js'

const lettersAt = (text, hits) => hits.map(at => text[at]).join('')

test('fra matches all four rows and ranks the contiguous ones first', () => {
  const rows = ['Free Radicals · x', 'Says · Nils Frahm', 'Fratres · Arvo Pärt', 'Fragile · Sting']
  const ranked = rankMatches({ query: 'fra', items: rows, textOf: row => row })
  assert.equal(ranked.length, 4)
  assert.equal(ranked[3].item, 'Free Radicals · x')
})

test('alexis hits the six letters of Alexis', () => {
  const text = 'Push the River · Alexisonfire'
  const match = fuzzyMatch('alexis', text)
  const start = text.indexOf('Alexis')
  assert.deepEqual(match.hits, [0, 1, 2, 3, 4, 5].map(offset => start + offset))
})

test('words match in any order', () => {
  const text = 'Says · Nils Frahm'
  const match = fuzzyMatch('nils says', text)
  assert.ok(match)
  assert.equal(lettersAt(text, match.hits), 'SaysNils')
})

test('matching ignores accents and case', () => {
  const text = 'Fratres · Arvo Pärt'
  const match = fuzzyMatch('PART', text)
  assert.equal(lettersAt(text, match.hits), 'Pärt')
  assert.deepEqual(match.hits, [15, 16, 17, 18])
})

test('xyz returns null', () => {
  assert.equal(fuzzyMatch('xyz', 'Says · Nils Frahm'), null)
})

test('a word that is not a subsequence returns null', () => {
  assert.equal(fuzzyMatch('nils zzz', 'Says · Nils Frahm'), null)
})

test('empty and blank queries match with no hits', () => {
  assert.deepEqual(fuzzyMatch('', 'Says'), { score: 0, hits: [] })
  assert.deepEqual(fuzzyMatch('  \t ', 'Says'), { score: 0, hits: [] })
})

test('a contiguous word-start match outranks a scattered match', () => {
  const contiguous = fuzzyMatch('ab', 'ab cd')
  const scattered = fuzzyMatch('ab', 'a xx b')
  assert.ok(contiguous.score > scattered.score)
})

test('a word-start run outranks a mid-word run', () => {
  const atStart = fuzzyMatch('rat', 'The Rat')
  const midWord = fuzzyMatch('rat', 'Zzzrat')
  assert.ok(atStart.score > midWord.score)
})

test('an earlier match outranks a later one', () => {
  const early = fuzzyMatch('sun', 'Sun Song · A')
  const late = fuzzyMatch('sun', 'Song · A Sun')
  assert.ok(early.score > late.score)
})

test('the best placement beats the first greedy one', () => {
  const text = 'a x ab'
  const match = fuzzyMatch('ab', text)
  assert.deepEqual(match.hits, [4, 5])
})

test('ties keep input order', () => {
  const items = ['Same · One', 'Same · One', 'Same · One']
  const ranked = rankMatches({ query: 'same', items: items.map((text, id) => ({ id, text })), textOf: item => item.text })
  assert.deepEqual(ranked.map(({ item }) => item.id), [0, 1, 2])
})

test('limit caps the result and defaults to five', () => {
  const items = Array.from({ length: 8 }, (_, id) => `Song ${id}`)
  assert.equal(rankMatches({ query: 'song', items, textOf: text => text, limit: 3 }).length, 3)
  assert.equal(rankMatches({ query: 'song', items, textOf: text => text }).length, 5)
})

test('hits are sorted and unique when words overlap', () => {
  const match = fuzzyMatch('sa says', 'Says')
  assert.deepEqual(match.hits, [0, 1, 2, 3])
})
