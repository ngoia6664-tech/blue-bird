import { expect, type Browser, type Page } from '@playwright/test'

export const OWNER = 'ngoia6664@gmail.com'

export async function signIn(page: Page, email = OWNER) {
  await page.goto('/')
  await page.waitForFunction(() => '__signInForTest' in window)
  // The auth emulator can refuse the very first connection right after start-up; retry that only.
  for (let i = 0; ; i++) {
    try {
      await page.evaluate((e) => (window as unknown as { __signInForTest: (e: string) => Promise<unknown> }).__signInForTest(e), email)
      break
    } catch (e) {
      if (i >= 4 || !String(e).includes('network-request-failed')) throw e
      await page.waitForTimeout(1000)
    }
  }
  if (email === OWNER) await expect(page.getByRole('heading', { name: 'Hôm nay viết gì nào?' })).toBeVisible()
}

/** A second "device": separate browser context = separate IndexedDB and Firestore cache. */
export async function newDevice(browser: Browser) {
  const page = await (await browser.newContext()).newPage()
  await signIn(page)
  return page
}

export async function createWork(page: Page, title: string) {
  await page.getByRole('link', { name: /Tạo tác phẩm/ }).first().click()
  await page.getByLabel('Tên tác phẩm *').fill(title)
  await page.getByRole('button', { name: 'Lưu', exact: true }).click()
  await page.getByRole('button', { name: /Thêm chương đầu tiên/ }).click()
  await expect(editor(page)).toHaveAttribute('contenteditable', 'true')
}

export const editor = (page: Page) => page.locator('.prose')
export const saveState = (page: Page) => page.locator('.save-state')
export const synced = (page: Page) => expect(saveState(page)).toHaveText('Đã đồng bộ lên cloud', { timeout: 20_000 })

export async function typeIn(page: Page, text: string) {
  await expect(editor(page)).toHaveAttribute('contenteditable', 'true')
  await editor(page).click()
  await page.keyboard.press('Control+End')
  await page.keyboard.type(text)
}

export async function addChapter(page: Page, label: string) {
  await page.getByRole('button', { name: 'Thêm chương', exact: true }).click()
  await expect(page.locator('.chapter-label-input')).toHaveValue(label)
  await expect(editor(page)).toHaveAttribute('contenteditable', 'true')
}

export const openChapter = (page: Page, label: string) =>
  page.getByRole('complementary', { name: 'Danh sách chương' }).getByRole('button', { name: new RegExp(`^${label}( |$)`) }).click()
