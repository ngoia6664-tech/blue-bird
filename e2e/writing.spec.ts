import { expect, test, type Browser, type Page } from '@playwright/test'
import { signIn } from './helpers'

/** A second "device": separate browser context = separate IndexedDB and Firestore cache. */
async function newDevice(browser: Browser) {
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  await signIn(page)
  return page
}

async function createWork(page: Page, title: string) {
  await page.getByRole('link', { name: /Tạo tác phẩm/ }).first().click()
  await page.getByLabel('Tên tác phẩm *').fill(title)
  await page.getByRole('button', { name: 'Lưu' }).click()
  await page.getByRole('button', { name: /Thêm chương đầu tiên/ }).click()
  await expect(page.locator('.prose')).toBeVisible()
}

const editor = (page: Page) => page.locator('.prose')
const saveState = (page: Page) => page.locator('.save-state')

async function typeIn(page: Page, text: string) {
  await expect(editor(page)).toHaveAttribute('contenteditable', 'true')
  await editor(page).click()
  await page.keyboard.press('End')
  await page.keyboard.type(text)
}

test('writes Vietnamese text, autosaves, syncs and survives a reload', async ({ page }) => {
  await signIn(page)
  await createWork(page, `Truyện reload ${Date.now()}`)
  await typeIn(page, 'Đêm ấy, trăng sáng vằng vặc trên sông Hương.')
  await expect(saveState(page)).toHaveText('Đã đồng bộ lên cloud', { timeout: 15_000 })
  await expect(page.locator('.editor-foot')).toContainText('9 từ')
  await page.reload()
  await expect(editor(page)).toHaveText('Đêm ấy, trăng sáng vằng vặc trên sông Hương.')
})

test('switching chapters keeps unsynced text of each chapter', async ({ page }) => {
  await signIn(page)
  await createWork(page, `Truyện chuyển chương ${Date.now()}`)
  await typeIn(page, 'Nội dung chương một.')
  // Switch immediately, before the debounce fires.
  await page.getByRole('button', { name: 'Thêm chương', exact: true }).click()
  await expect(page.locator('.chapter-label-input')).toHaveValue('Chương 2')
  await typeIn(page, 'Nội dung chương hai.')
  await page.getByRole('button', { name: 'Chương 1', exact: true }).click()
  await expect(editor(page)).toHaveText('Nội dung chương một.')
  await page.getByRole('button', { name: 'Chương 2', exact: true }).click()
  await expect(editor(page)).toHaveText('Nội dung chương hai.')
})

test('keeps writing offline, then syncs to another device when back online', async ({ page, context, browser }) => {
  await signIn(page)
  const title = `Truyện offline ${Date.now()}`
  await createWork(page, title)
  await typeIn(page, 'Có mạng. ')
  await expect(saveState(page)).toHaveText('Đã đồng bộ lên cloud', { timeout: 15_000 })

  await context.setOffline(true)
  await typeIn(page, 'Mất mạng vẫn viết.')
  await expect(saveState(page)).toContainText('Đã lưu trên máy', { timeout: 10_000 })
  await expect(page.locator('.sync-badge')).toContainText('Ngoại tuyến')

  await context.setOffline(false)
  await expect(saveState(page)).toHaveText('Đã đồng bộ lên cloud', { timeout: 30_000 })

  const phone = await newDevice(browser)
  await phone.getByRole('link', { name: title }).first().click()
  await expect(editor(phone)).toHaveText('Có mạng. Mất mạng vẫn viết.')
})

test('two devices editing the same chapter: conflict is shown, nothing is lost', async ({ page, browser }) => {
  await signIn(page)
  const title = `Truyện xung đột ${Date.now()}`
  await createWork(page, title)
  await typeIn(page, 'Bản gốc.')
  await expect(saveState(page)).toHaveText('Đã đồng bộ lên cloud', { timeout: 15_000 })

  const phone = await newDevice(browser)
  await phone.getByRole('link', { name: title }).first().click()
  await expect(editor(phone)).toHaveText('Bản gốc.')

  await typeIn(page, ' Laptop sửa.')
  await expect(saveState(page)).toHaveText('Đã đồng bộ lên cloud', { timeout: 15_000 })
  await typeIn(phone, ' Điện thoại sửa.')

  await expect(phone.getByRole('heading', { name: /đã được sửa ở thiết bị khác/ })).toBeVisible({ timeout: 15_000 })
  await expect(phone.locator('.conflict-text').first()).toHaveText('Bản gốc. Điện thoại sửa.')
  await expect(phone.locator('.conflict-text').nth(1)).toHaveText('Bản gốc. Laptop sửa.')
  await phone.getByRole('button', { name: 'Giữ bản trên máy này' }).click()
  await expect(editor(phone)).toHaveText('Bản gốc. Điện thoại sửa.')
  await expect(saveState(phone)).toHaveText('Đã đồng bộ lên cloud', { timeout: 15_000 })

  // The laptop's text was kept as a version.
  await phone.getByRole('button', { name: 'Lịch sử phiên bản', exact: true }).click()
  await phone.getByRole('button', { name: /Bản từ thiết bị khác/ }).click()
  await expect(phone.locator('.version-preview .prose')).toHaveText('Bản gốc. Laptop sửa.')
})

test('an account that is not allowed sees no data', async ({ page }) => {
  await signIn(page, 'someone-else@gmail.com')
  await expect(page.getByRole('heading', { name: 'Không có quyền truy cập' })).toBeVisible()
})

test('trash and restore a work @mobile', async ({ page }) => {
  await signIn(page)
  const title = `Truyện thùng rác ${Date.now()}`
  await createWork(page, title)
  await page.getByRole('link', { name: 'Thư viện' }).click()
  page.on('dialog', (d) => d.accept())
  await page.getByRole('button', { name: `Thao tác cho ${title}` }).click()
  await page.getByRole('menuitem', { name: 'Đưa vào thùng rác' }).click()
  await expect(page.getByRole('heading', { name: title })).toHaveCount(0)
  await page.getByLabel('Lọc theo trạng thái').selectOption('trash')
  await page.getByRole('button', { name: `Thao tác cho ${title}` }).click()
  await page.getByRole('menuitem', { name: 'Khôi phục' }).click()
  await page.getByLabel('Lọc theo trạng thái').selectOption('all')
  await expect(page.getByRole('heading', { name: title })).toBeVisible()
})
