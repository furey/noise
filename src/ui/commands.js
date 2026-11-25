import { timerSize } from './timer.js'

export const runCommand = (app, command) => {
  const [name, value] = String(command).split(':')
  COMMANDS[name]?.(app, Number(value))
}

export const menuState = app => {
  const { playing, pos, wave, timer, track } = app.state
  return { playing, colour: Number.isInteger(pos) ? pos : -1, wave, music: app.musicStep(), timer: timerSize(timer), song: track.status !== 'idle' }
}

const COMMANDS = {
  play: app => app.togglePlay(),
  stop: app => app.stop(),
  colour: (app, index) => app.selectColour(index),
  'colour-down': app => app.nudgePos(-1),
  'colour-up': app => app.nudgePos(1),
  'volume-up': app => app.nudgeVolume(1),
  'volume-down': app => app.nudgeVolume(-1),
  wave: app => app.toggleWave(),
  music: (app, step) => app.chooseMusic(step),
  'music-next': app => app.cycleMusic(),
  timer: (app, minutes) => app.chooseTimer(minutes),
  'timer-next': app => app.cycleTimer(),
}
