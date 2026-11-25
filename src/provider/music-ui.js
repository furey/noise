import { paletteToneAt } from '../ui/colours.js'
import { ALBUM_LABEL, TRACK_SEPARATOR, clockText, createMemo, keepRowAt, lengthText, mergeRows, separatorAt, trackText } from './results.js'

export const LIVE_DELAY_MS = 250
export const LIVE_MIN_CHARS = 2
export const STATUS_DELAY_MS = 150
export const MARQUEE_PX_PER_S = 30
export const MARQUEE_GAP_PX = 48
export const BAR_UPDATE_S = 0.25
export const SLIDER_FADE_S = 0.2

export const createMusicUi = ({ doc, app, engine, music, player, desktop, mac = false }) => {
  const ui = {
    doc, app, engine, music, player, desktop, mac, nodes: build(doc), memo: createMemo(),
    open: false, listOpen: false, query: '', cached: [], live: [], rows: [], selected: -1,
    request: 0, liveTimer: 0, statusTimer: 0, searching: false, pendingEnter: false,
    colours: '', chrome: '', rowsKey: '', barTrackKey: '', sinceBar: BAR_UPDATE_S, sliderShown: 1, composing: false,
  }
  bindKeys(ui)
  bindField(ui)
  bindList(ui)
  bindBar(ui)
  desktop.onCommand(command => COMMANDS[command]?.(ui))
  app.subscribe(() => renderState(ui))
  player.onFailure(message => reopenSearch(ui, message))
  new ResizeObserver(() => refreshMarquees(ui)).observe(ui.nodes.root)
  renderState(ui)
  return {
    open: () => openSearch(ui),
    isOpen: () => ui.open,
    nextSong: () => player.next(),
    previousSong: () => player.previous(),
    frame: ({ pos, dt, chromeAlpha }) => frame(ui, { pos, dt, chromeAlpha }),
    place: rect => place(ui, rect),
  }
}

const TEMPLATE = `
<ul class="music-list" id="music-list" role="listbox" aria-label="Songs"></ul>
<div class="music-field">
  <svg class="music-glass" viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5"/><path d="M12.6 12.6 17 17"/></svg>
  <input class="music-input" id="music-query" type="text" role="combobox" aria-label="Search music" aria-controls="music-list" aria-expanded="false" aria-autocomplete="list" autocomplete="off" spellcheck="false">
  <span class="music-status" aria-live="polite"></span>
</div>
<div class="music-bar" role="slider" aria-label="Song position" aria-valuemin="0" aria-valuemax="0" aria-valuenow="0">
  <div class="music-bar-layer music-bar-track"><span class="music-text"><span class="music-scroll"></span></span><span class="music-time"></span><span class="music-buffer" aria-hidden="true"><i></i><i></i><i></i></span><span class="music-spin" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span></div>
  <div class="music-bar-layer music-bar-fill" aria-hidden="true"><span class="music-text"><span class="music-scroll"></span></span><span class="music-time"></span></div>
</div>`

const build = doc => {
  const root = doc.createElement('div')
  root.className = 'music-ui'
  root.innerHTML = TEMPLATE
  doc.body.append(root)
  const pick = selector => root.querySelector(selector)
  return {
    root,
    list: pick('.music-list'),
    field: pick('.music-field'),
    input: pick('.music-input'),
    status: pick('.music-status'),
    bar: pick('.music-bar'),
    barLayers: [...root.querySelectorAll('.music-bar-layer')],
  }
}

const COMMANDS = {
  search: ui => openSearch(ui),
  'next-song': ui => ui.player.next(),
  'previous-song': ui => ui.player.previous(),
}

const SONG_KEYS = {
  ArrowRight: ui => ui.player.next(),
  ArrowLeft: ui => ui.player.previous(),
}

const bindKeys = ui => ui.doc.addEventListener('keydown', event => {
  if (event.target.closest?.('input')) return
  if (isSongKey(ui, event)) return skipSong(ui, event)
  if (event.key !== '/' || ui.open || event.metaKey || event.ctrlKey || event.altKey) return
  event.preventDefault()
  openSearch(ui)
})

const isSongKey = (ui, event) => Boolean(SONG_KEYS[event.key])
  && event.metaKey === ui.mac
  && event.ctrlKey === !ui.mac
  && !event.altKey
  && !event.shiftKey

const skipSong = (ui, event) => {
  if (ui.app.state.track.status === 'idle') return
  event.preventDefault()
  SONG_KEYS[event.key](ui)
}

const bindField = ui => {
  const { input } = ui.nodes
  input.addEventListener('input', () => onQuery(ui, input.value))
  input.addEventListener('compositionstart', () => {
    ui.composing = true
  })
  input.addEventListener('compositionend', () => {
    ui.composing = false
  })
  input.addEventListener('keydown', event => onFieldKey(ui, event))
  ui.doc.addEventListener('pointerdown', event => {
    if (ui.open && !ui.nodes.root.contains(event.target)) closeSearch(ui)
  }, true)
}

const bindList = ui => {
  const { list } = ui.nodes
  list.addEventListener('pointerdown', event => event.preventDefault())
  list.addEventListener('pointermove', event => {
    const index = rowIndexOf(event)
    if (index !== null && index !== ui.selected) select(ui, index)
  })
  list.addEventListener('click', event => {
    const index = rowIndexOf(event)
    if (index !== null) playRow(ui, ui.rows[index])
  })
}

const bindBar = ui => {
  const { bar } = ui.nodes
  const seek = event => {
    const { left, width } = bar.getBoundingClientRect()
    const { duration } = ui.engine.trackTime()
    if (duration > 0) ui.engine.seekTrackTo(((event.clientX - left) / width) * duration)
  }
  bar.addEventListener('pointerdown', event => {
    bar.setPointerCapture(event.pointerId)
    seek(event)
  })
  bar.addEventListener('pointermove', event => bar.hasPointerCapture(event.pointerId) && seek(event))
}

const openSearch = async ui => {
  if (ui.open || !ui.doc.documentElement.hasAttribute('data-music')) return
  Object.assign(ui, { open: true, listOpen: true, selected: -1 })
  ui.desktop.music.setSearchOpen(true)
  renderState(ui)
  ui.nodes.input.focus()
  ui.nodes.input.select()
  ui.cached = (await ui.music.cached()).entries.map(({ track }) => track)
  refreshRows(ui)
}

const reopenSearch = (ui, message) => {
  openSearch(ui)
  showStatus(ui, message, 'error')
}

const closeSearch = ui => {
  if (!ui.open) return
  Object.assign(ui, { open: false, listOpen: false, selected: -1, pendingEnter: false })
  clearTimeout(ui.liveTimer)
  ui.nodes.input.blur()
  ui.desktop.music.setSearchOpen(false)
  renderState(ui)
}

const onQuery = (ui, query) => {
  Object.assign(ui, { query, selected: -1, listOpen: true })
  showStatus(ui, '')
  ui.live = ui.memo.get(query) ?? []
  refreshRows(ui)
  scheduleLive(ui)
}

const scheduleLive = ui => {
  clearTimeout(ui.liveTimer)
  ui.request += 1
  ui.searching = false
  if (ui.query.trim().length < LIVE_MIN_CHARS) return
  if (ui.memo.get(ui.query)) return prepareBest(ui)
  ui.liveTimer = setTimeout(() => runLive(ui, ui.query), LIVE_DELAY_MS)
}

const runLive = async (ui, query) => {
  clearTimeout(ui.liveTimer)
  const request = ++ui.request
  ui.searching = true
  clearTimeout(ui.statusTimer)
  ui.statusTimer = setTimeout(() => ui.searching && request === ui.request && showStatus(ui, 'Searching…'), STATUS_DELAY_MS)
  const answer = await ui.music.search(query)
  if (request !== ui.request) return
  ui.searching = false
  clearTimeout(ui.statusTimer)
  showStatus(ui, ...statusOf(answer))
  ui.live = answer.tracks ?? []
  if (answer.tracks) ui.memo.set(query, answer.tracks)
  refreshRows(ui)
  prepareBest(ui)
  if (!ui.pendingEnter) return
  ui.pendingEnter = false
  playBest(ui)
}

const statusOf = ({ error }) => {
  if (!error || error.code === 'cancelled') return ['']
  return error.code === 'not-found' ? ['No match', 'warning'] : ['Music source unavailable', 'error']
}

const prepareBest = ui => {
  const [best] = ui.live
  if (best && best.kind !== 'album') ui.music.prepare(best).catch(() => {})
}

const onFieldKey = (ui, event) => {
  const action = FIELD_KEYS[event.key]
  if (!action || (event.key === 'Enter' && (ui.composing || event.isComposing))) return
  event.preventDefault()
  event.stopPropagation()
  action(ui)
}

const FIELD_KEYS = {
  ArrowUp: ui => ui.rows.length && select(ui, Math.min(ui.selected + 1, ui.rows.length - 1)),
  ArrowDown: ui => select(ui, Math.max(ui.selected - 1, -1)),
  Enter: ui => enter(ui),
  Escape: ui => escape(ui),
}

const enter = ui => {
  if (ui.selected >= 0) return playRow(ui, ui.rows[ui.selected])
  const needsLive = ui.query.trim().length >= LIVE_MIN_CHARS && !ui.memo.get(ui.query)
  if (!ui.searching && !needsLive) return playBest(ui)
  ui.pendingEnter = true
  if (!ui.searching) runLive(ui, ui.query)
}

const playBest = ui => {
  const [best] = ui.rows
  if (best) return playRow(ui, best)
  if (ui.query.trim()) showStatus(ui, 'No match', 'warning')
}

const playRow = (ui, row) => {
  if (!row) return
  ui.player.play(row.track)
  closeSearch(ui)
}

const escape = ui => {
  if (ui.selected >= 0) return select(ui, -1)
  if (ui.listOpen && ui.rows.length) {
    ui.listOpen = false
    return renderState(ui)
  }
  closeSearch(ui)
}

const select = (ui, index) => {
  ui.selected = index
  renderRows(ui)
}

const refreshRows = ui => {
  const rows = mergeRows({ query: ui.query, cached: ui.cached, live: ui.live })
  const held = ui.rows[ui.selected]
  ui.rows = held ? keepRowAt({ rows, row: held, index: ui.selected }) : rows
  if (ui.selected >= ui.rows.length) ui.selected = -1
  renderRows(ui)
}

const renderState = ui => {
  const { root } = ui.nodes
  const { track } = ui.app.state
  const mode = ui.open ? 'search' : track.status !== 'idle' ? 'bar' : 'off'
  root.dataset.mode = mode
  root.dataset.track = track.status
  ui.nodes.bar.setAttribute('aria-busy', String(track.status === 'loading'))
  root.classList.toggle('list-open', ui.open && ui.listOpen && ui.rows.length > 0)
  ui.nodes.input.setAttribute('aria-expanded', String(root.classList.contains('list-open')))
  ui.doc.documentElement.dataset.musicUi = mode
  if (trackKey(track.current) !== ui.barTrackKey) showTrack(ui, track.current)
  renderRows(ui)
}

const renderRows = ui => {
  const { list, input } = ui.nodes
  const playingId = ui.app.state.track.current?.id
  const key = JSON.stringify([ui.rows.map(row => [row.track.id, row.cached, row.hits.length]), ui.selected, playingId, ui.query])
  if (key === ui.rowsKey) return
  ui.rowsKey = key
  list.replaceChildren(...ui.rows.map((row, index) => rowNode(ui, { row, index, playing: row.track.id === playingId })))
  if (ui.selected >= 0) input.setAttribute('aria-activedescendant', rowId(ui.selected))
  else input.removeAttribute('aria-activedescendant')
  ui.nodes.root.classList.toggle('list-open', ui.open && ui.listOpen && ui.rows.length > 0)
  refreshMarquees(ui)
}

const rowNode = (ui, { row, index, playing }) => {
  const item = ui.doc.createElement('li')
  item.className = 'music-row'
  item.id = rowId(index)
  item.dataset.index = String(index)
  item.setAttribute('role', 'option')
  item.setAttribute('aria-selected', String(index === ui.selected))
  item.classList.toggle('selected', index === ui.selected)
  item.classList.toggle('playing', playing)
  item.classList.toggle('cached', row.cached)
  item.classList.toggle('album', row.track.kind === 'album')
  item.append(
    span(ui.doc, 'music-mark'),
    ...albumChip(ui.doc, row.track),
    textNode(ui.doc, { text: trackText(row.track), hits: new Set(row.hits), sepAt: separatorAt(row.track) }),
    span(ui.doc, 'music-dot'),
    span(ui.doc, 'music-time', lengthText(row.track)),
  )
  if (row.cached) item.setAttribute('aria-description', 'Saved on this computer')
  return item
}

const albumChip = (doc, track) => track.kind === 'album' ? [span(doc, 'music-chip', ALBUM_LABEL)] : []

const textNode = (doc, { text, hits, sepAt }) => {
  const outer = span(doc, 'music-text')
  const scroll = span(doc, 'music-scroll')
  appendMarked(doc, scroll, { text, hits, sepAt })
  outer.append(scroll)
  return outer
}

const appendMarked = (doc, parent, { text, hits, sepAt = -1 }) => {
  let run = ''
  let bold = false
  const flush = () => {
    if (!run) return
    parent.append(bold ? Object.assign(doc.createElement('b'), { textContent: run }) : doc.createTextNode(run))
    run = ''
  }
  const inSeparator = index => sepAt >= 0 && index >= sepAt && index < sepAt + TRACK_SEPARATOR.length
  ;[...text].forEach((char, index) => {
    if (inSeparator(index)) {
      if (index !== sepAt) return
      flush()
      return parent.append(span(doc, 'music-sep', TRACK_SEPARATOR))
    }
    const hit = hits.has(index)
    if (hit !== bold) flush()
    bold = hit
    run += char
  })
  flush()
}

const showTrack = (ui, track) => {
  ui.barTrackKey = trackKey(track)
  const text = track ? trackText(track) : ''
  ui.nodes.barLayers.forEach(layer => {
    const scroll = layer.querySelector('.music-scroll')
    scroll.replaceChildren()
    appendMarked(ui.doc, scroll, { text, hits: new Set(), sepAt: separatorAt(track) })
  })
  ui.nodes.bar.setAttribute('aria-valuetext', text)
  showInSession(track)
  ui.sinceBar = BAR_UPDATE_S
  refreshMarquees(ui)
}

const showInSession = track => {
  const session = navigator.mediaSession
  if (!session || !window.MediaMetadata) return
  try {
    session.metadata = new MediaMetadata(track ? { title: track.title, artist: track.artist } : { title: SESSION_TITLE })
  } catch {
    return
  }
}

const frame = (ui, { pos, dt, chromeAlpha }) => {
  paintColours(ui, pos)
  const { root } = ui.nodes
  const mode = root.dataset.mode
  const target = mode === 'off' ? 1 : 0
  ui.sliderShown += Math.sign(target - ui.sliderShown) * Math.min(Math.abs(target - ui.sliderShown), dt / SLIDER_FADE_S)
  const chrome = String(mode === 'search' ? 1 : Math.round(chromeAlpha * 100) / 100)
  if (chrome !== ui.chrome) {
    ui.chrome = chrome
    root.style.setProperty('--music-chrome', chrome)
  }
  ui.sinceBar += dt
  if (mode !== 'bar' || ui.sinceBar < BAR_UPDATE_S) return ui.sliderShown
  ui.sinceBar = 0
  paintBar(ui)
  return ui.sliderShown
}

const paintColours = (ui, pos) => {
  const fill = paletteToneAt(pos, 'low')
  const dark = paletteToneAt(pos, 'mid').map(channel => Math.round(channel * TRACK_SHADE))
  const key = `${fill}|${dark}`
  if (key === ui.colours) return
  ui.colours = key
  ui.nodes.root.style.setProperty('--music-fill', `rgb(${fill})`)
  ui.nodes.root.style.setProperty('--music-dark', `rgb(${dark})`)
}

const paintBar = ui => {
  const { current, duration } = ui.engine.trackTime()
  const loading = ui.app.state.track.status === 'loading'
  const share = !loading && duration > 0 ? Math.min(1, current / duration) : 0
  const left = loading ? '' : clockText(duration - current)
  ui.nodes.root.style.setProperty('--music-progress', `${(share * 100).toFixed(2)}%`)
  ui.nodes.barLayers.forEach(layer => {
    layer.querySelector('.music-time').textContent = left
  })
  const { bar } = ui.nodes
  bar.setAttribute('aria-valuemax', String(Math.round(duration)))
  bar.setAttribute('aria-valuenow', String(Math.round(current)))
}

const refreshMarquees = ui => {
  ui.nodes.list.querySelectorAll('.music-row').forEach(row => marquee(ui.doc, row.querySelector('.music-text'), row.classList.contains('selected')))
  ui.nodes.barLayers.forEach(layer => marquee(ui.doc, layer.querySelector('.music-text'), true))
}

const marquee = (doc, outer, wanted) => {
  const scroll = outer.querySelector('.music-scroll')
  scroll.querySelector('.music-copy')?.remove()
  const width = scroll.scrollWidth
  const overflowing = width > outer.clientWidth + 1
  outer.classList.toggle('overflowing', overflowing)
  outer.classList.toggle('scrolling', overflowing && wanted)
  if (!overflowing || !wanted) return
  const copy = span(doc, 'music-copy')
  copy.setAttribute('aria-hidden', 'true')
  copy.append(...[...scroll.childNodes].map(node => node.cloneNode(true)))
  scroll.append(copy)
  const distance = width + MARQUEE_GAP_PX
  outer.style.setProperty('--marquee-distance', `${distance}px`)
  outer.style.setProperty('--marquee-gap', `${MARQUEE_GAP_PX}px`)
  outer.style.setProperty('--marquee-duration', `${(distance / MARQUEE_PX_PER_S).toFixed(2)}s`)
}

const place = (ui, { left, top, width, height }) => {
  const { style } = ui.nodes.root
  style.setProperty('--music-left', `${left}px`)
  style.setProperty('--music-top', `${top}px`)
  style.setProperty('--music-width', `${width}px`)
  style.setProperty('--music-height', `${height}px`)
  refreshMarquees(ui)
}

const showStatus = (ui, text, kind = '') => {
  const { status } = ui.nodes
  status.textContent = text
  if (kind) status.dataset.kind = kind
  else delete status.dataset.kind
}

const rowIndexOf = event => {
  const row = event.target.closest?.('.music-row')
  return row ? Number(row.dataset.index) : null
}

const trackKey = track => track ? `${track.id}|${trackText(track)}` : ''

const rowId = index => `music-row-${index}`

const span = (doc, className, text = '') => Object.assign(doc.createElement('span'), { className, textContent: text })

const SESSION_TITLE = 'Noise'
const TRACK_SHADE = 0.35
