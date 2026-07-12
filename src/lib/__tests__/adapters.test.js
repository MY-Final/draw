// 适配层四象限分派测试(mock fetch)—— 验证协议 × 参考图 选对端点。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { generate } from '../adapters.js'

// Node 无 FileReader(chat 分支 blobToDataUrl 需要);用 Blob.arrayBuffer 垫一个。
if (typeof FileReader === 'undefined') {
  global.FileReader = class {
    readAsDataURL(blob) {
      blob.arrayBuffer().then((buf) => {
        const b64 = Buffer.from(buf).toString('base64')
        this.result = `data:${blob.type || 'application/octet-stream'};base64,${b64}`
        this.onload?.()
      })
    }
  }
}

function mockFetchOnce(jsonBody) {
  return vi.fn(async () => ({
    ok: true, status: 200,
    json: async () => jsonBody,
    text: async () => JSON.stringify(jsonBody),
  }))
}

const preset = (protocol) => ({ baseURL: 'https://api.test', apiKey: 'sk-x', model: 'gpt-image-2', protocol })
const okData = { data: [{ b64_json: 'AAAA' }] }

describe('generate 四象限分派', () => {
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

  it('chat → chat/completions(JSON,image_url 块)', async () => {
    install({ choices: [{ message: { content: 'https://x/y.png' } }] })
    const blob = new Blob(['img'], { type: 'image/png' })
    await generate({ preset: preset('chat'), prompt: 'p', refImages: [{ blob, mime: 'image/png' }], params: {} })
    expect(calls[0].url).toContain('/v1/chat/completions')
    expect(typeof calls[0].opts.body).toBe('string')
    const parsed = JSON.parse(calls[0].opts.body)
    expect(parsed.messages[0].content.some((c) => c.type === 'image_url')).toBe(true)
  })
})
