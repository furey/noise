import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { measureLayout, musicHitBox, thumbX, timerHitBox, waveHitBox } from '../src/ui/layout.js'
import { LAST } from '../src/ui/colours.js'
import {
  BACKDROP, FPS, appRoot, automationLog, deviceFrame, ensureDir, ffmpeg, frameSvg, launchBrowser, mediaDir, openApp,
  renderSvg, run, stepApp, virtualNow,
} from './demo-stage.mjs'
import { renderDemoAudio } from './render-demo-audio.mjs'
import { drawCursor, openMacScene, setWindow } from './mac-scene.mjs'

const { values } = parseArgs({
  options: {
    url: { type: 'string', default: 'http://localhost:4173/' },
    only: { type: 'string', default: 'desktop,ipad,iphone,devices' },
    out: { type: 'string', default: mediaDir },
    crf: { type: 'string', default: '20' },
  },
})

const WARMUP_MS = 600

const fullScript = ({ glide, drag, from, to }) => [
  ['wait', 1.2],
  ['glide', 'centre', glide],
  ['tap', 'centre'],
  ['wait', 1.0],
  ['glide', `colour:${from}`, glide],
  ['press', `colour:${from}`],
  ['drag', `colour:${to}`, drag],
  ['release'],
  ['wait', 0.4],
  ['glide', 'volume', glide],
  ['press', 'volume'],
  ['drag', 'volumeUp', 1.0],
  ['wait', 0.3],
  ['drag', 'volumeDown', 1.3],
  ['release'],
  ['wait', 0.3],
  ['glide', 'timer', glide],
  ['tap', 'timer'],
  ['wait', 0.6],
  ['tap', 'timer'],
  ['wait', 0.6],
  ['tap', 'timer'],
  ['wait', 0.6],
  ['glide', 'wave', glide],
  ['tap', 'wave'],
  ['wait', 3.5],
  ['tap', 'wave'],
  ['wait', 1.0],
  ['glide', 'music', glide],
  ...musicTour,
  ['glide', 'centre', glide],
  ['tap', 'centre'],
  ['wait', 1.6],
]

const musicTour = [
  ['tap', 'music'],
  ['wait', 3.4],
  ['tap', 'music'],
  ['wait', 3.2],
  ['tap', 'music'],
  ['wait', 0.5],
  ['tap', 'music'],
  ['wait', 0.5],
  ['tap', 'music'],
  ['wait', 1.0],
]

const heroScript = ({ from, to }) => [
  ['wait', 1.2],
  ['caption', 'Tap to play'],
  ['glide', 'centre', 0.4],
  ['tap', 'centre'],
  ['wait', 1.2],
  ['caption', 'Drag the slider to change the noise'],
  ['glide', `colour:${from}`, 0.4],
  ['press', `colour:${from}`],
  ['drag', `colour:${to}`, 3.0],
  ['release'],
  ['wait', 0.8],
  ['caption', 'Drag up or down to change the volume'],
  ['glide', 'volume', 0.4],
  ['press', 'volume'],
  ['drag', 'volumeUp', 1.1],
  ['wait', 0.3],
  ['drag', 'volumeDown', 1.2],
  ['release'],
  ['wait', 0.8],
  ['caption', 'Tap the top-right dots to set a sleep timer'],
  ['glide', 'timer', 0.4],
  ['tap', 'timer'],
  ['wait', 1.0],
  ['tap', 'timer'],
  ['wait', 1.0],
  ['caption', 'Tap the top-left button for wave mode'],
  ['glide', 'wave', 0.4],
  ['tap', 'wave'],
  ['wait', 3.2],
  ['tap', 'wave'],
  ['wait', 1.0],
  ['glide', `colour:${to}`, 0.4],
  ['press', `colour:${to}`],
  ['drag', `colour:${from}`, 2.2],
  ['release'],
  ['wait', 0.5],
  ['caption', 'Tap the top-middle button for music'],
  ['glide', 'music', 0.4],
  ...musicTour,
  ['caption', 'Tap to pause'],
  ['glide', 'centre', 0.4],
  ['tap', 'centre'],
  ['wait', 1.6],
]

const searchScript = [
  ['wait', 1.0],
  ['glide', 'centre', 0.8],
  ['tap', 'centre'],
  ['glide', 'rest', 0.8],
  ['wait', 1.0],
  ['caption', 'Press / to search for a song'],
  ['key', '/'],
  ['wait', 0.5],
  ['typeSlow', 'kevin macleod', 0.09],
  ['wait', 1.4],
  ['caption', 'Press Enter to play the best match'],
  ['key', 'Enter'],
  ['wait', 11],
  ['key', 'Escape'],
  ['wait', 1.6],
]

const SEARCH_SONG = {
  file: path.join(appRoot, 'scripts', 'demo-music', 'floating-cities.m4a'),
  durationS: 184, searchMs: 350, loadMs: 1600,
  catalogue: [
    { id: 'floating-cities', title: 'Floating Cities', artist: 'Kevin MacLeod', durationS: 184 },
    { id: 'dreamer', title: 'Dreamer', artist: 'Kevin MacLeod', durationS: 204 },
    { id: 'ether-vox', title: 'Ether Vox', artist: 'Kevin MacLeod', durationS: 129 },
    { id: 'carefree', title: 'Carefree', artist: 'Kevin MacLeod', durationS: 205 },
    { id: 'clean-soul', title: 'Clean Soul', artist: 'Kevin MacLeod', durationS: 383 },
  ],
}

const macDevice = ({ scene, dpr, x, y, window, monitor, settings, script, song = null }) => ({
  kind: 'mac', viewport: scene, dpr, window, settings, script, song, pointer: MOUSE,
  screen: { x, y },
  shape: monitor
    ? deviceFrame({ x, y, w: scene.width * dpr, h: scene.height * dpr, bezel: monitor.bezel, screenRadius: monitor.radius })
    : fullBleed({ w: scene.width * dpr, h: scene.height * dpr }),
})

const fullBleed = ({ w, h }) => ({ bounds: { top: 0, bottom: h }, under: '', body: '', outline: `M0 0H${w}V${h}H0Z` })

const resizeScript = ({ small, full }) => [
  ['wait', 0.4],
  ['resize', small, 1.6],
  ['wait', 1.4],
  ['resize', full, 1.4],
  ['wait', 1.4],
]

const withResize = script => [
  ...script.slice(0, -3),
  ...resizeScript({ small: { w: 660, h: 430 }, full: DESKTOP_WINDOW }),
  ...script.slice(-3),
]

const touchDevice = ({ viewport, dpr, x, y, bezel, radius, settings, insets, script, pointer }) => ({
  viewport, dpr, settings, insets, script, pointer,
  screen: { x, y },
  shape: deviceFrame({ x, y, w: viewport.width * dpr, h: viewport.height * dpr, bezel, screenRadius: radius }),
})

const NO_INSETS = { top: 0, right: 0, bottom: 0, left: 0 }
const MAC_TITLEBAR_PX = 32
const MOUSE = { mode: 'mouse', dot: 20, ring: 70 }
const TOUCH = { mode: 'touch', dot: 46, ring: 96 }
const PHONE_INSETS = { top: 47, right: 0, bottom: 34, left: 0 }

const CAPTION = {
  hold: 2.2, fade: 0.35, size: 64, weight: 600, scale: 2, tint: 0.62,
  colour: '#f2f2f4', font: '-apple-system, BlinkMacSystemFont, Helvetica Neue, sans-serif',
}

const DESKTOP_WINDOW = { x: 200, y: 130, w: 1200, h: 750 }
const HERO_SETTINGS = { pos: 0, volume: 0.6 }
const HERO_SCRIPT = heroScript({ from: 0, to: 4 })

const SHOTS = {
  desktop: {
    width: 1600, height: 1000, poster: 6.0,
    devices: [macDevice({
      scene: { width: 1600, height: 1000 }, dpr: 1, x: 0, y: 0, window: DESKTOP_WINDOW,
      script: withResize(fullScript({ glide: 0.8, drag: 3.8, from: 0, to: 4 })),
    })],
  },
  ipad: {
    width: 1176, height: 1518, poster: 6.0,
    devices: [touchDevice({
      viewport: { width: 1024, height: 1366 }, dpr: 1, x: 76, y: 76, bezel: 36, radius: 24, pointer: TOUCH,
      script: fullScript({ glide: 0.35, drag: 3.5, from: 0, to: 3 }),
    })],
  },
  iphone: {
    width: 916, height: 1824, poster: 6.0,
    devices: [touchDevice({
      viewport: { width: 390, height: 844 }, dpr: 2, x: 68, y: 68, bezel: 28, radius: 94, pointer: TOUCH,
      insets: PHONE_INSETS, settings: { pos: 1, volume: 0.6 },
      script: fullScript({ glide: 0.35, drag: 3.5, from: 1, to: 4 }),
    })],
  },
  search: {
    width: 1600, height: 1000, poster: 17.5,
    devices: [macDevice({
      scene: { width: 1600, height: 1000 }, dpr: 1, x: 0, y: 0, window: DESKTOP_WINDOW,
      settings: { pos: 1, volume: 0.6 }, script: searchScript, song: SEARCH_SONG,
    })],
  },
  wave: {
    width: 916, height: 1824, poster: 12,
    devices: [touchDevice({
      viewport: { width: 390, height: 844 }, dpr: 2, x: 68, y: 68, bezel: 28, radius: 94, pointer: TOUCH,
      insets: PHONE_INSETS, settings: { pos: 0.4, volume: 0.7 },
      script: [['wait', 1], ['tap', 'wave'], ['wait', 12], ['tap', 'centre'], ['wait', 4], ['tap', 'centre'], ['wait', 8], ['tap', 'centre'], ['wait', 3], ['tap', 'wave'], ['wait', 4]],
    })],
  },
  devices: {
    width: 1920, height: 1080, poster: 5.2, opening: 15,
    devices: [
      macDevice({
        scene: { width: 1440, height: 900 }, dpr: 0.55, x: 71, y: 395, monitor: { bezel: 10, radius: 6 },
        window: { x: 220, y: 140, w: 1000, h: 640 }, settings: HERO_SETTINGS, script: HERO_SCRIPT,
      }),
      touchDevice({
        viewport: { width: 1024, height: 1366 }, dpr: 0.5, x: 932, y: 199, bezel: 18, radius: 12, pointer: TOUCH,
        settings: HERO_SETTINGS, script: HERO_SCRIPT,
      }),
      touchDevice({
        viewport: { width: 390, height: 844 }, dpr: 0.8, x: 1535, y: 213, bezel: 12, radius: 38, pointer: TOUCH,
        insets: PHONE_INSETS, settings: HERO_SETTINGS, script: HERO_SCRIPT,
      }),
    ],
  },
}

const main = async () => {
  const names = values.only.split(',').map(name => name.trim()).filter(Boolean)
  await ensureDir(values.out)
  const browser = await launchBrowser()
  try {
    for (const name of names) await recordShot({ browser, name, shot: SHOTS[name] })
  } finally {
    await browser.close()
  }
}

const recordShot = async ({ browser, name, shot }) => {
  const work = await fs.mkdtemp(path.join(os.tmpdir(), `noise-demo-${name}-`))
  const framePng = path.join(work, 'frame.png')
  await renderSvg({ browser, svg: frameSvg({ ...shot, shapes: shot.devices.map(device => device.shape), stage: name === 'devices' }), width: shot.width, height: shot.height, out: framePng })
  const sessions = []
  for (const device of shot.devices) sessions.push(await openSession({ browser, device }))
  const timelines = sessions.map(session => buildTimeline(session))
  const frameCount = Math.max(...timelines.map(timeline => timeline.cues.length))
  const starts = await Promise.all(sessions.map(session => virtualNow(session.app)))
  for (let frame = 0; frame < frameCount; frame++) {
    await Promise.all(sessions.map((session, index) => playFrame({ session, cue: timelines[index].cues[frame] ?? timelines[index].cues.at(-1), dir: path.join(work, `d${index}`), frame })))
  }
  const log = await automationLog(sessions[0].app)
  await Promise.all(sessions.map(session => session.context.close()))
  const duration = frameCount / FPS
  const audio = path.join(work, 'audio.m4a')
  const song = shot.devices[0].song ? await songAudio(shot.devices[0].song) : null
  const { gainDb } = await renderDemoAudio({ log, start: starts[0] / 1000, duration, out: audio, song })
  const captions = await renderCaptions({ browser, shot, work, captions: timelines[0].captions })
  const video = path.join(values.out, `${outputName(name)}.mp4`)
  await encode({ shot, work, framePng, audio, captions, frameCount, out: video })
  if (shot.opening) await addOpening({ shot, work, framePng, out: video })
  await poster({ shot, work, framePng, frame: Math.round(shot.poster * FPS), out: path.join(values.out, `${outputName(name)}.png`) })
  await fs.rm(work, { recursive: true })
  console.log(`${outputName(name)}: ${frameCount} frames, ${duration.toFixed(2)} s, audio gain ${gainDb.toFixed(1)} dB`)
}

const songAudio = async ({ file }) => {
  const pcm = async channels => (await run('ffmpeg', ['-v', 'error', '-i', file, '-f', 'f32le', '-ac', String(channels), '-ar', '48000', '-'], { encoding: 'buffer', maxBuffer: 1 << 28 })).stdout
  const bytes = await pcm(2)
  const stereo = new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length))
  const left = new Float32Array(stereo.length / 2)
  const right = new Float32Array(stereo.length / 2)
  for (let i = 0; i < left.length; i++) {
    left[i] = stereo[i * 2]
    right[i] = stereo[i * 2 + 1]
  }
  return { left, right }
}

const songForPage = async ({ file, durationS, searchMs, loadMs, catalogue }) => {
  const { stdout } = await run('ffmpeg', ['-v', 'error', '-i', file, '-f', 's16le', '-ac', '1', '-ar', '48000', '-'], { encoding: 'buffer', maxBuffer: 1 << 28 })
  return { samples: stdout.toString('base64'), durationS, searchMs, loadMs, catalogue }
}

const openSession = async ({ browser, device }) => {
  const song = device.song ? await songForPage(device.song) : null
  const opened = device.kind === 'mac'
    ? await openMacScene({ browser, url: values.url, scene: device.viewport, dpr: device.dpr, window: device.window, settings: device.settings, song })
    : await openApp({ browser, url: values.url, viewport: device.viewport, dpr: device.dpr, settings: device.settings, insets: device.insets, touch: true })
  const app = opened.app ?? opened.page
  for (let t = 0; t < WARMUP_MS; t += 1000 / FPS) await stepApp(app, { dt: 1000 / FPS, pointer: null })
  return { ...opened, app, device, spots: device.kind === 'mac' ? macSpots(device) : touchSpots(device) }
}

const touchSpots = device => spotsFor(measureLayout({
  width: device.viewport.width, height: device.viewport.height, dpr: Math.min(2, device.dpr), insets: device.insets ?? NO_INSETS,
}))

const macSpots = ({ window, dpr }) => {
  const layout = measureLayout({
    width: window.w, height: window.h, dpr: Math.min(2, dpr), insets: NO_INSETS, titlebar: MAC_TITLEBAR_PX, mouse: true,
  })
  const shift = ([x, y]) => [x + window.x, y + window.y]
  const spots = spotsFor(layout)
  return {
    ...Object.fromEntries(Object.entries(spots).filter(([key]) => key !== 'colour').map(([key, at]) => [key, shift(at)])),
    colour: pos => shift(spots.colour(pos)),
  }
}

const spotsFor = layout => {
  const { centre, top, span, strip } = layout
  const timer = timerHitBox(layout, 0)
  const wave = waveHitBox(layout)
  const music = musicHitBox(layout)
  const atY = share => top + span * share
  return {
    centre: [centre.x, centre.y],
    rest: [layout.width * 0.72, atY(0.7)],
    volume: [layout.width * 0.6, atY(0.55)],
    volumeUp: [layout.width * 0.6, atY(0.13)],
    volumeDown: [layout.width * 0.6, atY(0.85)],
    timer: boxCentre(timer),
    wave: boxCentre(wave),
    music: boxCentre(music),
    colour: pos => [thumbX(layout, pos, LAST), strip.top + strip.height / 2],
  }
}

const boxCentre = box => [box.left + box.width / 2, box.top + box.height / 2]

const spot = (spots, name) => {
  const [key, value] = name.split(':')
  return key === 'colour' ? spots.colour(Number(value)) : spots[key]
}

const buildTimeline = ({ device, spots }) => {
  const cues = []
  const state = { at: spots.rest, down: false, taps: [], touchStart: null, captions: [], cursor: 'arrow', window: device.window }
  const push = (ops = []) => cues.push({ at: [...state.at], down: state.down, cursor: state.cursor, ops, time: cues.length / FPS })
  const framesFor = seconds => Math.max(1, Math.round(seconds * FPS))
  const move = (to, seconds, op) => {
    const from = state.at
    const count = framesFor(seconds)
    for (let i = 1; i <= count; i++) {
      const t = ease(i / count)
      state.at = [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t]
      push(op ? [op] : [])
    }
  }
  const tap = ops => {
    state.taps.push(cues.length / FPS)
    state.down = true
    push(ops)
    for (let i = 0; i < 3; i++) push()
    state.down = false
    for (let i = 0; i < 2; i++) push()
  }
  const actions = {
    caption: text => {
      const start = cues.length / FPS
      actions.wait(CAPTION.hold)
      state.captions.push({ text, start, end: cues.length / FPS })
    },
    wait: seconds => Array.from({ length: framesFor(seconds) }, () => push()),
    glide: (target, seconds) => move(spot(spots, target), seconds, device.pointer.mode === 'mouse' ? 'move' : null),
    tap: target => {
      state.at = spot(spots, target)
      tap(['move', 'down', 'up'])
    },
    press: target => {
      state.at = spot(spots, target)
      state.taps.push(cues.length / FPS)
      state.down = true
      push(['move', 'down'])
      for (let i = 0; i < 2; i++) push()
    },
    drag: (target, seconds) => move(spot(spots, target), seconds, 'move'),
    type: text => push([`type:${text}`]),
    key: name => push([`key:${name}`]),
    typeSlow: (text, seconds) => [...text].forEach(char => {
      push([`type:${char}`])
      for (let i = 1; i < framesFor(seconds); i++) push()
    }),
    resize: (size, seconds) => {
      const from = state.window
      move([from.x + from.w, from.y + from.h], 0.6, null)
      state.cursor = 'resize'
      state.down = true
      for (let i = 0; i < 6; i++) push()
      const count = framesFor(seconds)
      for (let i = 1; i <= count; i++) {
        const t = ease(i / count)
        state.window = { ...from, w: Math.round(from.w + (size.w - from.w) * t), h: Math.round(from.h + (size.h - from.h) * t) }
        state.at = [state.window.x + state.window.w, state.window.y + state.window.h]
        push([`window:${JSON.stringify(state.window)}`])
      }
      for (let i = 0; i < 4; i++) push()
      state.down = false
      state.cursor = 'arrow'
      push()
    },
    release: () => {
      push(['up'])
      state.down = false
      push()
    },
  }
  for (const [kind, ...args] of device.script) actions[kind](...args)
  return {
    cues: cues.map(cue => ({ ...cue, look: pointerLook({ cue, cues, taps: state.taps, pointer: device.pointer }) })),
    captions: state.captions,
  }
}

const pointerLook = ({ cue, cues, taps, pointer }) => {
  const sinceTap = Math.min(...taps.map(time => cue.time - time).filter(age => age >= 0), Infinity)
  const ringAge = sinceTap / 0.45
  const ring = ringAge < 1
    ? { ringSize: pointer.dot + (pointer.ring - pointer.dot) * ease(ringAge), ringAlpha: 0.85 * (1 - ringAge) }
    : { ringSize: pointer.dot, ringAlpha: 0 }
  if (pointer.mode === 'mouse') {
    return { x: cue.at[0], y: cue.at[1], size: cue.down ? pointer.dot * 0.8 : pointer.dot, alpha: 1, ...ring }
  }
  const index = Math.round(cue.time * FPS)
  const near = cues.slice(Math.max(0, index - 3), index + 4).filter(other => other.down).length
  return { x: cue.at[0], y: cue.at[1], size: pointer.dot, alpha: cue.down ? 0.6 : 0.6 * Math.min(1, near / 3), ...ring }
}

const playFrame = async ({ session, cue, dir, frame }) => {
  const { page, app, device } = session
  const mac = device.kind === 'mac'
  for (const op of cue.ops) {
    if (op.startsWith?.('window:')) await setWindow(page, JSON.parse(op.slice(7)))
    if (op === 'move') await page.mouse.move(cue.at[0], cue.at[1])
    if (op === 'down') await page.mouse.down()
    if (op === 'up') await page.mouse.up()
    if (op.startsWith?.('type:')) await page.keyboard.type(op.slice(5))
    if (op.startsWith?.('key:')) await page.keyboard.press(op.slice(4))
  }
  await stepApp(app, { dt: 1000 / FPS, pointer: mac ? null : cue.look })
  if (mac) await drawCursor(page, { ...cue.look, kind: cue.cursor, down: cue.down })
  if (frame === 0) await ensureDir(dir)
  await page.screenshot({ path: path.join(dir, `${String(frame).padStart(5, '0')}.png`) })
}

const layerGraph = ({ shot, inputs }) => {
  const chain = shot.devices.map((device, index) => {
    const from = index === 0 ? '[bg]' : `[l${index}]`
    return `${from}[${inputs + index}:v]overlay=${device.screen.x}:${device.screen.y}:shortest=1[l${index + 1}]`
  })
  return [
    `color=c=${BACKDROP}:s=${shot.width}x${shot.height}:r=${FPS}[bg]`,
    ...chain,
    `[l${shot.devices.length}][0:v]overlay=0:0,format=yuv420p[v]`,
  ].join(';')
}

const renderCaptions = async ({ browser, shot, work, captions }) => {
  const rendered = []
  for (const [index, caption] of captions.entries()) {
    const file = path.join(work, `caption${index}.png`)
    const [width, height] = [shot.width * CAPTION.scale, shot.height * CAPTION.scale]
    await renderSvg({ browser, svg: captionSvg({ shot, text: caption.text, width, height }), width, height, out: file })
    rendered.push({ file, start: caption.start, end: caption.end })
  }
  return rendered
}

const captionSvg = ({ shot, text, width, height }) => `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" `
  + `viewBox="0 0 ${shot.width} ${shot.height}">`
  + `<rect width="${shot.width}" height="${shot.height}" fill="#000" fill-opacity="${CAPTION.tint}"/>`
  + `<text x="${shot.width / 2}" y="${shot.height / 2}" text-anchor="middle" dominant-baseline="central" `
  + `font-family="${CAPTION.font}" font-size="${CAPTION.size}" font-weight="${CAPTION.weight}" fill="${CAPTION.colour}">${text}</text></svg>`

const captionGraph = ({ captions, inputs, from }) => {
  if (!captions.length) return { graph: [], out: from }
  const graph = captions.flatMap((caption, index) => {
    const fadeOut = Math.max(caption.start, caption.end - CAPTION.fade)
    const input = `[${inputs + index}:v]scale=iw/${CAPTION.scale}:ih/${CAPTION.scale}:flags=lanczos,format=rgba,fade=in:st=${caption.start}:d=${CAPTION.fade}:alpha=1,`
      + `fade=out:st=${fadeOut}:d=${CAPTION.fade}:alpha=1[c${index}]`
    const into = index === 0 ? from : `[t${index}]`
    const shown = `enable='between(t,${caption.start},${caption.end})'`
    return [input, `${into}[c${index}]overlay=0:0:${shown}[t${index + 1}]`]
  })
  return { graph, out: `[t${captions.length}]` }
}

const encode = async ({ shot, work, framePng, audio, captions, frameCount, out }) => {
  const sequences = shot.devices.flatMap((_, index) => ['-framerate', String(FPS), '-i', path.join(work, `d${index}`, '%05d.png')])
  const captionInputs = captions.flatMap(caption => ['-loop', '1', '-framerate', String(FPS), '-t', String(caption.end), '-i', caption.file])
  const layers = layerGraph({ shot, inputs: 1 }).replace(',format=yuv420p[v]', '[framed]')
  const overlays = captionGraph({ captions, inputs: shot.devices.length + 2, from: '[framed]' })
  await ffmpeg([
    '-i', framePng, ...sequences, '-i', audio, ...captionInputs,
    '-filter_complex', [layers, ...overlays.graph, `${overlays.out}format=yuv420p[v]`].join(';'),
    '-map', '[v]', '-map', `${shot.devices.length + 1}:a`,
    '-c:v', 'libx264', '-preset', 'slow', '-tune', 'animation', '-crf', values.crf, '-pix_fmt', 'yuv420p',
    '-r', String(FPS), '-frames:v', String(frameCount), '-c:a', 'copy', '-movflags', '+faststart', out,
  ])
}

const addOpening = async ({ shot, work, framePng, out }) => {
  const still = path.join(work, 'opening.png')
  const body = path.join(work, 'body.mp4')
  await poster({ shot, work, framePng, frame: Math.round(shot.opening * FPS), out: still })
  await fs.rename(out, body)
  await ffmpeg([
    '-loop', '1', '-framerate', String(FPS), '-t', String(OPENING_S), '-i', still, '-i', body,
    '-filter_complex', [
      '[0:v]format=yuv420p[o]', '[o][1:v]concat=n=2:v=1:a=0[v]',
      `aevalsrc=0:s=48000:c=stereo:d=${OPENING_S}[s]`, '[s][1:a]concat=n=2:v=0:a=1[a]',
    ].join(';'),
    '-map', '[v]', '-map', '[a]',
    '-c:v', 'libx264', '-preset', 'slow', '-tune', 'animation', '-crf', values.crf, '-pix_fmt', 'yuv420p',
    '-r', String(FPS), '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', out,
  ])
}

const poster = async ({ shot, work, framePng, frame, out }) => {
  const stills = shot.devices.flatMap((_, index) => ['-i', path.join(work, `d${index}`, `${String(frame).padStart(5, '0')}.png`)])
  const graph = layerGraph({ shot, inputs: 1 }).replace('format=yuv420p', 'format=rgb24')
  await ffmpeg(['-i', framePng, ...stills, '-filter_complex', graph, '-map', '[v]', '-frames:v', '1', out])
}

const ease = t => 0.5 - Math.cos(Math.PI * Math.min(1, Math.max(0, t))) / 2

const OPENING_S = 0.1

const outputName = name => name === 'devices' ? 'demo' : `demo-${name}`

await main()
