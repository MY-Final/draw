import { test, expect } from '@playwright/test'

test.describe('收藏 prompt 与搜索增强', () => {
  test('收藏的 prompt 可以搜索和就地编辑', async ({ page }) => {
    await page.addInitScript(() => {
      const preset = { id: 'p_search', name: '接口', baseURL: 'https://x.invalid', apiKey: 'k', model: 'm', protocol: 'images', requestTimeoutMs: 180000 }
      localStorage.setItem('workbench.presets.v1', JSON.stringify([preset]))
      localStorage.setItem('workbench.activePresetId.v1', preset.id)
      localStorage.setItem('workbench.savedPrompts.ws_default', JSON.stringify([
        { id: 'p1', text: '雨夜霓虹街头', createdAt: 2 },
        { id: 'p2', text: '柔光猫咪', createdAt: 1 },
      ]))
    })
    await page.goto('/')
    await expect(page.locator('.boot-screen')).toBeHidden()

    await page.locator('.star-btn').click()
    const pop = page.locator('.prompt-pop')
    await expect(pop).toBeVisible()
    await expect(pop.locator('.prompt-item')).toHaveCount(2)

    // 搜索只留匹配项
    await pop.locator('.prompt-search-input').fill('猫咪')
    await expect(pop.locator('.prompt-item')).toHaveCount(1)
    await expect(pop.locator('.prompt-text')).toHaveText('柔光猫咪')
    await pop.locator('.prompt-search-input').fill('不存在的词')
    await expect(pop.locator('.prompt-empty')).toContainText('没有匹配的 prompt')
    await pop.locator('.prompt-search-clear').click()
    await expect(pop.locator('.prompt-item')).toHaveCount(2)

    // 就地编辑:改文本后回车保存,列表里立刻是新文本
    const item = pop.locator('.prompt-item').filter({ hasText: '柔光猫咪' })
    await item.getByRole('button', { name: '编辑这条 prompt' }).click()
    const editBox = pop.locator('.prompt-edit-input')
    await expect(editBox).toBeFocused()
    await editBox.fill('柔光猫咪，浅景深')
    await editBox.press('Enter')
    await expect(pop.locator('.prompt-text').filter({ hasText: '柔光猫咪，浅景深' })).toHaveCount(1)
    // 重命名后仍然只影响自己,另一条还在
    await expect(pop.locator('.prompt-item')).toHaveCount(2)
  })

  test('搜索素材结果显示缩略图', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.boot-screen')).toBeHidden()
    await page.evaluate(async () => {
      // 先把 Blob 准备好:IndexedDB 事务不能在 await 之后再拿 objectStore(会变成 inactive)。
      const canvas = document.createElement('canvas')
      canvas.width = 32
      canvas.height = 32
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#10b981'
      ctx.fillRect(0, 0, 32, 32)
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))

      await new Promise((resolve, reject) => {
        const request = indexedDB.open('ai-drawing-workbench')
        request.onerror = () => reject(request.error)
        request.onsuccess = () => {
          const db = request.result
          const tx = db.transaction(['assets', 'assetBlobs', 'generations'], 'readwrite')
          const id = 'asset_search_thumb'
          tx.objectStore('assets').put({
            id, mime: 'image/png', width: 32, height: 32, size: blob.size,
            createdAt: Date.now(), source: 'generated', favorite: false, workspaceId: 'ws_default',
          })
          tx.objectStore('assetBlobs').put({ id, blob })
          tx.objectStore('generations').put({
            id: 'gen_search_thumb', createdAt: Date.now(), prompt: '可搜索的绿色方块',
            refImageIds: [], outputImageIds: [id], status: 'success', workspaceId: 'ws_default',
            params: { conversationId: 'conv_search_thumb' },
          })
          tx.oncomplete = () => { db.close(); resolve() }
          tx.onerror = () => reject(tx.error)
        }
      })
    })
    await page.reload()
    await expect(page.locator('.boot-screen')).toBeHidden()

    await page.keyboard.press('Control+k')
    await page.locator('.search-input').fill('绿色方块')
    const result = page.locator('.result-item').filter({ hasText: '可搜索的绿色方块' }).first()
    await expect(result).toBeVisible()
    await expect(result.locator('.result-thumb img')).toBeVisible()
    await expect.poll(() => result.locator('.result-thumb img').evaluate((el) => el.naturalWidth)).toBeGreaterThan(0)
  })

  test('数据保护里说明导入策略', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.boot-screen')).toBeHidden()
    const menu = page.getByRole('button', { name: '打开菜单' })
    if (await menu.isVisible()) await menu.click()
    await page.getByRole('button', { name: '数据保护' }).click()
    const dialog = page.getByRole('dialog', { name: '数据保护' })
    await expect(dialog).toContainText('导入采用合并方式')
    await expect(dialog).toContainText('已有 API Key 保留')
  })
})