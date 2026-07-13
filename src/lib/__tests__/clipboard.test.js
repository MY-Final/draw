// 剪贴板取图:files 路径与 items 路径均能取到,纯文本返回 null。
import { describe, it, expect } from 'vitest'
import { imageFromClipboard } from '../clipboard.js'

const imgFile = (name = 'a.png') => ({ type: 'image/png', name })

describe('imageFromClipboard', () => {
  it('从 files 取到图片', () => {
    const cd = { files: [imgFile()], items: [] }
    expect(imageFromClipboard(cd)).toBe(cd.files[0])
  })

  it('files 为空时从 items.getAsFile() 取图(截图/网页复制图片)', () => {
    const file = imgFile('shot.png')
    const cd = {
      files: [],
      items: [{ kind: 'file', type: 'image/png', getAsFile: () => file }],
    }
    expect(imageFromClipboard(cd)).toBe(file)
  })

  it('纯文本剪贴板返回 null', () => {
    const cd = { files: [], items: [{ kind: 'string', type: 'text/plain', getAsFile: () => null }] }
    expect(imageFromClipboard(cd)).toBeNull()
  })

  it('非图片文件不误取', () => {
    const cd = { files: [{ type: 'application/pdf', name: 'x.pdf' }], items: [] }
    expect(imageFromClipboard(cd)).toBeNull()
  })

  it('无 clipboardData 返回 null', () => {
    expect(imageFromClipboard(null)).toBeNull()
  })
})
