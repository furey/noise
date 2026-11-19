import path from 'node:path'

export const MUSIC_FOLDER_NAME = 'Noise Music'

export const musicFolder = ({ appData, override }) => override || path.join(appData, MUSIC_FOLDER_NAME)

export const driverFile = folder => path.join(folder, 'driver.mjs')

export const logFile = folder => path.join(folder, 'driver.log')
