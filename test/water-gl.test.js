import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CURVE_STEPS, createGlWater, sampleCurve, sampledCount } from '../src/ui/water-gl.js'

const canvasPoints = ys => {
  const points = [ys[0]]
  let from = ys[0]
  for (let n = 1; n < ys.length - 1; n++) {
    const to = (ys[n] + ys[n + 1]) / 2
    for (let step = 1; step <= CURVE_STEPS; step++) {
      const t = step / CURVE_STEPS
      points.push((1 - t) ** 2 * from + 2 * (1 - t) * t * ys[n] + t ** 2 * to)
    }
    from = to
  }
  points.push(ys.at(-1))
  return points
}

test('the sampled curve follows the same midpoint curves the canvas draws', () => {
  const ys = Float32Array.from([10, 40, 5, 60, 30, 30])
  const out = new Float32Array(sampledCount(ys.length))
  sampleCurve({ values: ys, count: ys.length, out })
  assert.equal(out.length, (ys.length - 2) * CURVE_STEPS + 2)
  canvasPoints(ys).forEach((expected, index) => assert.ok(Math.abs(out[index] - expected) < 1e-4, `point ${index}`))
})

test('the sampled curve starts and ends exactly at the end points', () => {
  const ys = Float32Array.from([3, 9, 1, 7])
  const out = sampleCurve({ values: ys, count: ys.length, out: new Float32Array(sampledCount(ys.length)) })
  assert.equal(out[0], 3)
  assert.equal(out.at(-1), 7)
})

test('without WebGL 2 the water falls back to the canvas', () => {
  assert.equal(createGlWater({ canvas: { getContext: () => null, addEventListener: () => {} } }), null)
})

test('a WebGL setup failure falls back to the canvas instead of breaking the page', () => {
  const gl = new Proxy({ isContextLost: () => false, createProgram: () => { throw new Error('no shaders') } }, {
    get: (target, name) => target[name] ?? (() => null),
  })
  assert.equal(createGlWater({ canvas: { getContext: () => gl, addEventListener: () => {} } }), null)
})
