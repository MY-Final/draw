import { describe, it, expect } from 'vitest'
import { extractImagesFromChatResponse } from '../imageExtractor.js'

const PNG_DATA_URI = 'data:image/png;base64,iVBORw0KGgoAAAANSU'

function chat(message) {
  return { choices: [{ message }] }
}

describe('extractImagesFromChatResponse', () => {
  it('提取 image_url 内容块(OpenAI 视觉格式)', () => {
    const resp = chat({
      content: [
        { type: 'text', text: '这是你要的图' },
        { type: 'image_url', image_url: { url: 'https://cdn.example.com/a.png' } },
      ],
    })
    const { images } = extractImagesFromChatResponse(resp)
    expect(images).toEqual([{ kind: 'url', value: 'https://cdn.example.com/a.png' }])
  })

  it('提取 markdown 图片语法(http URL)', () => {
    const resp = chat({ content: '好的:![result](https://img.example.com/x.jpg)' })
    const { images } = extractImagesFromChatResponse(resp)
    expect(images).toEqual([{ kind: 'url', value: 'https://img.example.com/x.jpg' }])
  })

  it('提取 markdown 里的 data URI', () => {
    const resp = chat({ content: `画好了 ![x](${PNG_DATA_URI})` })
    const { images } = extractImagesFromChatResponse(resp)
    expect(images).toEqual([{ kind: 'dataUrl', value: PNG_DATA_URI }])
  })

  it('提取裸露的 data URI(不在 markdown 内)', () => {
    const resp = chat({ content: `结果如下\n${PNG_DATA_URI}\n完成` })
    const { images } = extractImagesFromChatResponse(resp)
    expect(images).toEqual([{ kind: 'dataUrl', value: PNG_DATA_URI }])
  })

  it('提取 message.images[] 私有扩展(字符串)', () => {
    const resp = chat({ content: '', images: ['https://cdn.example.com/b.webp'] })
    const { images } = extractImagesFromChatResponse(resp)
    expect(images).toEqual([{ kind: 'url', value: 'https://cdn.example.com/b.webp' }])
  })

  it('提取 message.images[] 私有扩展(对象 b64_json)', () => {
    const resp = chat({ content: '', images: [{ b64_json: 'AAAA' }] })
    const { images } = extractImagesFromChatResponse(resp)
    expect(images).toEqual([{ kind: 'dataUrl', value: 'data:image/png;base64,AAAA' }])
  })

  it('提取裸露的 http(s) 图片 URL 一行文本', () => {
    const resp = chat({ content: 'https://files.example.com/out.png?sig=abc123' })
    const { images } = extractImagesFromChatResponse(resp)
    expect(images).toEqual([
      { kind: 'url', value: 'https://files.example.com/out.png?sig=abc123' },
    ])
  })

  it('顶层 data[] 兜底(images 风格塞进 chat 响应)', () => {
    const resp = { choices: [{ message: { content: '' } }], data: [{ url: 'https://x/y.png' }] }
    const { images } = extractImagesFromChatResponse(resp)
    expect(images).toEqual([{ kind: 'url', value: 'https://x/y.png' }])
  })

  it('去重:同一 URL 多处出现只保留一次', () => {
    const url = 'https://cdn.example.com/dup.png'
    const resp = chat({
      content: `![a](${url}) 又贴一次 ${url}`,
      images: [url],
    })
    const { images } = extractImagesFromChatResponse(resp)
    expect(images).toEqual([{ kind: 'url', value: url }])
  })

  it('多张图:markdown + image_url 同时存在', () => {
    const resp = chat({
      content: [
        { type: 'text', text: '两张:![one](https://x/1.png)' },
        { type: 'image_url', image_url: { url: 'https://x/2.png' } },
      ],
    })
    const { images } = extractImagesFromChatResponse(resp)
    expect(images.map((i) => i.value)).toEqual(['https://x/1.png', 'https://x/2.png'])
  })

  it('无法提取:纯文本响应 → images 为空且保留 snippet', () => {
    const resp = chat({ content: '抱歉,我无法生成图片。' })
    const { images, snippet } = extractImagesFromChatResponse(resp)
    expect(images).toEqual([])
    expect(snippet).toContain('抱歉')
  })

  it('无法提取:空响应 → images 为空', () => {
    const { images } = extractImagesFromChatResponse({})
    expect(images).toEqual([])
  })
})
