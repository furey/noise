import { GLOW_SCALE, MAX_STRETCH, SHUTTER_S, TIERS } from './embers.js'

const FIELDS = 8
const INSTANCE_FLOATS = 8
const STREAK_FROM_PX_PER_S = 70

const VERTEX = `#version 300 es
in vec2 corner;
in vec4 place;
in vec4 look;
uniform vec2 size;
out vec2 uv;
out float alpha;
void main() {
  vec2 along = place.zw;
  vec2 across = vec2(-along.y, along.x);
  vec2 at = place.xy + along * corner.x * look.x * look.y + across * corner.y * look.x;
  gl_Position = vec4(at / size * vec2(2.0, -2.0) + vec2(-1.0, 1.0), 0.0, 1.0);
  uv = vec2((look.z + corner.x * 0.5 + 0.5) / ${TIERS}.0, corner.y * 0.5 + 0.5);
  alpha = look.w;
}`

const FRAGMENT = `#version 300 es
precision mediump float;
in vec2 uv;
in float alpha;
uniform sampler2D atlas;
uniform float glow;
out vec4 colour;
void main() {
  vec4 texel = texture(atlas, uv) * alpha;
  colour = vec4(texel.rgb, texel.a * (1.0 - glow));
}`

export const createGlEmbers = ({ canvas, capacity }) => {
  const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: Boolean(navigator.webdriver) })
  if (!gl) return null
  const renderer = { gl, instances: new Float32Array(capacity * INSTANCE_FLOATS), lost: gl.isContextLost() }
  if (!renderer.lost) buildResources(renderer)
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

const buildResources = renderer => {
  const { gl, instances } = renderer
  const program = link(gl)
  const vao = gl.createVertexArray()
  gl.bindVertexArray(vao)
  const quad = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, quad)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
  attribute({ gl, program, name: 'corner', size: 2, stride: 0, offset: 0, divisor: 0 })
  const buffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(gl.ARRAY_BUFFER, instances.byteLength, gl.DYNAMIC_DRAW)
  attribute({ gl, program, name: 'place', size: 4, stride: 32, offset: 0, divisor: 1 })
  attribute({ gl, program, name: 'look', size: 4, stride: 32, offset: 16, divisor: 1 })
  const texture = gl.createTexture()
  Object.assign(renderer, { program, vao, buffer, texture, atlas: null, sizeAt: gl.getUniformLocation(program, 'size'), glowAt: gl.getUniformLocation(program, 'glow') })
}

export const drawGlEmbers = ({ renderer, embers, atlas, dpr, glow = 0 }) => {
  const { gl, instances } = renderer
  if (renderer.lost) return
  const { data, count, clock } = embers
  let used = 0
  for (let i = 0; i < count; i++) {
    const o = i * FIELDS
    const life = data[o + 4] / data[o + 5]
    const fade = life < 0.05 ? life / 0.05 : Math.min(1, (1 - life) * 2.2)
    const alpha = fade * (1 - 0.3 * (0.5 + 0.5 * Math.sin(clock * (19 + data[o + 6] * 7) + i * 2.4)))
    if (alpha < 0.012) continue
    const vx = data[o + 2]
    const vy = data[o + 3]
    const speed = Math.sqrt(vx * vx + vy * vy)
    const at = used * INSTANCE_FLOATS
    instances[at] = data[o] * dpr
    instances[at + 1] = data[o + 1] * dpr
    instances[at + 2] = speed > 1 ? vx / speed : 1
    instances[at + 3] = speed > 1 ? vy / speed : 0
    instances[at + 4] = data[o + 6] * GLOW_SCALE * (1 - life * 0.35) * dpr
    instances[at + 5] = Math.min(MAX_STRETCH, 1 + Math.max(0, speed - STREAK_FROM_PX_PER_S) * SHUTTER_S / (data[o + 6] * 1.6))
    instances[at + 6] = Math.min(TIERS - 1, Math.floor(Math.pow(life, 0.8) * TIERS))
    instances[at + 7] = alpha
    used += 1
  }
  gl.viewport(0, 0, gl.canvas.width, gl.canvas.height)
  gl.clearColor(0, 0, 0, 0)
  gl.clear(gl.COLOR_BUFFER_BIT)
  if (!used) return
  gl.useProgram(renderer.program)
  gl.bindVertexArray(renderer.vao)
  if (renderer.atlas !== atlas) uploadAtlas(renderer, atlas)
  gl.uniform2f(renderer.sizeAt, gl.canvas.width, gl.canvas.height)
  gl.enable(gl.BLEND)
  gl.uniform1f(renderer.glowAt, glow)
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
  gl.bindBuffer(gl.ARRAY_BUFFER, renderer.buffer)
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, instances, 0, used * INSTANCE_FLOATS)
  gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, used)
}

const uploadAtlas = (renderer, atlas) => {
  const { gl, texture } = renderer
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  renderer.atlas = atlas
}

const attribute = ({ gl, program, name, size, stride, offset, divisor }) => {
  const at = gl.getAttribLocation(program, name)
  gl.enableVertexAttribArray(at)
  gl.vertexAttribPointer(at, size, gl.FLOAT, false, stride, offset)
  gl.vertexAttribDivisor(at, divisor)
}

const link = gl => {
  const program = gl.createProgram()
  for (const [type, source] of [[gl.VERTEX_SHADER, VERTEX], [gl.FRAGMENT_SHADER, FRAGMENT]]) {
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
