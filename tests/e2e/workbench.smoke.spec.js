import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear()
    indexedDB.deleteDatabase('ai-drawing-workbench')
  })
})

test('workbench initializes and exposes keyboard semantics', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.boot-screen')).toBeHidden()
  const menu = page.getByRole('button', { name: '打开菜单' })
  if (await menu.isVisible()) await menu.click()
  await expect(page.locator('.rail .logo-text:visible, .mobile-title:visible')).toBeVisible()
  await expect(page.getByRole('button', { name: '新建创作' })).toBeVisible()
  await expect(page.getByRole('button', { name: /我的工作区工作区/ })).toHaveAttribute('aria-expanded', 'true')
})

test('settings dialog closes with Escape and restores focus', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.boot-screen')).toBeHidden()
  const menu = page.getByRole('button', { name: '打开菜单' })
  const mobile = await menu.isVisible()
  if (mobile) await menu.click()
  const settings = page.getByRole('button', { name: '接口设置' })
  await settings.click()
  await expect(page.getByRole('dialog', { name: /添加接口|接口设置/ })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: /添加接口|接口设置/ })).toBeHidden()
  await expect(mobile ? menu : settings).toBeFocused()
})

test('mobile drawers close with Escape and restore focus', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'mobile drawers only')
  await page.goto('/')
  await expect(page.locator('.boot-screen')).toBeHidden()

  const menu = page.getByRole('button', { name: '打开菜单' })
  await menu.click()
  await expect(page.getByRole('dialog', { name: '导航' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: '导航' })).toBeHidden()
  await expect(menu).toBeFocused()

  const assets = page.getByRole('button', { name: '打开素材库' })
  await assets.click()
  await expect(page.getByRole('dialog', { name: '素材库' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: '素材库' })).toBeHidden()
  await expect(assets).toBeFocused()
})

test('mobile composer and asset entry remain separate', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'mobile layout only')
  await page.goto('/')
  await expect(page.locator('.boot-screen')).toBeHidden()
  await expect(page.getByRole('button', { name: '打开菜单' })).toBeVisible()
  const composer = page.locator('.dock')
  const assets = page.getByRole('button', { name: '打开素材库' })
  await expect(assets).toBeVisible()
  const composerBox = await composer.boundingBox()
  const assetsBox = await assets.boundingBox()
  expect(composerBox).not.toBeNull()
  expect(assetsBox).not.toBeNull()
  expect(assetsBox.y + assetsBox.height).toBeLessThanOrEqual(composerBox.y + 4)
})

test('pasted reference image renders in the composer', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.boot-screen')).toBeHidden()

  await page.evaluate(async () => {
    const canvas = document.createElement('canvas')
    canvas.width = 24
    canvas.height = 16
    const context = canvas.getContext('2d')
    context.fillStyle = '#ff4f8b'
    context.fillRect(0, 0, canvas.width, canvas.height)
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
    const file = new File([blob], 'pasted-reference.png', { type: 'image/png' })
    const data = new DataTransfer()
    data.items.add(file)
    document.dispatchEvent(new ClipboardEvent('paste', {
      clipboardData: data,
      bubbles: true,
      cancelable: true,
    }))
  })

  const image = page.locator('.ref-thumb img').first()
  await expect(image).toBeVisible()
  await expect.poll(() => image.evaluate((element) => element.naturalWidth)).toBeGreaterThan(0)
  const thumb = page.locator('.ref-thumb').first()
  await expect.poll(async () => (await thumb.boundingBox())?.width || 0).toBeGreaterThanOrEqual(64)
  await expect(image).toHaveCSS('object-fit', 'contain')
  await expect(page.locator('.ref-badge').first()).toHaveCSS('min-height', '0px')
})
