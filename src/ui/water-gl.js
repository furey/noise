export const CURVE_STEPS = 6

export const createGlWater = ({ canvas }) => {
  const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: Boolean(navigator.webdriver) })
  if (!gl) return null
  const renderer = { gl, lost: gl.isContextLost(), vertices: new Float32Array(0), xs: new Float32Array(0), drawn: false }
  try {
    if (!renderer.lost) buildResources(renderer)
  } catch {
    return null
  }
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault()
    renderer.lost = true
  })
  canvas.addEventListener('webglcontextrestored', () => {
    buildResources(renderer)
    renderer.lost = false
  })
  return renderer
}

export const drawGlWater = ({ renderer, xs, count, dpr, height, bands, lines = [] }) => {
  const { gl } = renderer
  if (renderer.lost) return
  const columns = sampledCount(count)
  ensureCapacity(renderer, columns)
  sampleCurve({ values: xs, count, out: renderer.xs })
  begin(renderer)
  for (const band of bands) drawBand({ renderer, band, columns, count, dpr, height })
  useLines(renderer)
  for (const line of lines) drawLine({ renderer, line, columns, count, dpr })
  renderer.drawn = true
  gl.bindVertexArray(null)
}

export const clearGlWater = renderer => {
  if (renderer.lost || !renderer.drawn) return
  begin(renderer)
  renderer.drawn = false
}

export const sampleCurve = ({ values, count, out }) => {
  let at = 0
  let from = values[0]
  out[at++] = from
  for (let n = 1; n < count - 1; n++) {
    const control = values[n]
    const to = (values[n] + values[n + 1]) / 2
    for (let step = 1; step <= CURVE_STEPS; step++) {
      const t = step / CURVE_STEPS
      out[at++] = (1 - t) * (1 - t) * from + 2 * (1 - t) * t * control + t * t * to
    }
    from = to
  }
  out[at] = values[count - 1]
  return out
}

export const sampledCount = count => (count - 2) * CURVE_STEPS + 2

const begin = renderer => {
  const { gl } = renderer
  gl.viewport(0, 0, gl.canvas.width, gl.canvas.height)
  gl.clearColor(0, 0, 0, 0)
  gl.clear(gl.COLOR_BUFFER_BIT)
  gl.useProgram(renderer.program)
  gl.bindVertexArray(renderer.vao)
  gl.enable(gl.BLEND)
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
  gl.uniform2f(renderer.sizeAt, gl.canvas.width, gl.canvas.height)
}

const drawBand = ({ renderer, band, columns, count, dpr, height }) => {
  const { gl, vertices, xs, tops, bottoms } = renderer
  sampleCurve({ values: band.top, count, out: tops })
  if (band.bottom) sampleCurve({ values: band.bottom, count, out: bottoms })
  const floor = height * dpr + FLOOR_MARGIN_PX
  for (let column = 0; column < columns; column++) {
    const x = xs[column] * dpr
    const top = tops[column] * dpr
    const bottom = band.bottom ? bottoms[column] * dpr : floor
    const at = column * VERTEX_FLOATS * 2
    vertices[at] = x
    vertices[at + 1] = top - EDGE_PX
    vertices[at + 2] = top
    vertices[at + 3] = bottom
    vertices[at + 4] = x
    vertices[at + 5] = bottom + EDGE_PX
    vertices[at + 6] = top
    vertices[at + 7] = bottom
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, renderer.buffer)
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STREAM_DRAW, 0, columns * VERTEX_FLOATS * 2)
  const [r, g, b] = band.rgb
  gl.uniform4f(renderer.colourAt, r / 255, g / 255, b / 255, band.alpha)
  const fade = band.fade ?? { from: 0, to: 0, alpha: band.alpha }
  gl.uniform3f(renderer.fadeAt, fade.from * dpr, fade.to * dpr, fade.alpha)
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, columns * 2)
}

const useLines = renderer => {
  const { gl } = renderer
  gl.useProgram(renderer.lineProgram)
  gl.bindVertexArray(renderer.lineVao)
  gl.uniform2f(renderer.lineSizeAt, gl.canvas.width, gl.canvas.height)
}

const drawLine = ({ renderer, line, columns, count, dpr }) => {
  const { gl, vertices, xs, tops } = renderer
  sampleCurve({ values: line.ys, count, out: tops })
  const half = line.width * dpr / 2
  const reach = half + EDGE_PX
  for (let column = 0; column < columns; column++) {
    const before = Math.max(0, column - 1)
    const after = Math.min(columns - 1, column + 1)
    const tx = (xs[after] - xs[before]) * dpr
    const ty = (tops[after] - tops[before]) * dpr
    const length = Math.hypot(tx, ty) || 1
    const isEnd = column === 0 || column === columns - 1
    const nx = isEnd ? 0 : -ty / length
    const ny = isEnd ? 1 : tx / length
    const x = xs[column] * dpr
    const y = tops[column] * dpr
    const at = column * VERTEX_FLOATS * 2
    vertices[at] = x + nx * reach
    vertices[at + 1] = y + ny * reach
    vertices[at + 2] = reach
    vertices[at + 3] = half
    vertices[at + 4] = x - nx * reach
    vertices[at + 5] = y - ny * reach
    vertices[at + 6] = -reach
    vertices[at + 7] = half
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, renderer.lineBuffer)
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STREAM_DRAW, 0, columns * VERTEX_FLOATS * 2)
  const [r, g, b] = line.rgb
  gl.uniform4f(renderer.lineColourAt, r / 255, g / 255, b / 255, line.alpha)
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, columns * 2)
}

const ensureCapacity = (renderer, columns) => {
  if (renderer.xs.length >= columns) return
  renderer.vertices = new Float32Array(columns * VERTEX_FLOATS * 2)
  renderer.xs = new Float32Array(columns)
  renderer.tops = new Float32Array(columns)
  renderer.bottoms = new Float32Array(columns)
}

const buildResources = renderer => {
  const { gl } = renderer
  const program = link({ gl, vertex: VERTEX, fragment: FRAGMENT })
  const { vao, buffer } = vertexInput({ gl, program })
  const lineProgram = link({ gl, vertex: LINE_VERTEX, fragment: LINE_FRAGMENT })
  const line = vertexInput({ gl, program: lineProgram })
  Object.assign(renderer, {
    program, vao, buffer,
    sizeAt: gl.getUniformLocation(program, 'size'),
    colourAt: gl.getUniformLocation(program, 'colour'),
    fadeAt: gl.getUniformLocation(program, 'fade'),
    lineProgram, lineVao: line.vao, lineBuffer: line.buffer,
    lineSizeAt: gl.getUniformLocation(lineProgram, 'size'),
    lineColourAt: gl.getUniformLocation(lineProgram, 'colour'),
  })
}

const vertexInput = ({ gl, program }) => {
  const vao = gl.createVertexArray()
  gl.bindVertexArray(vao)
  const buffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(gl.ARRAY_BUFFER, MIN_BUFFER_BYTES, gl.STREAM_DRAW)
  const at = gl.getAttribLocation(program, 'point')
  gl.enableVertexAttribArray(at)
  gl.vertexAttribPointer(at, VERTEX_FLOATS, gl.FLOAT, false, 0, 0)
  gl.bindVertexArray(null)
  return { vao, buffer }
}

const link = ({ gl, vertex, fragment }) => {
  const program = gl.createProgram()
  for (const [type, source] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]]) {
    const shader = gl.createShader(type)
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader))
    gl.attachShader(program, shader)
  }
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program))
  return program
}

const VERTEX = `#version 300 es
in vec4 point;
uniform vec2 size;
out float y;
out float top;
out float bottom;
void main() {
  y = point.y;
  top = point.z;
  bottom = point.w;
  gl_Position = vec4(point.x / size.x * 2.0 - 1.0, 1.0 - point.y / size.y * 2.0, 0.0, 1.0);
}`

const FRAGMENT = `#version 300 es
precision highp float;
in float y;
in float top;
in float bottom;
uniform vec4 colour;
uniform vec3 fade;
out vec4 result;
void main() {
  float cover = clamp(min(bottom, y + 0.5) - max(top, y - 0.5), 0.0, 1.0);
  float share = fade.y > fade.x ? clamp((y - fade.x) / (fade.y - fade.x), 0.0, 1.0) : 0.0;
  float alpha = mix(colour.a, fade.z, share) * cover;
  result = vec4(colour.rgb * alpha, alpha);
}`

const LINE_VERTEX = `#version 300 es
in vec4 point;
uniform vec2 size;
out float across;
out float radius;
void main() {
  across = point.z;
  radius = point.w;
  gl_Position = vec4(point.x / size.x * 2.0 - 1.0, 1.0 - point.y / size.y * 2.0, 0.0, 1.0);
}`

const LINE_FRAGMENT = `#version 300 es
precision highp float;
in float across;
in float radius;
uniform vec4 colour;
out vec4 result;
void main() {
  float alpha = colour.a * clamp(radius - abs(across) + 0.5, 0.0, 1.0);
  result = vec4(colour.rgb * alpha, alpha);
}`

const VERTEX_FLOATS = 4
const MIN_BUFFER_BYTES = 4
const EDGE_PX = 1
const FLOOR_MARGIN_PX = 2
