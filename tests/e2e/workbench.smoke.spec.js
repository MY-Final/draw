import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('__e2e_keep_storage')) {
      localStorage.clear()
      indexedDB.deleteDatabase('ai-drawing-workbench')
    }
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

test('fetches and selects models from the configured endpoint', async ({ page }) => {
  await page.route('**/v1/models', async (route) => {
    expect(route.request().method()).toBe('GET')
    expect(route.request().headers().authorization).toBe('Bearer test-key')
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [{ id: 'image-alpha' }, { id: 'image-beta' }, { id: 'image-alpha' }] }),
    })
  })

  await page.goto('/')
  await expect(page.locator('.boot-screen')).toBeHidden()
  const menu = page.getByRole('button', { name: '打开菜单' })
  if (await menu.isVisible()) await menu.click()
  await page.getByRole('button', { name: '接口设置' }).click()

  const dialog = page.getByRole('dialog', { name: '添加接口' })
  await expect(dialog).toBeVisible()
  await dialog.locator('input[placeholder="https://api.example.com"]').fill('https://models.test')
  await dialog.locator('input[placeholder="sk-..."]').fill('test-key')
  await dialog.getByRole('button', { name: '获取模型', exact: true }).click()

  const picker = dialog.locator('#model-picker')
  await expect(picker).toBeVisible()
  await expect(picker.locator('.model-option')).toHaveCount(2)
  await expect(picker.locator('.model-filter')).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(picker.locator('.model-option').first()).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(picker.locator('.model-option').nth(1)).toBeFocused()
  await page.keyboard.press('ArrowUp')
  await expect(picker.locator('.model-option').first()).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(picker).toBeHidden()
  await expect(dialog.locator('input[placeholder="如:gpt-image-1 / dall-e-3"]')).toBeFocused()
  await dialog.getByRole('button', { name: '选择模型', exact: true }).click()
  await picker.locator('.model-filter').fill('beta')
  await expect(picker.locator('.model-option')).toHaveCount(1)
  await picker.locator('.model-option').click()
  await expect(dialog.locator('input[placeholder="如:gpt-image-1 / dall-e-3"]')).toHaveValue('image-beta')
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

test('data protection clears local images while keeping the workspace', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.boot-screen')).toBeHidden()
  await page.evaluate(() => localStorage.setItem('__e2e_keep_storage', '1'))

  await page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('ai-drawing-workbench')
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const db = request.result
      const tx = db.transaction(['assets', 'assetBlobs'], 'readwrite')
      tx.objectStore('assets').put({
        id: 'asset_e2e_clear', mime: 'image/png', width: 1, height: 1, size: 1,
        createdAt: Date.now(), source: 'generated', favorite: false, workspaceId: 'ws_default',
      })
      tx.objectStore('assetBlobs').put({ id: 'asset_e2e_clear', blob: new Blob(['x'], { type: 'image/png' }) })
      tx.oncomplete = () => { db.close(); resolve() }
      tx.onerror = () => reject(tx.error)
    }
  }))
  await page.reload()
  await expect(page.locator('.boot-screen')).toBeHidden()
  const menu = page.getByRole('button', { name: '打开菜单' })
  if (await menu.isVisible()) await menu.click()
  await page.getByRole('button', { name: '数据保护' }).click()

  const dialog = page.getByRole('dialog', { name: '数据保护' })
  const clearImages = dialog.getByRole('button', { name: '清空图片', exact: true })
  await expect(clearImages).toBeEnabled()
  await clearImages.click()
  const confirm = page.getByRole('alertdialog', { name: '清空本机图片' })
  await expect(confirm).toContainText('1 张图片')
  await confirm.getByRole('button', { name: '清空图片', exact: true }).click()
  await expect(clearImages).toBeDisabled()
  await expect(page.getByRole('status')).toContainText('已清理本机图片')
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
  const input = page.locator('.composer-input')
  await expect(input).toHaveAttribute('placeholder', '描述你脑海中的画面，例如：雨夜霓虹街头，毛玻璃质感…')

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
  await expect(input).toHaveAttribute('placeholder', '输入提示词，配合参考图生成新画面…')
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

test('prompt input exposes count, limit, and clear action', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.boot-screen')).toBeHidden()

  const input = page.locator('.composer-input')
  const count = page.locator('.char-count')
  await expect(count).toHaveText('0/1000')
  await input.fill('x'.repeat(1000))
  await expect(count).toHaveText('1000/1000')
  await expect(count).toHaveClass(/at-limit/)
  await input.press('End')
  await input.pressSequentially('x')
  await expect(input).toHaveValue('x'.repeat(1000))

  const clear = page.getByRole('button', { name: '清空提示词' })
  await expect(clear).toBeVisible()
  await clear.click()
  await expect(input).toHaveValue('')
  await expect(input).toBeFocused()
  await expect(count).toHaveText('0/1000')
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
