import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { _electron as electron } from 'playwright-core'

const main = async () => {
  const root = path.resolve(import.meta.dirname, '..')
  const minutes = Number(process.env.SOAK_MINUTES) || DEFAULT_MINUTES
  const plan = phasePlan(minutes).filter(phase => !process.env.SOAK_ONLY || phase.name === process.env.SOAK_ONLY)
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'noise-soak-'))
  const musicDir = path.join(folder, 'music')
  await fs.cp(path.join(root, 'test', 'fixtures', 'music-driver'), musicDir, { recursive: true }).catch(() => {})
  const app = await electron.launch({
    args: ['--js-flags=--expose-gc', root],
    cwd: root,
    env: { ...process.env, NOISE_USER_DATA: path.join(folder, 'profile'), NOISE_MUSIC_DIR: musicDir, NOISE_QUIET_WINDOW: '1' },
  })
  try {
    const page = await app.firstWindow()
    await app.context().addInitScript(INSTRUMENT)
    await page.reload({ waitUntil: 'load' })
    if (plan.some(phase => phase.name !== 'noise')) await waitFor(page, () => document.documentElement.hasAttribute('data-music'))
    const samples = []
    for (const phase of plan) samples.push(...await runPhase({ app, page, phase }))
    report({ samples, minutes })
  } finally {
    await app.close()
    await fs.rm(folder, { recursive: true, force: true }).catch(() => {})
  }
}

const phasePlan = minutes => [
  { name: 'noise', seconds: minutes * 60 * 0.15, step: noiseStep },
  { name: 'song', seconds: minutes * 60 * 0.15, step: steadySongStep },
  { name: 'songs', seconds: minutes * 60 * 0.4, step: songStep },
  { name: 'search', seconds: minutes * 60 * 0.15, step: searchStep },
  { name: 'stopped', seconds: minutes * 60 * 0.15, step: stoppedStep },
]

const runPhase = async ({ app, page, phase }) => {
  const samples = []
  const ends = Date.now() + phase.seconds * 1000
  let nextSample = 0
  await phase.step({ page, first: true })
  while (Date.now() < ends) {
    if (Date.now() >= nextSample) {
      samples.push({ phase: phase.name, ...await sample({ app, page }) })
      if (process.env.SOAK_TRACE) trace(samples.at(-1))
      nextSample = Date.now() + SAMPLE_EVERY_MS
    }
    await phase.step({ page, first: false })
  }
  samples.push({ phase: phase.name, ...await sample({ app, page }) })
  return samples
}

const noiseStep = async ({ page, first }) => {
  if (first) await page.click('#surface')
  await delay(STEP_MS)
}

const songStep = async ({ page, first }) => {
  if (first) await page.evaluate(() => window.__noiseTest.player.play({ id: 'fake-1', title: 'Fake' }))
  const status = await page.evaluate(() => window.__noiseTest.track().status)
  if (status === 'active') await seekNearEnd(page)
  if (status === 'idle') await page.evaluate(() => window.__noiseTest.player.play({ id: `fake-${Date.now()}`, title: 'Again' }))
  await delay(STEP_MS)
}

const steadySongStep = async ({ page, first }) => {
  if (first) await page.evaluate(() => window.__noiseTest.player.play({ id: 'fake-1', title: 'Fake' }))
  await delay(STEP_MS)
}

const searchStep = async ({ page }) => {
  await page.keyboard.press('/')
  await page.keyboard.type('fake song', { delay: 20 })
  await delay(400)
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
}

const seekNearEnd = async page => {
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
}

const stoppedStep = async ({ page, first }) => {
  if (first) await page.evaluate(() => window.__noiseTest.player.stop())
  await delay(STEP_MS)
}

const sample = async ({ app, page }) => {
  const frames = await page.evaluate(ms => window.__noiseTest.frameStats(ms), FRAME_WINDOW_MS)
  const pageStats = await page.evaluate(() => {
    window.gc?.()
    return {
      heapMb: performance.memory.usedJSHeapSize / 1048576,
      domNodes: document.getElementsByTagName('*').length,
      sourcesConnected: window.__noiseTest.sourcesConnected?.() ?? 0,
    }
  })
  const processes = await app.evaluate(({ app: electronApp }) => electronApp.getAppMetrics()
    .map(({ type, serviceName, memory, cpu }) => ({ type: serviceName || type, mb: memory.workingSetSize / 1024, cpu: cpu.percentCPUUsage })))
  return { at: Date.now(), ...frames, ...pageStats, processes }
}

const trace = entry => console.log([entry.phase, ...entry.processes.map(({ type, mb }) => `${type.replace(/\.mojom\.\w+/, '')} ${Math.round(mb)}`)].join(' | '))

const report = ({ samples, minutes }) => {
  const phases = [...new Set(samples.map(({ phase }) => phase))]
  const rows = phases.map(phase => summarise(phase, samples.filter(entry => entry.phase === phase)))
  console.log(`Soak test, ${minutes} min`)
  console.table(rows)
  const first = samples[0]
  const last = samples.at(-1)
  console.table(processRows(samples))
  console.log(JSON.stringify({
    heapMb: [round(first.heapMb), round(last.heapMb)],
    domNodes: [first.domNodes, last.domNodes],
    sourcesConnected: [first.sourcesConnected, last.sourcesConnected],
    processMb: [totalMb(first), totalMb(last)],
  }))
}

const processRows = samples => {
  const first = samples[0].processes
  const last = samples.at(-1).processes
  return [...new Set([...first, ...last].map(({ type }) => type))].map(type => ({
    process: type,
    startMb: round(sum(first.filter(entry => entry.type === type).map(({ mb }) => mb))),
    endMb: round(sum(last.filter(entry => entry.type === type).map(({ mb }) => mb))),
  }))
}

const summarise = (phase, entries) => {
  const first = entries[0]
  const last = entries.at(-1)
  return {
    phase,
    heapMb: `${round(first.heapMb)} → ${round(last.heapMb)}`,
    totalMb: `${round(totalMb(first))} → ${round(totalMb(last))}`,
    cpuPct: round(average(entries.map(entry => sum(entry.processes.map(({ cpu }) => cpu))))),
    fps: round(average(entries.map(entry => entry.fps))),
    worstFrameMs: round(Math.max(...entries.map(entry => entry.worstMs))),
    domNodes: `${first.domNodes} → ${last.domNodes}`,
    sources: `${first.sourcesConnected} → ${last.sourcesConnected}`,
  }
}

const INSTRUMENT = () => {
  const connected = new Set()
  const create = AudioContext.prototype.createMediaElementSource
  AudioContext.prototype.createMediaElementSource = function (element) {
    const node = create.call(this, element)
    const connect = node.connect.bind(node)
    const disconnect = node.disconnect.bind(node)
    node.connect = (...args) => {
      connected.add(node)
      return connect(...args)
    }
    node.disconnect = (...args) => {
      connected.delete(node)
      return disconnect(...args)
    }
    return node
  }
  window.__noiseTest = {
    sourcesConnected: () => connected.size,
    frameStats: ms => new Promise(resolve => {
      const times = []
      const started = performance.now()
      const tick = now => {
        times.push(now)
        if (now - started < ms) return requestAnimationFrame(tick)
        const gaps = times.slice(1).map((time, index) => time - times[index])
        resolve({ fps: gaps.length / (ms / 1000), worstMs: Math.max(0, ...gaps) })
      }
      requestAnimationFrame(tick)
    }),
  }
}

const waitFor = async (page, check) => {
  const deadline = Date.now() + WAIT_MS
  while (Date.now() < deadline) {
    if (await page.evaluate(check)) return
    await delay(100)
  }
  throw new Error('The app did not get ready')
}

const totalMb = entry => sum(entry.processes.map(({ mb }) => mb))

const sum = values => values.reduce((total, value) => total + value, 0)

const average = values => values.length ? sum(values) / values.length : 0

const round = value => Math.round(value * 10) / 10

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

const DEFAULT_MINUTES = 10
const SAMPLE_EVERY_MS = 15000
const FRAME_WINDOW_MS = 2000
const STEP_MS = 500
const WAIT_MS = 15000

main()
