import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { measureGrid, timerHitBox } from '../src/ui/grid.js'
import { LAST } from '../src/ui/colours.js'
import {
  BACKDROP, FPS, automationLog, desktopFrame, deviceFrame, ensureDir, ffmpeg, frameSvg, launchBrowser, mediaDir, openApp,
  renderSvg, stepApp, virtualNow,
} from './demo-stage.mjs'
import { renderDemoAudio } from './render-demo-audio.mjs'

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
  ['glide', 'centre', glide],
  ['tap', 'centre'],
  ['wait', 1.6],
]

const heroScript = ({ from, to }) => [
  ['wait', 1.5],
  ['caption', 'Tap to play'],
  ['glide', 'centre', 0.4],
  ['tap', 'centre'],
  ['wait', 1.4],
  ['caption', 'Drag along the colour strip to change the noise'],
  ['glide', `colour:${from}`, 0.4],
  ['press', `colour:${from}`],
  ['drag', `colour:${to}`, 3.6],
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
  ['caption', 'Tap the corner square to set a sleep timer'],
  ['glide', 'timer', 0.4],
  ['tap', 'timer'],
  ['wait', 1.4],
  ['tap', 'timer'],
  ['wait', 1.4],
  ['glide', `colour:${to}`, 0.4],
  ['press', `colour:${to}`],
  ['drag', `colour:${from}`, 2.6],
  ['release'],
  ['wait', 0.8],
  ['caption', 'Tap to pause'],
  ['glide', 'centre', 0.4],
  ['tap', 'centre'],
  ['wait', 2.0],
]

const desktopDevice = ({ viewport, dpr, x, y, bar, settings, script, pointer }) => {
  const w = viewport.width * dpr
  const h = viewport.height * dpr
  return {
    viewport, dpr, settings, script, pointer,
    screen: { x, y: y + bar },
    shape: desktopFrame({ x, y, w, h: h + bar, bar }),
  }
}

const touchDevice = ({ viewport, dpr, x, y, bezel, radius, settings, insets, script, pointer }) => ({
  viewport, dpr, settings, insets, script, pointer,
  screen: { x, y },
  shape: deviceFrame({ x, y, w: viewport.width * dpr, h: viewport.height * dpr, bezel, screenRadius: radius }),
})

const MOUSE = { mode: 'mouse', dot: 20, ring: 70 }
const TOUCH = { mode: 'touch', dot: 46, ring: 96 }
const PHONE_INSETS = { top: 47, right: 0, bottom: 34, left: 0 }

const CAPTION = {
  hold: 2.2, fade: 0.35, size: 64, weight: 600, scale: 2, tint: 0.62,
  colour: '#f2f2f4', font: '-apple-system, BlinkMacSystemFont, Helvetica Neue, sans-serif',
}

const HERO_SETTINGS = { pos: 0, volume: 0.6 }
const HERO_SCRIPT = heroScript({ from: 0, to: 4 })

const SHOTS = {
  desktop: {
    width: 1600, height: 1000, poster: 6.0,
    devices: [desktopDevice({
      viewport: { width: 1440, height: 856 }, dpr: 1, x: 80, y: 52, bar: 40, pointer: MOUSE,
      script: fullScript({ glide: 0.8, drag: 3.8, from: 0, to: 4 }),
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
  wave: {
    width: 916, height: 1824, poster: 12,
    devices: [touchDevice({
      viewport: { width: 390, height: 844 }, dpr: 2, x: 68, y: 68, bezel: 28, radius: 94, pointer: TOUCH,
      insets: PHONE_INSETS, settings: { pos: 0.4, volume: 0.7 },
      script: [['wait', 1], ['tap', 'centre'], ['wait', 4], ['tap', 'wave'], ['wait', 26], ['tap', 'wave'], ['wait', 6]],
    })],
  },
  devices: {
    width: 1920, height: 1080, poster: 5.2,
    devices: [
      desktopDevice({
        viewport: { width: 1440, height: 900 }, dpr: 0.55, x: 61, y: 381, bar: 24, pointer: MOUSE,
        settings: HERO_SETTINGS, script: HERO_SCRIPT,
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
  await renderSvg({ browser, svg: frameSvg({ ...shot, shapes: shot.devices.map(device => device.shape) }), width: shot.width, height: shot.height, out: framePng })
  const sessions = []
  for (const device of shot.devices) sessions.push(await openSession({ browser, device }))
  const timelines = sessions.map(session => buildTimeline(session))
  const frameCount = Math.max(...timelines.map(timeline => timeline.cues.length))
  const starts = await Promise.all(sessions.map(session => virtualNow(session.page)))
  for (let frame = 0; frame < frameCount; frame++) {
    await Promise.all(sessions.map((session, index) => playFrame({ session, cue: timelines[index].cues[frame] ?? timelines[index].cues.at(-1), dir: path.join(work, `d${index}`), frame })))
  }
  const log = await automationLog(sessions[0].page)
  await Promise.all(sessions.map(session => session.context.close()))
  const duration = frameCount / FPS
  const audio = path.join(work, 'audio.m4a')
  const { gainDb } = await renderDemoAudio({ log, start: starts[0] / 1000, duration, out: audio })
  const captions = await renderCaptions({ browser, shot, work, captions: timelines[0].captions })
  await encode({ shot, work, framePng, audio, captions, out: path.join(values.out, `demo-${name}.mp4`) })
  await poster({ shot, work, framePng, frame: Math.round(shot.poster * FPS), out: path.join(values.out, `demo-${name}.png`) })
  await fs.rm(work, { recursive: true })
  console.log(`demo-${name}: ${frameCount} frames, ${duration.toFixed(2)} s, audio gain ${gainDb.toFixed(1)} dB`)
}

const openSession = async ({ browser, device }) => {
  const { context, page } = await openApp({
    browser, url: values.url, viewport: device.viewport, dpr: device.dpr, settings: device.settings, insets: device.insets,
  })
  for (let t = 0; t < WARMUP_MS; t += 1000 / FPS) await stepApp(page, { dt: 1000 / FPS, pointer: null })
  const grid = measureGrid({
    width: device.viewport.width, height: device.viewport.height, dpr: Math.min(2, device.dpr), insets: device.insets ?? { top: 0, right: 0, bottom: 0, left: 0 },
  })
  return { context, page, device, spots: spotsFor(grid, device.viewport) }
}

const spotsFor = (grid, viewport) => {
  const synth = grid.synthRows * grid.stepY
  const timer = timerHitBox(grid, 0)
  const colourY = (grid.colourTop + 1.5) * grid.stepY
  return {
    centre: [viewport.width * 0.5, synth * 0.42],
    rest: [viewport.width * 0.72, synth * 0.7],
    volume: [viewport.width * 0.6, synth * 0.55],
    volumeUp: [viewport.width * 0.6, synth * 0.13],
    volumeDown: [viewport.width * 0.6, synth * 0.85],
    timer: [timer.left + timer.width / 2, timer.top + timer.height / 2],
    wave: [viewport.width - timer.left - timer.width / 2, timer.top + timer.height / 2],
    colour: pos => [(pos / LAST * (grid.cols - 1) + 0.5) * grid.cellW, colourY],
  }
}

const spot = (spots, name) => {
  const [key, value] = name.split(':')
  return key === 'colour' ? spots.colour(Number(value)) : spots[key]
}

const buildTimeline = ({ device, spots }) => {
  const cues = []
  const state = { at: spots.rest, down: false, taps: [], touchStart: null, captions: [] }
  const push = (ops = []) => cues.push({ at: [...state.at], down: state.down, ops, time: cues.length / FPS })
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
  const { page } = session
  for (const op of cue.ops) {
    if (op === 'move') await page.mouse.move(cue.at[0], cue.at[1])
    if (op === 'down') await page.mouse.down()
    if (op === 'up') await page.mouse.up()
    if (op.startsWith?.('type:')) await page.keyboard.type(op.slice(5))
  }
  await stepApp(page, { dt: 1000 / FPS, pointer: cue.look })
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

const encode = async ({ shot, work, framePng, audio, captions, out }) => {
  const sequences = shot.devices.flatMap((_, index) => ['-framerate', String(FPS), '-i', path.join(work, `d${index}`, '%05d.png')])
  const captionInputs = captions.flatMap(caption => ['-loop', '1', '-framerate', String(FPS), '-t', String(caption.end), '-i', caption.file])
  const layers = layerGraph({ shot, inputs: 1 }).replace(',format=yuv420p[v]', '[framed]')
  const overlays = captionGraph({ captions, inputs: shot.devices.length + 2, from: '[framed]' })
  await ffmpeg([
    '-i', framePng, ...sequences, '-i', audio, ...captionInputs,
    '-filter_complex', [layers, ...overlays.graph, `${overlays.out}format=yuv420p[v]`].join(';'),
    '-map', '[v]', '-map', `${shot.devices.length + 1}:a`,
    '-c:v', 'libx264', '-preset', 'slow', '-tune', 'animation', '-crf', values.crf, '-pix_fmt', 'yuv420p',
    '-r', String(FPS), '-c:a', 'copy', '-shortest', '-movflags', '+faststart', out,
  ])
}

const poster = async ({ shot, work, framePng, frame, out }) => {
  const stills = shot.devices.flatMap((_, index) => ['-i', path.join(work, `d${index}`, `${String(frame).padStart(5, '0')}.png`)])
  const graph = layerGraph({ shot, inputs: 1 }).replace('format=yuv420p', 'format=rgb24')
  await ffmpeg(['-i', framePng, ...stills, '-filter_complex', graph, '-map', '[v]', '-frames:v', '1', out])
}

const ease = t => 0.5 - Math.cos(Math.PI * Math.min(1, Math.max(0, t))) / 2

await main()
