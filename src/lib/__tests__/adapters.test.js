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

  it('旧 chat/auto protocol 也强制按参考图状态走 images 端点', async () => {
    install()
    await generate({ preset: preset('chat'), prompt: '猫', refImages: [], params: {} })
    const blob = new Blob(['img'], { type: 'image/png' })
    await generate({ preset: preset('auto'), prompt: '改图', refImages: [{ blob, mime: 'image/png' }], params: {} })

    expect(calls[0].url).toContain('/v1/images/generations')
    expect(calls[1].url).toContain('/v1/images/edits')
  })

  it('images 单张参考图以 image 字段发送', async () => {
    install()
    const b1 = new Blob(['1'], { type: 'image/png' })
    await generate({ preset: preset('images'), prompt: 'p', refImages: [{ blob: b1, mime: 'image/png' }], params: {} })
    expect(calls[0].url).toContain('/v1/images/edits')
    const form = calls[0].opts.body
    expect(form.getAll('image').length).toBe(1)
    expect(form.getAll('image[]').length).toBe(0)
  })

  it('images 多张参考图全部以 image[] 字段发送', async () => {
    install()
    const b1 = new Blob(['1'], { type: 'image/png' })
    const b2 = new Blob(['2'], { type: 'image/png' })
    const b3 = new Blob(['3'], { type: 'image/jpeg' })
    await generate({
      preset: preset('images'), prompt: 'p', params: {},
      refImages: [
        { blob: b1, mime: 'image/png' },
        { blob: b2, mime: 'image/png' },
        { blob: b3, mime: 'image/jpeg' },
      ],
    })
    expect(calls[0].url).toContain('/v1/images/edits')
    const form = calls[0].opts.body
    // 全部参考图都进了 multipart,且按选择顺序编号命名
    expect(form.getAll('image').length).toBe(0)
    expect(form.getAll('image[]').length).toBe(3)
    expect(form.getAll('image[]').map((f) => f.name)).toEqual([
      'image-1.png', 'image-2.png', 'image-3.jpg',
    ])
  })
})

describe('多图响应解析(批量生成不丢图)', () => {
  let calls
  beforeEach(() => { calls = [] })
  function install(body = okData) {
    global.fetch = vi.fn(async (url, opts) => {
      calls.push({ url, opts })
      return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) }
    })
  }

  it('data[] 含 4 张 b64_json → 全部解析', async () => {
    install({ data: [
      { b64_json: 'AAAA' }, { b64_json: 'AAAB' }, { b64_json: 'AAAC' }, { b64_json: 'AAAD' },
    ] })
    const { images } = await generate({ preset: preset('images'), prompt: 'p', params: { n: 4 } })
    expect(images.length).toBe(4)
    expect(images.every((i) => i.kind === 'dataUrl')).toBe(true)
  })

  it('data[] 含 4 张 url → 全部解析', async () => {
    install({ data: [
      { url: 'https://a/1.png' }, { url: 'https://a/2.png' }, { url: 'https://a/3.png' }, { url: 'https://a/4.png' },
    ] })
    const { images } = await generate({ preset: preset('images'), prompt: 'p', params: {} })
    expect(images.length).toBe(4)
    expect(images.every((i) => i.kind === 'url')).toBe(true)
  })

  it('data: 前缀的 url 按 dataUrl 处理(不走去外链下载)', async () => {
    install({ data: [{ url: 'data:image/png;base64,AAAA' }] })
    const { images } = await generate({ preset: preset('images'), prompt: 'p', params: {} })
    expect(images[0].kind).toBe('dataUrl')
  })

  it('非标准 output[].content[].image_url 形态也能解析', async () => {
    install({ output: [{ content: [
      { image_url: { url: 'https://a/1.png' } },
      { image_url: 'data:image/png;base64,AAAB' },
    ] }] })
    const { images } = await generate({ preset: preset('images'), prompt: 'p', params: {} })
    expect(images.length).toBe(2)
    expect(images[0].kind).toBe('url')
    expect(images[1].kind).toBe('dataUrl')
  })

  it('顶层 images[] 字符串数组也能解析', async () => {
    install({ images: ['https://a/1.png', 'https://a/2.png', 'https://a/3.png'] })
    const { images } = await generate({ preset: preset('images'), prompt: 'p', params: {} })
    expect(images.length).toBe(3)
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
