import fs from 'node:fs'
import path from 'node:path'
import { utilityProcess } from 'electron'
import { TIMEOUTS_MS, usableResult } from './contract.mjs'
import { driverFile, logFile } from './paths.mjs'

export const IDLE_MS = 60000

export const createHost = ({ folder, onStatus, idleMs = IDLE_MS }) => {
  const host = {
    folder, onStatus, idleMs, child: null, status: 'absent', calls: new Map(), lastId: 0, restarts: [],
    logged: Promise.resolve(), sleeping: false, waking: null, idleTimer: 0,
  }
  return {
    start: () => start(host),
    status: () => host.status,
    isAwake: () => Boolean(host.child),
    call: ({ method, input, options }) => call(host, { method, input, options }),
    cancel: method => cancelMethod(host, method),
    stop: () => stop(host),
  }
}

const start = host => {
  if (!fs.existsSync(driverFile(host.folder))) return setStatus(host, 'absent')
  rotateLog(host.folder)
  setStatus(host, 'starting')
  wake(host).then(() => scheduleSleep(host), () => {})
}

const wake = host => {
  host.waking ??= new Promise((resolve, rejectWake) => {
    host.onAwake = { resolve, reject: rejectWake }
    spawn(host)
  }).finally(() => {
    host.waking = null
    host.onAwake = null
  })
  return host.waking
}

const spawn = host => {
  const child = utilityProcess.fork(PROCESS_ENTRY, [driverFile(host.folder)], { serviceName: 'Noise Music Driver', stdio: 'pipe' })
  child.stdout?.on('data', chunk => log(host, chunk))
  child.stderr?.on('data', chunk => log(host, chunk))
  child.on('message', message => onMessage(host, message))
  child.on('exit', code => onExit(host, child, code))
  host.child = child
}

const onMessage = (host, message) => {
  if (message?.type === 'ready') return awake(host)
  if (message?.type === 'invalid') return reject(host, message.reason)
  if (message?.type === 'result') return settle(host, message.id, pending => resolveCall(pending, message.result))
  if (message?.type === 'error') return settle(host, message.id, pending => pending.reject(message.error))
}

const awake = host => {
  setStatus(host, 'ready')
  host.onAwake?.resolve()
}

const reject = (host, reason) => {
  log(host, `Driver rejected: ${reason}\n`)
  setStatus(host, 'invalid')
  host.onAwake?.reject({ code: 'unavailable', message: reason })
  host.child?.kill()
}

const onExit = (host, child, code) => {
  if (host.child !== child) return
  host.child = null
  if (host.sleeping) {
    host.sleeping = false
    return
  }
  failAll(host, { code: 'unavailable', message: 'The music driver stopped' })
  host.onAwake?.reject({ code: 'unavailable', message: 'The music driver stopped' })
  if (host.status !== 'ready') return
  log(host, `Driver stopped with code ${code}\n`)
  if (!mayRestart(host)) reject(host, 'the driver keeps stopping')
}

const mayRestart = host => {
  const now = Date.now()
  host.restarts = [...host.restarts.filter(at => now - at < RESTART_WINDOW_MS), now]
  return host.restarts.length <= RESTART_LIMIT
}

const call = async (host, { method, input, options = {} }) => {
  if (host.status !== 'ready') throw { code: 'unavailable', message: 'The music driver is not ready' }
  clearTimeout(host.idleTimer)
  if (!host.child) await wake(host)
  return new Promise((resolve, rejectCall) => {
    const id = ++host.lastId
    const timer = setTimeout(() => timeOut(host, id), TIMEOUTS_MS[method])
    host.calls.set(id, { method, resolve, reject: rejectCall, timer, parse: usableResult[method] })
    host.child.postMessage({ type: 'call', id, method, input, options })
  })
}

const resolveCall = (pending, raw) => {
  const result = pending.parse(raw)
  if (result) return pending.resolve(result)
  pending.reject({ code: 'unavailable', message: 'The music driver returned an unusable result' })
}

const timeOut = (host, id) => {
  host.child?.postMessage({ type: 'cancel', id })
  settle(host, id, pending => pending.reject({ code: 'timeout', message: `The music driver took too long to ${pending.method}` }))
}

const cancelMethod = (host, method) => [...host.calls].filter(([, pending]) => pending.method === method).forEach(([id]) => {
  host.child?.postMessage({ type: 'cancel', id })
  settle(host, id, pending => pending.reject({ code: 'cancelled', message: 'Cancelled' }))
})

const settle = (host, id, finish) => {
  const pending = host.calls.get(id)
  if (!pending) return
  clearTimeout(pending.timer)
  host.calls.delete(id)
  finish(pending)
  scheduleSleep(host)
}

const scheduleSleep = host => {
  clearTimeout(host.idleTimer)
  if (host.calls.size || !host.child) return
  host.idleTimer = setTimeout(() => sleep(host), host.idleMs)
}

const sleep = host => {
  if (host.calls.size || !host.child || host.waking) return
  host.sleeping = true
  host.child.kill()
}

const failAll = (host, error) => [...host.calls.keys()].forEach(id => settle(host, id, pending => pending.reject(error)))

const stop = host => {
  clearTimeout(host.idleTimer)
  const child = host.child
  host.child = null
  failAll(host, { code: 'unavailable', message: 'The music driver stopped' })
  setStatus(host, 'absent')
  child?.kill()
}

const setStatus = (host, status) => {
  if (host.status === status) return
  host.status = status
  host.onStatus(status)
}

const log = (host, text) => {
  const line = `${new Date().toISOString()} ${text}`
  host.logged = host.logged.then(() => fs.promises.appendFile(logFile(host.folder), line)).catch(() => {})
}

const rotateLog = folder => {
  const file = logFile(folder)
  const size = fs.statSync(file, { throwIfNoEntry: false })?.size ?? 0
  if (size > LOG_LIMIT_BYTES) fs.renameSync(file, `${file}.old`)
}

const PROCESS_ENTRY = path.join(import.meta.dirname, 'driver-process.mjs')
const RESTART_WINDOW_MS = 60000
const RESTART_LIMIT = 3
const LOG_LIMIT_BYTES = 1024 * 1024
