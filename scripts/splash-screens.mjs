export const SPLASH_TOP = '#0a0a0a'
export const SPLASH_BOTTOM = '#000000'
export const SPLASH_DIR = 'icons/splash'

const DEVICES = [
  { width: 1032, height: 1376, ratio: 2 },
  { width: 1024, height: 1366, ratio: 2 },
  { width: 834, height: 1210, ratio: 2 },
  { width: 834, height: 1194, ratio: 2 },
  { width: 820, height: 1180, ratio: 2 },
  { width: 834, height: 1112, ratio: 2 },
  { width: 810, height: 1080, ratio: 2 },
  { width: 768, height: 1024, ratio: 2 },
  { width: 744, height: 1133, ratio: 2 },
  { width: 440, height: 956, ratio: 3 },
  { width: 430, height: 932, ratio: 3 },
  { width: 428, height: 926, ratio: 3 },
  { width: 420, height: 912, ratio: 3 },
  { width: 414, height: 896, ratio: 3 },
  { width: 414, height: 896, ratio: 2 },
  { width: 414, height: 736, ratio: 3 },
  { width: 402, height: 874, ratio: 3 },
  { width: 393, height: 852, ratio: 3 },
  { width: 390, height: 844, ratio: 3 },
  { width: 375, height: 812, ratio: 3 },
  { width: 375, height: 667, ratio: 2 },
  { width: 320, height: 568, ratio: 2 },
]

export const splashScreens = () => DEVICES.flatMap(device => [
  splashScreen({ ...device, orientation: 'portrait' }),
  splashScreen({ ...device, orientation: 'landscape' }),
])

const splashScreen = ({ width, height, ratio, orientation }) => {
  const isPortrait = orientation === 'portrait'
  const pixelWidth = (isPortrait ? width : height) * ratio
  const pixelHeight = (isPortrait ? height : width) * ratio
  return {
    file: `splash-${pixelWidth}x${pixelHeight}.png`,
    pixelWidth,
    pixelHeight,
    media: [
      `(device-width: ${width}px)`,
      `(device-height: ${height}px)`,
      `(-webkit-device-pixel-ratio: ${ratio})`,
      `(orientation: ${orientation})`,
    ].join(' and '),
  }
}
