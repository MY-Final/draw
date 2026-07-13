// 适配层分派测试(mock fetch)—— 验证是否带参考图选对 images 端点(generations / edits)。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { generate } from '../adapters.js'

const preset = (protocol = 'images') => ({ baseURL: 'https://api.test', apiKey: 'sk-x', model: 'gpt-image-2', protocol })
const okData = { data: [{ b64_json: 'AAAA' }] }

describe('generate 端点分派', () => {
  let calls
  beforeEach(() => { calls = [] })

  function install(body = okData) {
    global.fetch = vi.fn(async (url, opts) => {
      calls.push({ url, opts })
      return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) }
    })
  }

  it('images 无参考图 → images/generations(JSON)', async () => {
    install()
    await generate({ preset: preset('images'), prompt: '猫', refImages: [], params: {} })
    expect(calls[0].url).toContain('/v1/images/generations')
    expect(typeof calls[0].opts.body).toBe('string') // JSON
  })

  it('images 带参考图 → images/edits(multipart FormData)', async () => {
    install()
    const blob = new Blob(['img'], { type: 'image/png' })
    await generate({ preset: preset('images'), prompt: '改成黄昏', refImages: [{ blob, mime: 'image/png' }], params: {} })
    expect(calls[0].url).toContain('/v1/images/edits')
    expect(calls[0].opts.body instanceof FormData).toBe(true)
    // FormData 不应手动设 Content-Type
    expect(calls[0].opts.headers['Content-Type']).toBeUndefined()
  })

  it('images 多张参考图仅取第一张发 edits', async () => {
    install()
    const b1 = new Blob(['1'], { type: 'image/png' })
    const b2 = new Blob(['2'], { type: 'image/png' })
    await generate({ preset: preset('images'), prompt: 'p', refImages: [{ blob: b1, mime: 'image/png' }, { blob: b2, mime: 'image/png' }], params: {} })
    expect(calls[0].url).toContain('/v1/images/edits')
    const form = calls[0].opts.body
    // 只 append 了一个 image 字段
    expect(form.getAll('image').length).toBe(1)
  })
})

describe('图像端点参数:b64 / quality / size', () => {
  let calls
  beforeEach(() => { calls = [] })
  function install(body = okData) {
    global.fetch = vi.fn(async (url, opts) => {
      calls.push({ url, opts })
      return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) }
    })
  }

  it('generations 默认不发 response_format(部分中转站不认 b64_json)', async () => {
    install()
    await generate({ preset: preset('images'), prompt: '猫', refImages: [], params: {} })
    const parsed = JSON.parse(calls[0].opts.body)
    expect('response_format' in parsed).toBe(false)
  })

  it('generations 显式指定 responseFormat 时才发送', async () => {
    install()
    await generate({ preset: preset('images'), prompt: '猫', refImages: [], params: { responseFormat: 'b64_json' } })
    const parsed = JSON.parse(calls[0].opts.body)
    expect(parsed.response_format).toBe('b64_json')
  })

  it('generations 发送 quality,Auto 时不发 size', async () => {
    install()
    await generate({ preset: preset('images'), prompt: '猫', refImages: [], params: { quality: 'high' } })
    const parsed = JSON.parse(calls[0].opts.body)
    expect(parsed.quality).toBe('high')
    expect('size' in parsed).toBe(false)
  })

  it('generations 有 size 时发送 size', async () => {
    install()
    await generate({ preset: preset('images'), prompt: '猫', refImages: [], params: { size: '2048x2048' } })
    const parsed = JSON.parse(calls[0].opts.body)
    expect(parsed.size).toBe('2048x2048')
  })

  it('edits(带参考图)默认带 b64_json 并发送 quality', async () => {
    install()
    const blob = new Blob(['img'], { type: 'image/png' })
    await generate({ preset: preset('images'), prompt: 'p', refImages: [{ blob, mime: 'image/png' }], params: { quality: 'medium', size: '1024x1024' } })
    const form = calls[0].opts.body
    expect(form.get('response_format')).toBe('b64_json')
    expect(form.get('quality')).toBe('medium')
    expect(form.get('size')).toBe('1024x1024')
  })

  it('edits Auto 时不发 size', async () => {
    install()
    const blob = new Blob(['img'], { type: 'image/png' })
    await generate({ preset: preset('images'), prompt: 'p', refImages: [{ blob, mime: 'image/png' }], params: {} })
    const form = calls[0].opts.body
    expect(form.get('size')).toBeNull()
  })
})
