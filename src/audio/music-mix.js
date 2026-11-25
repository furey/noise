const VIOLET_NOISE_GAIN = 0.42
const BROWN_NOISE_LIFT = 0.48
const LAST_POSITION = 4

export const noiseGainFor = ({ position }) => {
  const towardsBrown = 1 - Math.max(0, Math.min(LAST_POSITION, position)) / LAST_POSITION
  return VIOLET_NOISE_GAIN + BROWN_NOISE_LIFT * towardsBrown ** 2
}
