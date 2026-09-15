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

test('composer follows multiline input and transient panel keyboard behavior', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.boot-screen')).toBeHidden()

  const input = page.locator('.composer-input')
  await expect(input).toHaveCSS('min-height', '80px')
  await input.fill('第一行')
  await input.press('Enter')
  await expect(input).toHaveValue('第一行\n')

  await expect(page.locator('.settings-summary')).toHaveCount(1)
  await expect(page.locator('.more-params-btn')).toHaveCount(0)

  await page.locator('.settings-summary').click()
  await expect(page.locator('#composer-params')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('#composer-params')).toBeHidden()

  await page.locator('.star-btn').click()
  await expect(page.locator('.prompt-pop')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('.prompt-pop')).toBeHidden()

  await page.locator('.preset-pick').click()
  await expect(page.locator('.preset-pop')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('.preset-pop')).toBeHidden()
})

test('failed generation restores the submitted draft', async ({ page }) => {
  await page.addInitScript(() => {
    const preset = {
      id: 'preset_e2e_failure', name: '测试接口', baseURL: 'http://127.0.0.1:1',
      apiKey: 'test-key', model: 'test-model', protocol: 'images', requestTimeoutMs: 30000,
    }
    localStorage.setItem('workbench.presets.v1', JSON.stringify([preset]))
    localStorage.setItem('workbench.activePresetId.v1', preset.id)
  })
  await page.goto('/')
  await expect(page.locator('.boot-screen')).toBeHidden()

  const input = page.locator('.composer-input')
  await input.fill('恢复这段 Prompt')
  await input.press('Control+Enter')
  await expect(input).toHaveValue('恢复这段 Prompt', { timeout: 10000 })
})

test('preset menu and global search are keyboard-completable', async ({ page }) => {
  await page.addInitScript(() => {
    const first = {
      id: 'preset_e2e_first', name: '第一个接口', baseURL: 'https://one.invalid',
      apiKey: 'key-1', model: 'model-1', protocol: 'images', requestTimeoutMs: 180000,
    }
    const second = {
      id: 'preset_e2e_second', name: '第二个接口', baseURL: 'https://two.invalid',
      apiKey: 'key-2', model: 'model-2', protocol: 'images', requestTimeoutMs: 180000,
    }
    localStorage.setItem('workbench.presets.v1', JSON.stringify([first, second]))
    localStorage.setItem('workbench.activePresetId.v1', first.id)
    localStorage.setItem('workbench.savedPrompts.ws_default', JSON.stringify([
      { id: 'prompt_e2e', text: '霓虹雨夜', createdAt: Date.now() },
    ]))
  })
  await page.goto('/')
  await expect(page.locator('.boot-screen')).toBeHidden()

  await page.locator('.preset-pick').click()
  const options = page.locator('.preset-pop-item[role="option"]')
  await expect(options).toHaveCount(2)
  await expect(options.first()).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(options.nth(1)).toBeFocused()
  await page.keyboard.press('Home')
  await expect(options.first()).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.locator('.preset-pop')).toBeHidden()

  await page.keyboard.press('Control+k')
  const search = page.locator('.search-input')
  await expect(search).toBeFocused()
  await search.fill('霓虹雨夜')
  const promptResult = page.locator('.result-item').filter({ hasText: '霓虹雨夜' })
  await expect(promptResult).toBeVisible()
  await promptResult.click()
  await expect(page.locator('.composer-input')).toHaveValue('霓虹雨夜')
  await expect(page.locator('.composer-input')).toBeFocused()
})
