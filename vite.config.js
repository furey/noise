import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'vite'

const SERVICE_WORKER = 'src/sw.js'
const PUBLIC_DIR = 'public'

const stripCrossorigin = () => ({
  name: 'strip-crossorigin',
  enforce: 'post',
  transformIndexHtml: html => html.replaceAll(' crossorigin', ''),
})

const serviceWorker = () => ({
  name: 'service-worker',
  apply: 'build',
  enforce: 'post',
  generateBundle(_options, bundle) {
    const files = { ...bundleFiles(bundle), ...publicFiles(PUBLIC_DIR) }
    const names = Object.keys(files).sort()
    const source = fs.readFileSync(SERVICE_WORKER, 'utf8')
      .replace(`'noise-dev'`, `'noise-${versionOf({ files, names })}'`)
      .replace('const PRECACHE = []', `const PRECACHE = ${JSON.stringify(['./', ...names])}`)
    this.emitFile({ type: 'asset', fileName: 'sw.js', source })
  },
})

const bundleFiles = bundle => Object.fromEntries(
  Object.values(bundle).map(item => [item.fileName, item.type === 'chunk' ? item.code : item.source]),
)

const publicFiles = dir => Object.fromEntries(
  fs.readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile() && !entry.name.startsWith('.'))
    .map(entry => path.join(entry.parentPath, entry.name))
    .map(file => [path.relative(dir, file).split(path.sep).join('/'), fs.readFileSync(file)]),
)

const versionOf = ({ files, names }) => {
  const hash = createHash('sha256')
  names.forEach(name => hash.update(name).update(files[name]))
  return hash.digest('hex').slice(0, 12)
}

export default defineConfig({
  base: './',
  plugins: [stripCrossorigin(), serviceWorker()],
  build: {
    sourcemap: false,
    assetsInlineLimit: 0,
  },
})
