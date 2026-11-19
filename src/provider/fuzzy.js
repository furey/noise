export const fuzzyMatch = (query, text) => {
  const words = query.trim().split(/\s+/).filter(Boolean)
  if (!words.length) return { score: 0, hits: [] }
  const folded = foldOnce(text)
  const wanted = words.map(word => foldOnce(word).chars)
  if (!wanted.every(word => isSubsequence(word, folded.chars))) return null
  const placements = wanted.map(word => bestPlacement({ word, folded }))
  if (placements.includes(null)) return null
  const score = placements.reduce((sum, placement) => sum + placement.score, 0)
  const hitSet = new Set(placements.flatMap(({ positions }) => positions.map(at => folded.origins[at])))
  return { score, hits: [...hitSet].sort((a, b) => a - b) }
}

export const rankMatches = ({ query, items, textOf, limit = 5 }) =>
  items
    .map(item => ({ item, match: fuzzyMatch(query, textOf(item)) }))
    .filter(({ match }) => match)
    .map(({ item, match }) => ({ item, score: match.score, hits: match.hits }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)

const foldOnce = text => {
  const known = FOLDED.get(text)
  if (known) return known
  const folded = fold(text)
  if (FOLDED.size >= FOLD_LIMIT) FOLDED.delete(FOLDED.keys().next().value)
  FOLDED.set(text, folded)
  return folded
}

const isSubsequence = (word, chars) => {
  let next = 0
  for (const char of chars) if (char === word[next]) next += 1
  return next >= word.length
}

const fold = text => {
  const chars = []
  const origins = []
  let origin = 0
  for (const char of text) {
    for (const folded of char.normalize('NFD').replace(COMBINING_MARKS, '').toLowerCase()) {
      chars.push(folded)
      origins.push(origin)
    }
    origin += char.length
  }
  return { chars, origins }
}

const bestPlacement = ({ word, folded }) => {
  const { chars } = folded
  const sources = []
  let previous = chars.map((char, at) => char === word[0] ? firstScore(chars, at) : -Infinity)
  for (const wanted of word.slice(1)) {
    const link = linkRow({ chars, wanted, previous })
    sources.push(link.sources)
    previous = link.scores
  }
  const best = previous.reduce((top, score, at) => score > previous[top] ? at : top, 0)
  if (previous[best] === -Infinity) return null
  return { score: previous[best], positions: trace({ sources, last: best }) }
}

const firstScore = (chars, at) =>
  charScore(chars, at) - Math.min(at, MAX_POSITION) * POSITION_PENALTY

const charScore = (chars, at) => MATCH + (isWordStart(chars, at) ? WORD_START_BONUS : 0)

const isWordStart = (chars, at) => at === 0 || WORD_START.test(chars[at - 1])

const linkRow = ({ chars, wanted, previous }) => {
  const scores = chars.map(() => -Infinity)
  const sources = chars.map(() => -1)
  chars.forEach((char, at) => {
    if (char !== wanted) return
    for (let from = 0; from < at; from++) {
      if (previous[from] === -Infinity) continue
      const candidate = previous[from] + charScore(chars, at) + transition(at - from - 1)
      if (candidate <= scores[at]) continue
      scores[at] = candidate
      sources[at] = from
    }
  })
  return { scores, sources }
}

const transition = gap => gap === 0 ? CONSECUTIVE_BONUS : -Math.min(gap, MAX_GAP) * GAP_PENALTY

const trace = ({ sources, last }) => {
  const positions = [last]
  for (let row = sources.length - 1; row >= 0; row--) {
    positions.unshift(sources[row][positions[0]])
  }
  return positions
}

const FOLDED = new Map()
const FOLD_LIMIT = 2000
const WORD_START = /[\s·\-(/]/
const COMBINING_MARKS = /\p{M}/gu
const MATCH = 1
const CONSECUTIVE_BONUS = 8
const WORD_START_BONUS = 10
const GAP_PENALTY = 2
const MAX_GAP = 8
const POSITION_PENALTY = 0.05
const MAX_POSITION = 50
