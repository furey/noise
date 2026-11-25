import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { ERROR_CODES, usableResult } from '../electron/provider/contract.mjs'

const FIXTURES = new URL('../docs/music-driver-fixtures/', import.meta.url)
const CALLS = ['search', 'stream', 'next', 'album', 'download']

const read = async (call, file) => JSON.parse(await readFile(new URL(`${call}/${file}`, FIXTURES), 'utf8'))
const casesOf = async call => [...new Set((await readdir(new URL(`${call}/`, FIXTURES))).map(file => file.split('.')[0]))]
const has = (call, file) => existsSync(new URL(`${call}/${file}`, FIXTURES))

for (const call of CALLS) {
  test(`every ${call} fixture has an input and passes the contract`, async () => {
    const cases = await casesOf(call)
    assert.ok(cases.length > 0)
    for (const name of cases) {
      assert.ok(has(call, `${name}.input.json`), `${call}/${name} needs an input file`)
      const output = has(call, `${name}.output.json`)
      const error = has(call, `${name}.error.json`)
      assert.ok(output !== error, `${call}/${name} needs an output file or an error file`)
      if (error) {
        assert.ok(ERROR_CODES.includes((await read(call, `${name}.error.json`)).code), `${call}/${name} throws a known code`)
        continue
      }
      const returned = await read(call, `${name}.output.json`)
      const expected = has(call, `${name}.app.json`) ? await read(call, `${name}.app.json`) : returned
      assert.deepEqual(usableResult[call](returned), expected, `${call}/${name}`)
    }
  })
}
