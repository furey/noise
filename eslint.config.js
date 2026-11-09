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
    ignores: ['src/audio/noise.worklet.js', 'src/sw.js'],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    files: ['src/audio/noise.worklet.js'],
    languageOptions: { globals: { ...globals.audioWorklet } },
  },
  {
    files: ['src/sw.js'],
    languageOptions: { globals: { ...globals.serviceworker } },
  },
  {
    files: ['electron-builder.config.cjs'],
    languageOptions: { sourceType: 'commonjs', globals: { ...globals.node } },
  },
  {
    files: ['test/**/*.js', 'test/**/*.mjs', 'scripts/**/*.mjs', 'electron/**/*.mjs', '*.config.js'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ['test/startup.test.mjs'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
]
