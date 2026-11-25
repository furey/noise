import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const SHARED = ['electron/provider', 'src/provider', 'test/fixtures/music-driver', 'test/fixtures/music-driver-invalid', 'test/music-contract.test.js', 'test/music-cache.test.js', 'test/music-follow.test.js', 'test/music-fuzzy.test.js', 'test/music-results.test.js', 'test/music-skip.test.js', 'docs/music-driver-fixtures', 'test/music-driver-fixtures.test.js', 'scripts/diagrams/build.mjs', 'scripts/check-provider-sync.mjs', 'src/help/place.js', 'test/help-place.test.js', 'scripts/soak-test.mjs', 'src/ui/loop.js', 'test/loop.test.js', 'test/e2e-progress.mjs', 'src/ui/ui-scale.js', 'test/ui-scale.test.js']
const SIBLINGS = Object.freeze({ noise: 'noise-8bit', 'noise-8bit': 'noise' })

const main = async () => {
  const root = path.resolve(import.meta.dirname, '..')
  const sibling = path.join(path.dirname(root), SIBLINGS[path.basename(root)] ?? '')
  if (!(await exists(sibling))) return console.log(`Skipped: no sibling repo at ${sibling}`)
  const [mine, theirs] = await Promise.all([hashes(root), hashes(sibling)])
  const different = [...new Set([...mine.keys(), ...theirs.keys()])].filter(file => mine.get(file) !== theirs.get(file)).sort()
  if (!different.length) return console.log(`Shared files match ${sibling}`)
  console.error(`Shared files differ from ${sibling}:\n${different.map(file => `  ${file}`).join('\n')}`)
  process.exitCode = 1
}

const hashes = async root => new Map((await Promise.all(SHARED.map(entry => filesUnder(root, entry)))).flat()
  .map(({ file, body }) => [file, createHash('sha256').update(body).digest('hex')]))

const filesUnder = async (root, entry) => {
  const full = path.join(root, entry)
  const stat = await fs.stat(full).catch(() => null)
  if (!stat) return []
  if (stat.isFile()) return [{ file: entry, body: await fs.readFile(full) }]
  const names = await fs.readdir(full)
  return (await Promise.all(names.map(name => filesUnder(root, path.join(entry, name))))).flat()
}

const exists = folder => fs.stat(folder).then(() => true, () => false)

main()
