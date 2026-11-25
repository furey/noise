export const HIDE_DELAY_S = 0.3
export const FADE_OUT_S = 0.25
export const FADE_IN_S = 0.15
export const KEY_REVEAL_S = 1.5

export const createAutoHide = () => ({ enabled: false, inside: true, held: false, searching: false, keyReveal: 0, waited: 0, alpha: 1 })

export const wantsHidden = ({ enabled, inside, held, searching = false, keyReveal }, playing) =>
  enabled && playing && !inside && !held && !searching && keyReveal <= 0

export const SONG_CONTROLS_FADE_S = 0.6

export const stepSongControls = ({ alpha, trackOn, dt, reducedMotion }) => {
  const target = trackOn ? 0 : 1
  if (reducedMotion) return target
  const step = dt / SONG_CONTROLS_FADE_S
  return trackOn ? Math.max(target, alpha - step) : Math.min(target, alpha + step)
}

export const stepAutoHide = ({ auto, playing, dt, reducedMotion }) => {
  auto.keyReveal = Math.max(0, auto.keyReveal - dt)
  if (!wantsHidden(auto, playing)) {
    auto.waited = 0
    auto.alpha = reducedMotion ? 1 : Math.min(1, auto.alpha + dt / FADE_IN_S)
    return auto.alpha
  }
  auto.waited += dt
  if (auto.waited < HIDE_DELAY_S) return auto.alpha
  auto.alpha = reducedMotion ? 0 : Math.max(0, auto.alpha - dt / FADE_OUT_S)
  return auto.alpha
}

export const revealForKey = auto => {
  auto.keyReveal = KEY_REVEAL_S
}
