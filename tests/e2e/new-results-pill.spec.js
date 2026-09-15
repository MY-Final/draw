import { test, expect } from '@playwright/test'

// 造一段够长的对话,让结果流真的可以滚动。
async function seedLongConversation(page, count = 8, conversationId = 'conv_scroll') {
  await page.evaluate(async ({ count: n, conversationId: convId }) => {
    await new Promise((resolve, reject) => {
      const request = indexedDB.open('ai-drawing-workbench')
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const db = request.result
        const tx = db.transaction(['generations'], 'readwrite')
        for (let i = 0; i < n; i += 1) {
          tx.objectStore('generations').put({
            id: `gen_scroll_${i}`, createdAt: Date.now() - i * 1000,
            prompt: `历史提示词 ${i}`, refImageIds: [], outputImageIds: [],
            status: 'success', workspaceId: 'ws_default',
            params: { conversationId: convId },
          })
        }
        tx.oncomplete = () => { db.close(); resolve() }
        tx.onerror = () => reject(tx.error)
      }
    })
  }, { count, conversationId })
}

test.describe('结果流的新结果提示', () => {
  test('上翻看历史时,新结果用浮标提示而不是抢夺滚动', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', '滚动行为只在桌面端验证,移动端手势不同')
    await page.addInitScript(() => {
      const preset = { id: 'p_scroll', name: '接口', baseURL: 'https://scroll.invalid', apiKey: 'k', model: 'm', protocol: 'images', requestTimeoutMs: 180000 }
      localStorage.setItem('workbench.presets.v1', JSON.stringify([preset]))
      localStorage.setItem('workbench.activePresetId.v1', preset.id)
      localStorage.setItem('workbench.conversationId', 'conv_scroll')
    })
    await page.goto('/')
    await expect(page.locator('.boot-screen')).toBeHidden()
    await seedLongConversation(page, 8)
    await page.reload()
    await expect(page.locator('.boot-screen')).toBeHidden()
    await page.route('**/v1/images/**', () => { /* 挂着,保持 pending,不影响浮标断言 */ })

    const feed = page.locator('.feed')
    const scrollable = await feed.evaluate((el) => el.scrollHeight > el.clientHeight)
    expect(scrollable).toBe(true)

    // 上翻到顶:此时不应该有浮标。
    // 先等首次进入时的 smooth scroll 跑完,否则它会和我设置的 scrollTop 打架。
    await page.waitForTimeout(600)
    await feed.evaluate((el) => { el.scrollTop = 0 })
    await expect.poll(() => feed.evaluate((el) => el.scrollTop)).toBeLessThan(5)
    await expect(page.locator('.new-results')).toHaveCount(0)

    // 期间来一单新的(乐观上屏,立刻出现在结果流末尾)
    const input = page.locator('.composer-input')
    await input.fill('上翻时提交的一单')
    await input.press('Control+Enter')

    const pill = page.locator('.new-results')
    await expect(pill).toBeVisible()
    await expect(pill).toContainText('条新结果')
    // 不抢滚动:仍然停在顶部
    expect(await feed.evaluate((el) => el.scrollTop)).toBeLessThan(80)

    await pill.click()
    await expect(page.locator('.new-results')).toHaveCount(0)
    // 点浮标是平滑滚动,给它一点时间到底
    await expect.poll(
      () => feed.evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight),
      { timeout: 4000 },
    ).toBeLessThan(60)
  })
})