import { pathToFileURL } from 'node:url'
import { driverError, driverProblem, isDriverFunction, supportedResult } from './contract.mjs'

const port = process.parentPort
const calls = new Map()

const start = async driverPath => {
  const driver = await import(pathToFileURL(driverPath).href).catch(error => ({ loadError: error }))
  if (driver.loadError) return port.postMessage({ type: 'invalid', reason: `the driver failed to load: ${driver.loadError.message}` })
  const problem = driverProblem(driver)
  if (problem) return port.postMessage({ type: 'invalid', reason: problem })
  port.on('message', ({ data }) => handle(driver, data))
  port.postMessage({ type: 'ready' })
}

const handle = (driver, message) => {
  if (message?.type === 'cancel') return calls.get(message.id)?.abort()
  if (message?.type === 'call' && isDriverFunction(message.method)) run(driver, message)
}

const run = async (driver, { id, method, input, options }) => {
  const controller = new AbortController()
  calls.set(id, controller)
  try {
    const result = await driver[method](input, { ...options, signal: controller.signal })
    port.postMessage({ type: 'result', id, result: supportedResult({ driver, method, result }) })
  } catch (error) {
    port.postMessage({ type: 'error', id, error: driverError(error) })
  } finally {
    calls.delete(id)
  }
}

start(process.argv.at(-1))
