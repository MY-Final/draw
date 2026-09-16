import { test, expect } from '@playwright/test'

// 打开侧栏(移动端在抽屉里;桌面端常驻,菜单按钮不可见)。
// 用与语言无关的选择器,切换语言后仍能命中。
async function openSidebar(page) {
  const menu = page.locator('.mobile-top .mobile-icon-btn').first()
  if (await menu.isVisible()) await menu.click()
}

// 打开素材库(桌面端右栏常驻;移动端在底部抽屉里)。
async function openLibrary(page) {
  const fab = page.locator('.mobile-assets-fab')
  if (await fab.isVisible()) await fab.click()
}

// 直接往 IndexedDB 里塞一条素材(metadata + blob),用于验证 lib 层来源标签。
async function seedAsset(page, { id, source, workspaceId = 'ws_default' }) {
  await page.evaluate(async ({ id: assetId, source: src, workspaceId: ws }) => {
    await new Promise((resolve, reject) => {
      const request = indexedDB.open('ai-drawing-workbench')
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const db = request.result
        const tx = db.transaction(['assets', 'assetBlobs'], 'readwrite')
        const blob = new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' })
        tx.objectStore('assets').put({
          id: assetId, mime: 'image/png', width: 4, height: 4, size: blob.size,
          createdAt: Date.now(), source: src, workspaceId: ws, favorite: false,
        })
        tx.objectStore('assetBlobs').put({ id: assetId, blob })
        tx.oncomplete = () => { db.close(); resolve() }
        tx.onerror = () => reject(tx.error)
      }
    })
  }, { id, source, workspaceId })
}

test.describe('界面语言切换', () => {
  test('可在中/英之间切换并持久化', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.boot-screen')).toBeHidden()

    // 默认简体中文(E2E 固定 locale=zh-CN)
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN')

    await openSidebar(page)
    await expect(page.locator('.new-btn:visible')).toHaveText(/新建创作/)

    // 切到英文:html lang、文案、持久化同步
    await page.locator('.locale-toggle:visible').click()
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    await expect(page.locator('.new-btn:visible')).toHaveText(/New creation/)
    expect(await page.evaluate(() => localStorage.getItem('draw.locale'))).toBe('en')

    // 刷新后保持英文
    await page.reload()
    await expect(page.locator('.boot-screen')).toBeHidden()
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    await openSidebar(page)
    await expect(page.locator('.new-btn:visible')).toHaveText(/New creation/)

    // 再切回简体中文
    await page.locator('.locale-toggle:visible').click()
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN')
    await expect(page.locator('.new-btn:visible')).toHaveText(/新建创作/)
  })

  test('lib 层文案(素材来源)也随语言切换', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.boot-screen')).toBeHidden()

    // 切英文 + 塞一条来源为「我的上传」的素材,再刷新让语言与素材生效
    await page.evaluate(() => localStorage.setItem('draw.locale', 'en'))
    await seedAsset(page, { id: 'asset_locale_en', source: 'reference-uploaded' })
    await page.reload()
    await expect(page.locator('.boot-screen')).toBeHidden()

    await openLibrary(page)
    const badge = page.locator('.src-badge:visible').first()
    await expect(badge).toHaveText('Upload')
    await expect(badge).toHaveAttribute('title', 'My uploads')

    // 换成中文后同一标签变中文(lib 层文案来自 assetSource.js)
    await page.evaluate(() => localStorage.setItem('draw.locale', 'zh-CN'))
    await page.reload()
    await expect(page.locator('.boot-screen')).toBeHidden()
    await openLibrary(page)
    await expect(page.locator('.src-badge:visible').first()).toHaveText('上传')
    await expect(page.locator('.src-badge:visible').first()).toHaveAttribute('title', '我的上传')
  })
})
