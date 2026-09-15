import { test, expect } from '@playwright/test'

// 队列相关的用例都需要一个「挂着的请求」,所以单独放一个文件,避免影响其它用例的路由。
test.describe('生成队列与预览细节', () => {
  test('灵感标签点击后填入输入框', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.boot-screen')).toBeHidden()

    const chips = page.locator('.empty-inspire .chip-action')
    await expect(chips).toHaveCount(4)
    await chips.first().click()
    const input = page.locator('.composer-input')
    await expect(input).not.toHaveValue('')
    await expect(input).toBeFocused()
  })

  test('生成中提交会入队,并显示排队卡片', async ({ page }) => {
    await page.addInitScript(() => {
      const preset = {
        id: 'preset_e2e_queue', name: '队列接口', baseURL: 'https://queue.invalid',
        apiKey: 'key', model: 'model', protocol: 'images', requestTimeoutMs: 180000,
      }
      localStorage.setItem('workbench.presets.v1', JSON.stringify([preset]))
      localStorage.setItem('workbench.activePresetId.v1', preset.id)
    })
    await page.goto('/')
    await expect(page.locator('.boot-screen')).toBeHidden()
    // 先让第一个请求永远挂着,generating 保持为 true
    await page.route('**/v1/images/**', () => {})

    const input = page.locator('.composer-input')
    await input.fill('第一单')
    await input.press('Control+Enter')
    // 生成中:按钮变成取消,输入区仍然可以继续排
    await expect(page.getByRole('button', { name: '取消生成' })).toBeVisible()

    await input.fill('排队的一单')
    await input.press('Control+Enter')
    await expect(page.locator('.queue-item')).toHaveCount(1)
    await expect(page.locator('.queue-item .queue-text')).toHaveText('排队的一单')
    await expect(input).toHaveValue('')

    await input.fill('排队的二单')
    await input.press('Control+Enter')
    await expect(page.locator('.queue-item')).toHaveCount(2)

    // 可以移除其中一单
    await page.locator('.queue-item').first().getByRole('button', { name: /移除排队中的第 1 单/ }).click()
    await expect(page.locator('.queue-item')).toHaveCount(1)
    await expect(page.locator('.queue-item .queue-text')).toHaveText('排队的二单')

    // 队列满额时明确告知,而不是静默吞掉
    for (let i = 0; i < 4; i += 1) {
      await input.fill(`填充 ${i}`)
      await input.press('Control+Enter')
    }
    await expect(page.locator('.queue-item')).toHaveCount(5)
    await input.fill('溢出的一单')
    await input.press('Control+Enter')
    await expect(page.locator('.ref-notice')).toContainText('队列已满')
    await expect(page.locator('.queue-item')).toHaveCount(5)

    // 移动端素材库悬浮按钮不能压住队列的「移除」按钮:
    // 滚到底(用户查看队列时的实际位置)后,最后一条必须完全在悬浮按钮上方。
    if (test.info().project.name === 'mobile') {
      await page.locator('.feed').evaluate((el) => { el.scrollTop = el.scrollHeight })
      await expect.poll(async () => page.evaluate(() => {
        const items = document.querySelectorAll('.queue-item')
        const last = items[items.length - 1].getBoundingClientRect()
        const fab = document.querySelector('.mobile-assets-fab').getBoundingClientRect()
        return Math.round(fab.top - last.bottom)
      }), { timeout: 4000 }).toBeGreaterThan(0)
    }
  })

  test('大图预览支持缩放并展示提示词', async ({ page }) => {
    // 会话 id 必须写进 params.conversationId,否则这条记录不属于任何会话,不会出现在结果流里
    await page.addInitScript(() => localStorage.setItem('workbench.conversationId', 'conv_e2e_zoom'))
    await page.goto('/')
    await expect(page.locator('.boot-screen')).toBeHidden()
    await page.evaluate(async () => {
      await new Promise((resolve, reject) => {
        const request = indexedDB.open('ai-drawing-workbench')
        request.onerror = () => reject(request.error)
        request.onsuccess = () => {
          const db = request.result
          const tx = db.transaction(['assets', 'assetBlobs', 'generations'], 'readwrite')
          const id = 'asset_e2e_zoom'
          tx.objectStore('assets').put({
            id, mime: 'image/png', width: 1024, height: 1024, size: 4,
            createdAt: Date.now(), source: 'generated', favorite: false, workspaceId: 'ws_default',
          })
          tx.objectStore('assetBlobs').put({ id, blob: new Blob(['x'], { type: 'image/png' }) })
          tx.objectStore('generations').put({
            id: 'gen_e2e_zoom', createdAt: Date.now(), prompt: '一只戴着宇航头盔的猫',
            refImageIds: [], outputImageIds: [id], status: 'success', workspaceId: 'ws_default',
            params: { conversationId: 'conv_e2e_zoom' },
          })
          tx.oncomplete = () => { db.close(); resolve() }
          tx.onerror = () => reject(tx.error)
        }
      })
    })
    await page.reload()
    await expect(page.locator('.boot-screen')).toBeHidden()

    await page.locator('.fig-img').first().click()
    const viewer = page.getByRole('dialog', { name: '图片预览' })
    await expect(viewer).toBeVisible()
    await expect(viewer.locator('.viewer-prompt')).toContainText('宇航头盔')

    const zoomValue = viewer.locator('.zoom-value')
    await expect(zoomValue).toHaveText('100%')
    await viewer.getByRole('button', { name: '放大' }).click()
    await expect(zoomValue).toHaveText('125%')
    await viewer.getByRole('button', { name: '放大' }).click()
    await expect(zoomValue).toHaveText('150%')
    // 缩放后容器进入可拖拽状态
    await expect(viewer.locator('.viewer-img')).toHaveClass(/zoomed/)

    await zoomValue.click()
    await expect(zoomValue).toHaveText('100%')
    await expect(viewer.locator('.viewer-img')).not.toHaveClass(/zoomed/)
  })
})