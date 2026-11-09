import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const ALL_APPLICATION_PACKAGES_READ = '*S-1-15-2-1:(OI)(CI)(RX)'
const ICACLS_TIMEOUT_MS = 10000

export const createInstallAccess = ({ folder, electronVersion }) => {
  const pendingPath = path.join(folder, 'start-pending.json')
  const recordPath = path.join(folder, 'install-access.json')
  return {
    beginStart: () => {
      const lastStartFailed = readJson(pendingPath)?.electron === electronVersion
      writeJson(pendingPath, { electron: electronVersion })
      return lastStartFailed
    },
    endStart: () => fs.rmSync(pendingPath, { force: true }),
    needsRepair: lastStartFailed => lastStartFailed && readJson(recordPath)?.electron !== electronVersion,
    markRepaired: () => writeJson(recordPath, { electron: electronVersion }),
  }
}

export const grantSandboxReadAccess = folder => {
  try {
    execFileSync(icaclsPath(), [folder, '/grant', ALL_APPLICATION_PACKAGES_READ], {
      stdio: 'ignore',
      timeout: ICACLS_TIMEOUT_MS,
      windowsHide: true,
    })
  } catch {
    return false
  }
  return true
}

const icaclsPath = () => path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'icacls.exe')

const readJson = filePath => {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return null
  }
}

const writeJson = (filePath, value) => {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, JSON.stringify(value))
  } catch {
    return false
  }
  return true
}
