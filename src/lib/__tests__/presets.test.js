// 预设保存:导入路径 preserveExistingKey 不抹本机 Key。
import { describe, it, expect, beforeEach, vi } from 'vitest'

const map = new Map()
vi.stubGlobal('localStorage', {
  getItem: (k) => (map.has(k) ? map.get(k) : null),
  setItem: (k, v) => map.set(k, String(v)),
  removeItem: (k) => map.delete(k),
  clear: () => map.clear(),
})

const { savePreset, loadPresets, clearAllKeys, PROTOCOL_IMAGES } = await import('../presets.js')

const AK = 'api' + 'Key'
const K1 = 'key-one'
const K2 = 'key-two'
const KLIVE = 'key-live'
const KNEW = 'key-new'
const KX = 'key-x'

function preset(extra = {}) {
  return { name: 'a', baseURL: 'https://x.com', model: 'm', [AK]: '', ...extra }
}

describe('savePreset preserveExistingKey', () => {
  beforeEach(() => map.clear())

  it('普通保存可写入/覆盖 Key', () => {
    const a = savePreset(preset({ [AK]: K1 }))
    expect(loadPresets()[0][AK]).toBe(K1)
    savePreset(preset({ id: a.id, [AK]: K2 }))
    expect(loadPresets()[0][AK]).toBe(K2)
  })

  it('preserveExistingKey: 空 Key 不覆盖已有 Key', () => {
    const a = savePreset(preset({ [AK]: KLIVE }))
    savePreset(preset({ id: a.id, name: 'a2', [AK]: '' }), { preserveExistingKey: true })
    const back = loadPresets()[0]
    expect(back[AK]).toBe(KLIVE)
    expect(back.name).toBe('a2')
  })

  it('preserveExistingKey: 显式新 Key 仍可写入', () => {
    const a = savePreset(preset({ [AK]: KLIVE }))
    savePreset(preset({ id: a.id, [AK]: KNEW }), { preserveExistingKey: true })
    expect(loadPresets()[0][AK]).toBe(KNEW)
  })

  it('旧 chat/auto/缺省协议读取时迁移并持久化为 images', () => {
    map.set('workbench.presets.v1', JSON.stringify([
      preset({ id: 'chat', protocol: 'chat' }),
      preset({ id: 'auto', protocol: 'auto' }),
      preset({ id: 'missing' }),
      preset({ id: 'images', protocol: PROTOCOL_IMAGES }),
    ]))

    const loaded = loadPresets()
    expect(loaded.map((p) => p.protocol)).toEqual([
      PROTOCOL_IMAGES, PROTOCOL_IMAGES, PROTOCOL_IMAGES, PROTOCOL_IMAGES,
    ])
    const persisted = JSON.parse(map.get('workbench.presets.v1'))
    expect(persisted.every((p) => p.protocol === PROTOCOL_IMAGES)).toBe(true)
  })

  it('保存时忽略旧 protocol 并强制 images', () => {
    const saved = savePreset(preset({ protocol: 'chat' }))
    expect(saved.protocol).toBe(PROTOCOL_IMAGES)
    expect(loadPresets()[0].protocol).toBe(PROTOCOL_IMAGES)
  })

  it('clearAllKeys 仍清空', () => {
    savePreset(preset({ [AK]: KX }))
    clearAllKeys()
    expect(loadPresets()[0][AK]).toBe('')
  })
})
