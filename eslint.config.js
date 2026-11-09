import js from '@eslint/js'
import globals from 'globals'

export default [
  { ignores: ['dist/', 'release/'] },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
  },
  {
    files: ['src/**/*.js'],
    ignores: ['src/audio/noise.worklet.js'],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    files: ['src/audio/noise.worklet.js'],
    languageOptions: { globals: { ...globals.audioWorklet } },
  },
  {
    files: ['public/sw.js'],
    languageOptions: { globals: { ...globals.serviceworker } },
  },
  {
    files: ['test/**/*.js', 'scripts/**/*.mjs', '*.config.js'],
    languageOptions: { globals: { ...globals.node } },
  },
]
