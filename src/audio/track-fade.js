export const TRACK_FADE_OUT_S = 0.25
export const TRACK_FADE_IN_S = 0.4

export const isTrackAudible = ({ live, sounding, paused, ended }) => Boolean(live && sounding && !paused && !ended)

export const rampGain = ({ ctx, param, value, seconds }) => {
  const now = ctx.currentTime
  param.cancelScheduledValues(now)
  param.setValueAtTime(param.value, now)
  param.linearRampToValueAtTime(value, now + seconds)
}
