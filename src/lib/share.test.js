import { describe, it, expect } from 'vitest'
import { stripKey, SCHEMA_VERSION } from './share.js'

// design D8 不变量:分享级导出的任何路径都不得写出 apiKey。
describe('stripKey (D8 强制剥离 Key)', () => {
  it('清空 apiKey,保留其余字段', () => {
    const preset = {
      id: 'p1', name: '我的接口', baseURL: 'https://api.example.com',
      apiKey: 'sk-secret-12345', model: 'gpt-image-1', protocol: 'images',
    }
    const out = stripKey(preset)
    expect(out.apiKey).toBe('')
    expect(out.baseURL).toBe('https://api.example.com')
    expect(out.model).toBe('gpt-image-1')
    expect(out.protocol).toBe('images')
    expect(out.name).toBe('我的接口')
  })

  it('原对象不被修改(纯函数)', () => {
    const preset = { id: 'p', apiKey: 'sk-live-abc' }
    stripKey(preset)
    expect(preset.apiKey).toBe('sk-live-abc')
  })

  it('序列化后的分享内容不含原 Key 字符串', () => {
    const preset = { id: 'p', apiKey: 'sk-TOPSECRET', baseURL: 'x', model: 'm', protocol: 'chat' }
    const json = JSON.stringify(stripKey(preset))
    expect(json).not.toContain('TOPSECRET')
  })
})

describe('SCHEMA_VERSION', () => {
  it('存在且为数字', () => {
    expect(typeof SCHEMA_VERSION).toBe('number')
  })
})
