const fs = require('node:fs')
const path = require('node:path')

const plainNamesByArchName = {
  'Noise-Mac-universal.dmg': 'Noise-Mac.dmg',
  'Noise-Mac-arm64.dmg': 'Noise-Mac-Apple-Chip.dmg',
  'Noise-Mac-x64.dmg': 'Noise-Mac-Intel.dmg',
  'Noise-Linux-x86_64.AppImage': 'Noise-Linux.AppImage',
  'Noise-Linux-arm64.AppImage': 'Noise-Linux-ARM.AppImage'
}

module.exports = {
  appId: 'io.github.furey.noise',
  productName: 'Noise',
  copyright: 'Copyright © James Furey. GPL-3.0-or-later.',
  directories: { output: 'release', buildResources: 'build' },
  files: ['dist/**/*', 'electron/**/*', 'package.json'],
  asar: true,
  electronLanguages: ['en', 'en-GB', 'en_GB'],
  extraMetadata: { main: 'electron/main.mjs' },
  publish: null,
  electronFuses: {
    runAsNode: false,
    enableCookieEncryption: true,
    enableNodeOptionsEnvironmentVariable: false,
    onlyLoadAppFromAsar: true,
    loadBrowserProcessSpecificV8Snapshot: false
  },
  mac: {
    target: [
      { target: 'dmg', arch: ['universal', 'arm64', 'x64'] }
    ],
    icon: 'build/icon.icns',
    identity: '-',
    hardenedRuntime: false,
    gatekeeperAssess: false,
    category: 'public.app-category.music'
  },
  dmg: {
    sign: false,
    format: 'ULFO',
    title: 'Noise ${version}',
    artifactName: 'Noise-Mac-${arch}.${ext}'
  },
  win: {
    target: [{ target: 'nsis', arch: ['x64'] }],
    icon: 'build/icon.ico',
    signAndEditExecutable: process.platform === 'win32'
  },
  nsis: {
    oneClick: true,
    perMachine: false,
    deleteAppDataOnUninstall: false,
    shortcutName: 'Noise',
    artifactName: 'Noise-Windows.${ext}'
  },
  linux: {
    target: [{ target: 'AppImage', arch: ['x64', 'arm64'] }],
    category: 'Audio',
    executableName: 'noise',
    icon: 'build/icons',
    synopsis: 'Brown, pink, white, blue, and violet noise for focus.'
  },
  appImage: { artifactName: 'Noise-Linux-${arch}.${ext}' },
  afterAllArtifactBuild: ({ artifactPaths }) => {
    artifactPaths.forEach(renameToPlainName)
    return []
  }
}

const renameToPlainName = (artifactPath) => {
  const plainName = plainNamesByArchName[path.basename(artifactPath)]
  if (!plainName) return
  fs.renameSync(artifactPath, path.join(path.dirname(artifactPath), plainName))
}
