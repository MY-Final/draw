import { test, expect } from '@playwright/test'

// 造一段有生成记录的会话:必须写进 params.conversationId,否则记录不属于任何会话。
async function seedConversation(page, { conversationId, prompt, workspaceId = 'ws_default' }) {
  await page.evaluate(async ({ conversationId: convId, prompt: text, workspaceId: ws }) => {
    await new Promise((resolve, reject) => {
      const request = indexedDB.open('ai-drawing-workbench')
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const db = request.result
        const tx = db.transaction(['generations'], 'readwrite')
        tx.objectStore('generations').put({
          id: `gen_${convId}`, createdAt: Date.now(), prompt: text,
          refImageIds: [], outputImageIds: [], status: 'success', workspaceId: ws,
          params: { conversationId: convId },
        })
        tx.oncomplete = () => { db.close(); resolve() }
        tx.onerror = () => reject(tx.error)
      }
    })
  }, { conversationId, prompt, workspaceId })
}

test.describe('删除撤销与快捷键', () => {
  test('删除会话可以撤销', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('workbench.conversationId', 'conv_undo_e2e'))
    await page.goto('/')
    await expect(page.locator('.boot-screen')).toBeHidden()
    await seedConversation(page, { conversationId: 'conv_undo_e2e', prompt: '会话撤销测试' })
    await page.reload()
    await expect(page.locator('.boot-screen')).toBeHidden()

    const menu = page.getByRole('button', { name: '打开菜单' })
    if (await menu.isVisible()) await menu.click()

    const row = page.locator('.hist-row:visible').filter({ hasText: '会话撤销测试' })
    await expect(row).toBeVisible()
    await row.getByRole('button', { name: '会话操作' }).click()
    await page.locator('.conv-menu:visible').getByRole('button', { name: '删除会话' }).click()

    const dialog = page.getByRole('alertdialog', { name: '删除会话' })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: '删除', exact: true }).click()

    await expect(page.locator('.hist-row:visible').filter({ hasText: '会话撤销测试' })).toHaveCount(0)
    const toast = page.locator('.undo-toast:visible')
    await expect(toast).toContainText('已删除会话')
    await toast.locator('.undo-btn').click()
    await expect(page.locator('.hist-row:visible').filter({ hasText: '会话撤销测试' })).toBeVisible()
  })

  test('删除工作区可以撤销', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.boot-screen')).toBeHidden()

    const menu = page.getByRole('button', { name: '打开菜单' })
    if (await menu.isVisible()) await menu.click()

    // 先用 UI 新建一个工作区,再删掉它
    await page.locator('.new-ws-btn:visible').click()
    const target = page.locator('.ws-block:visible').filter({ hasText: '未命名工作区' }).first()
    await expect(target).toBeVisible()
    await target.getByRole('button', { name: '工作区操作' }).click()
    await page.locator('.ws-menu:visible').getByRole('button', { name: '删除', exact: true }).click()

    const dialog = page.getByRole('alertdialog', { name: '删除工作区' })
    await expect(dialog).toContainText('5 秒内可以撤销')
    await dialog.getByRole('button', { name: '删除', exact: true }).click()

    await expect(page.locator('.ws-block:visible').filter({ hasText: '未命名工作区' })).toHaveCount(0)
    const toast = page.locator('.undo-toast:visible')
    await expect(toast).toContainText('已删除工作区')
    await toast.locator('.undo-btn').click()
    await expect(page.locator('.ws-block:visible').filter({ hasText: '未命名工作区' }).first()).toBeVisible()
  })

  test('斜杠聚焦输入框,Alt+N 新建创作', async ({ page }, testInfo) => {
    await page.goto('/')
    await expect(page.locator('.boot-screen')).toBeHidden()

    const input = page.locator('.composer-input')
    // 先把焦点移出输入框(点一个非输入元素),再验证 / 快捷键
    await page.keyboard.press('/')
    await expect(input).toBeFocused()
    // 输入框里打 / 不应该被拦截,也不应该触发第二次聚焦
    await input.pressSequentially('/')
    await expect(input).toHaveValue('/')
    await input.fill('')
    await page.locator('.composer-foot').click()

    // Alt+N 新建创作:会话 id 会换一个
    await page.keyboard.press('Alt+n')
    const convId = await page.evaluate(() => localStorage.getItem('workbench.conversationId'))
    expect(convId).toBeTruthy()
    await expect(input).toHaveValue('')
    if (testInfo.project.name === 'mobile') {
      await expect(page.getByRole('button', { name: '打开菜单' })).toBeVisible()
    } else {
      await expect(page.locator('.hist-row.active')).toBeVisible()
    }
  })
})