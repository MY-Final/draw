import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('__e2e_keep_storage')) {
      localStorage.clear()
      indexedDB.deleteDatabase('ai-drawing-workbench')
    }
  })
})

async function pasteReference(page, color = '#ff4f8b', expectedCount = 1) {
  await page.evaluate(async (fill) => {
    const canvas = document.createElement('canvas')
    canvas.width = 24
    canvas.height = 16
    const context = canvas.getContext('2d')
    context.fillStyle = fill
    context.fillRect(0, 0, canvas.width, canvas.height)
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
    const file = new File([blob], `pasted-${fill.slice(1)}.png`, { type: 'image/png' })
    const data = new DataTransfer()
    data.items.add(file)
    document.dispatchEvent(new ClipboardEvent('paste', {
      clipboardData: data,
      bubbles: true,
      cancelable: true,
    }))
  }, color)
  await expect.poll(() => page.locator('.ref-thumb').count()).toBe(expectedCount)
}

async function seedAssets(page, count = 1, withReference = false) {
  await page.evaluate(() => localStorage.setItem('__e2e_keep_storage', '1'))
  await page.evaluate(async ({ count: assetCount, withReference: referenced }) => {
    await new Promise((resolve, reject) => {
      const request = indexedDB.open('ai-drawing-workbench')
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const db = request.result
        const tx = db.transaction(['assets', 'assetBlobs', 'generations'], 'readwrite')
        const ids = []
        for (let i = 0; i < assetCount; i += 1) {
          const id = `asset_e2e_delete_${i}`
          ids.push(id)
          tx.objectStore('assets').put({
            id, mime: 'image/png', width: 1, height: 1, size: 1,
            createdAt: Date.now() + i, source: 'reference-uploaded', favorite: false, workspaceId: 'ws_default',
          })
          tx.objectStore('assetBlobs').put({ id, blob: new Blob(['x'], { type: 'image/png' }) })
        }
        if (referenced) {
          tx.objectStore('generations').put({
            id: 'gen_e2e_asset_reference', createdAt: Date.now(), prompt: '引用测试',
            refImageIds: [ids[0]], outputImageIds: [], params: {}, status: 'success', workspaceId: 'ws_default',
          })
        }
        tx.oncomplete = () => { db.close(); resolve() }
        tx.onerror = () => reject(tx.error)
      }
    })
  }, { count, withReference })
}

async function openLibrary(page) {
  const openButton = page.getByRole('button', { name: '打开素材库' })
  if (await openButton.isVisible()) {
    await openButton.click()
    return page.getByRole('dialog', { name: '素材库' })
  }
  return page.locator('.assets-body')
}

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
  await expect(page.locator('.toast.toast-ok')).toContainText('已清理本机图片')
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

test('generate button exposes the missing interface reason', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.boot-screen')).toBeHidden()

  const button = page.getByRole('button', { name: '生成图片' })
  const reason = page.locator('#generate-disabled-reason')
  await expect(button).toBeDisabled()
  await expect(reason).toHaveText('请先添加接口')
  await expect(button).toHaveAttribute('aria-describedby', 'generate-disabled-reason')
  await expect(button).toHaveAttribute('title', '请先添加接口')
})

test('generate button prioritizes API Key and prompt reasons', async ({ page }) => {
  await page.addInitScript(() => {
    const hasKey = localStorage.getItem('__e2e_reason_ready') === '1'
    const preset = {
      id: 'preset_e2e_reason', name: '禁用原因测试', baseURL: 'https://example.invalid',
      apiKey: hasKey ? 'test-key' : '', model: 'image-model', protocol: 'images', requestTimeoutMs: 180000,
    }
    localStorage.setItem('workbench.presets.v1', JSON.stringify([preset]))
    localStorage.setItem('workbench.activePresetId.v1', preset.id)
  })
  await page.goto('/')
  await expect(page.locator('.boot-screen')).toBeHidden()

  const button = page.getByRole('button', { name: '生成图片' })
  const reason = page.locator('#generate-disabled-reason')
  await expect(reason).toHaveText('请先填写 API Key')
  await expect(button).toHaveAttribute('title', '请先填写 API Key')

  await page.evaluate(() => {
    localStorage.setItem('__e2e_keep_storage', '1')
    localStorage.setItem('__e2e_reason_ready', '1')
  })
  await page.reload()
  await expect(page.locator('.boot-screen')).toBeHidden()
  await expect(page.locator('#generate-disabled-reason')).toHaveText('请输入提示词')
  await expect(page.getByRole('button', { name: '生成图片' })).toHaveAttribute('title', '请输入提示词')
})

test('reference images can be reordered with keyboard while retaining focus', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.boot-screen')).toBeHidden()
  await pasteReference(page, '#ff4f8b', 1)
  await pasteReference(page, '#3b82f6', 2)
  await pasteReference(page, '#10b981', 3)

  const items = page.locator('.ref-thumb')
  await expect(items).toHaveCount(3)
  await items.nth(1).focus()
  await page.keyboard.press('ArrowLeft')
  await expect(items.nth(0)).toBeFocused()
  await expect(items.nth(0)).toHaveAttribute('aria-label', /第 1 张参考图/)
  await expect(page.locator('.sr-only')).toHaveText('已将第 2 张参考图移到第 1 位')

  await page.keyboard.press('End')
  await expect(items.nth(2)).toBeFocused()
  await expect(items.nth(2)).toHaveAttribute('aria-label', /第 3 张参考图/)
  await expect(page.locator('.sr-only')).toHaveText('已将第 1 张参考图移到第 3 位')
  await page.keyboard.press('Home')
  await expect(items.nth(0)).toBeFocused()
  await expect(page.locator('.sr-only')).toHaveText('已将第 3 张参考图移到第 1 位')
})

test('single asset deletion is immediate in UI and undo restores it', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.boot-screen')).toBeHidden()
  await seedAssets(page)
  await page.reload()
  await expect(page.locator('.boot-screen')).toBeHidden()

  const library = await openLibrary(page)
  const cell = library.locator('.cell')
  await expect(cell).toHaveCount(1)
  await cell.locator('button[aria-label="删除素材（可撤销）"]').click()
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  await expect(cell).toHaveCount(0)
  const undoToast = page.locator('.undo-toast:visible')
  await expect(undoToast).toContainText('已移除 1 张素材')
  await undoToast.locator('.undo-btn').click()
  await expect(cell).toHaveCount(1)
})

test('batch asset deletion keeps confirmation and supports undo', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.boot-screen')).toBeHidden()
  await seedAssets(page, 2)
  await page.reload()
  await expect(page.locator('.boot-screen')).toBeHidden()

  const library = await openLibrary(page)
  const cells = library.locator('.cell')
  await expect(cells).toHaveCount(2)
  await cells.nth(0).locator('button[aria-label="选择"]').click()
  await cells.nth(1).locator('button[aria-label="选择"]').click()
  await library.locator('.lib-head .btn-danger').click()
  const dialog = page.getByRole('alertdialog', { name: '删除素材' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: '删除', exact: true }).click()
  await expect(cells).toHaveCount(0)
  const undoToast = page.locator('.undo-toast:visible')
  await expect(undoToast).toContainText('已移除 2 张素材')
  await undoToast.locator('.undo-btn').click()
  await expect(cells).toHaveCount(2)
})

test('referenced asset displays why it cannot be deleted', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.boot-screen')).toBeHidden()
  await seedAssets(page, 1, true)
  await page.reload()
  await expect(page.locator('.boot-screen')).toBeHidden()

  const library = await openLibrary(page)
  const cell = library.locator('.cell')
  await expect(cell.locator('.asset-reference-note')).toHaveText('已引用')
  const deleteButton = cell.locator('button[aria-label*="被生成记录引用"]')
  await expect(deleteButton).toBeDisabled()
  await expect(deleteButton).toHaveAttribute('title', '该素材被生成记录引用，无法删除')
})

test('mobile reference images stay in one horizontal scroller', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'mobile layout only')
  await page.goto('/')
  await expect(page.locator('.boot-screen')).toBeHidden()
  const before = await page.locator('.composer').boundingBox()
  const colors = ['#ff4f8b', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6']
  for (const [index, color] of colors.entries()) {
    await pasteReference(page, color, index + 1)
  }

  const strip = page.locator('.ref-items')
  await expect(strip).toHaveCSS('flex-wrap', 'nowrap')
  await expect(strip).toHaveCSS('overflow-x', 'auto')
  const scrollMetrics = await strip.evaluate((el) => ({ width: el.clientWidth, scrollWidth: el.scrollWidth }))
  expect(scrollMetrics.scrollWidth).toBeGreaterThan(scrollMetrics.width)
  const after = await page.locator('.composer').boundingBox()
  expect(after.height - before.height).toBeLessThan(130)
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
