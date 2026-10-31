# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: qa.spec.ts >> QA second tab refreshes chapter content when editing lock transfers
- Location: e2e\qa.spec.ts:82:1

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: locator('.prose')
Expected substring: "Bản mới đã lưu từ tab một."
Received string:    "Bản gốc. Viết tiếp ở tab hai."
Timeout: 5000ms

Call log:
  - Expect "toContainText" locator('.prose') with timeout 5000ms
  - waiting for locator('.prose')
    14 × locator resolved to <div tabindex="0" role="textbox" translate="no" spellcheck="false" contenteditable="true" aria-label="Nội dung chương" class="tiptap ProseMirror prose">…</div>
       - unexpected value "Bản gốc. Viết tiếp ở tab hai."

```

```yaml
- textbox "Nội dung chương":
  - paragraph: Bản gốc. Viết tiếp ở tab hai.
```

# Test source

```ts
  1   | import { test, expect, type Page } from '@playwright/test'
  2   | 
  3   | async function login(page: Page) {
  4   |   await page.goto('/')
  5   |   await page.waitForFunction(() => '__signInForTest' in window)
  6   |   await page.evaluate(() => (window as any).__signInForTest('ngoia6664@gmail.com'))
  7   |   await expect(page.getByRole('heading', { name: 'Hôm nay viết gì nào?' })).toBeVisible()
  8   | }
  9   | async function work(page: Page, name: string) {
  10  |   await page.getByRole('link', { name: 'Tạo tác phẩm', exact: true }).first().click()
  11  |   await page.getByLabel('Tên tác phẩm *').fill(`QA ${name} ${Date.now()}`)
  12  |   await page.getByRole('button', { name: 'Lưu', exact: true }).click()
  13  |   await page.getByRole('button', { name: 'Thêm chương đầu tiên' }).click()
  14  |   await expect(page.locator('.prose')).toHaveAttribute('contenteditable', 'true')
  15  | }
  16  | async function write(page: Page, text: string) {
  17  |   await page.locator('.prose').fill(text)
  18  |   await expect(page.locator('.save-state')).toHaveText('Đã đồng bộ', { timeout: 15000 })
  19  | }
  20  | 
  21  | test('QA validates work fields and persists metadata, alias search and status filter', async ({ page }) => {
  22  |   await login(page)
  23  |   await page.getByRole('link', { name: 'Tạo tác phẩm', exact: true }).first().click()
  24  |   await page.getByRole('button', { name: 'Lưu', exact: true }).click()
  25  |   await expect(page.getByText('Hãy nhập tên tác phẩm.')).toBeVisible()
  26  |   await page.getByLabel('Tên tác phẩm *').fill('x'.repeat(201))
  27  |   await page.getByRole('button', { name: 'Lưu', exact: true }).click()
  28  |   await expect(page.getByText('Tên tối đa 200 ký tự.')).toBeVisible()
  29  |   const name = `QA metadata ${Date.now()}`
  30  |   const alias = `Bí danh ${Date.now()}`
  31  |   await page.getByLabel('Tên tác phẩm *').fill(name)
  32  |   await page.getByLabel('Tên khác').fill(alias)
  33  |   await page.getByLabel('Mô tả').fill('Mô tả tiếng Việt có dấu')
  34  |   await page.getByLabel('Ghi chú riêng').fill('Dữ liệu thử QA')
  35  |   await page.getByRole('combobox', { name: 'Trạng thái', exact: true }).selectOption({ label: 'Tạm dừng' })
  36  |   await page.getByRole('button', { name: 'Lưu', exact: true }).click()
  37  |   await expect(page.getByRole('button', { name: 'Thêm chương đầu tiên' })).toBeVisible()
  38  |   await page.getByRole('link', { name: 'Thư viện', exact: true }).click()
  39  |   await page.getByRole('searchbox', { name: 'Tìm tác phẩm' }).fill(alias)
  40  |   await expect(page.locator('.work-card')).toHaveCount(1)
  41  |   await expect(page.locator('.work-card')).toContainText(name)
  42  |   await page.getByLabel('Lọc theo trạng thái').selectOption({ label: 'Đang viết' })
  43  |   await expect(page.locator('.work-card')).toHaveCount(0)
  44  |   await page.getByLabel('Lọc theo trạng thái').selectOption({ label: 'Tạm dừng' })
  45  |   await expect(page.locator('.work-card')).toHaveCount(1)
  46  |   await page.getByRole('button', { name: `Thao tác cho ${name}` }).click()
  47  |   await page.getByRole('menuitem', { name: 'Sửa thông tin' }).click()
  48  |   await expect(page.getByLabel('Mô tả')).toHaveValue('Mô tả tiếng Việt có dấu')
  49  |   await expect(page.getByLabel('Ghi chú riêng')).toHaveValue('Dữ liệu thử QA')
  50  | })
  51  | 
  52  | test('QA manual version restore preserves the replaced content', async ({ page }) => {
  53  |   await login(page); await work(page, 'versions')
  54  |   await write(page, 'Bản đầu tiên.')
  55  |   await page.getByRole('button', { name: 'Lịch sử phiên bản', exact: true }).click()
  56  |   page.once('dialog', d => d.accept('QA bản đầu'))
  57  |   await page.getByRole('button', { name: 'Lưu phiên bản hiện tại' }).click()
  58  |   await expect(page.getByRole('button', { name: /QA bản đầu/ })).toBeVisible()
  59  |   await write(page, 'Bản thứ hai.')
  60  |   await page.getByRole('button', { name: /QA bản đầu/ }).click()
  61  |   await expect(page.locator('.version-preview .prose')).toHaveText('Bản đầu tiên.')
  62  |   page.once('dialog', d => d.accept())
  63  |   await page.getByRole('button', { name: 'Khôi phục bản này' }).click()
  64  |   await expect(page.locator('.chapter-editor .prose')).toHaveText('Bản đầu tiên.')
  65  |   await expect(page.locator('.save-state')).toHaveText('Đã đồng bộ')
  66  |   await page.getByRole('button', { name: /Trước khi khôi phục/ }).click()
  67  |   await expect(page.locator('.version-preview .prose')).toHaveText('Bản thứ hai.')
  68  | })
  69  | 
  70  | test('QA formatting survives reload and reports no horizontal overflow @mobile', async ({ page }) => {
  71  |   await login(page); await work(page, 'format')
  72  |   await page.getByRole('button', { name: 'Đậm (Ctrl+B)', exact: true }).click()
  73  |   await page.locator('.prose').pressSequentially('Chữ đậm tiếng Việt')
  74  |   await expect(page.locator('.prose strong')).toHaveText('Chữ đậm tiếng Việt')
  75  |   await expect(page.locator('.save-state')).toHaveText('Đã đồng bộ', { timeout: 15000 })
  76  |   await page.reload()
  77  |   await expect(page.locator('.prose strong')).toHaveText('Chữ đậm tiếng Việt')
  78  |   expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  79  |   await page.screenshot({ path: test.info().outputPath('writer.png'), fullPage: true })
  80  | })
  81  | 
  82  | test('QA second tab refreshes chapter content when editing lock transfers', async ({ page, context }) => {
  83  |   await login(page); await work(page, 'tab-lock')
  84  |   await write(page, 'Bản gốc.')
  85  |   const second = await context.newPage()
  86  |   await second.goto(page.url())
  87  |   await expect(second.locator('.prose')).toHaveText('Bản gốc.')
  88  |   await expect(second.locator('.prose')).toHaveAttribute('contenteditable', 'false')
  89  |   await write(page, 'Bản mới đã lưu từ tab một.')
  90  |   await page.close()
  91  |   await expect(second.locator('.prose')).toHaveAttribute('contenteditable', 'true')
  92  |   await second.screenshot({ path: test.info().outputPath('lock-transfer.png'), fullPage: true })
  93  |   const transferred = await second.locator('.prose').innerText()
  94  |   await second.locator('.prose').press('Control+End')
  95  |   await second.locator('.prose').pressSequentially(' Viết tiếp ở tab hai.')
  96  |   await expect(second.locator('.save-state')).toHaveText('Đã đồng bộ', { timeout: 15000 })
  97  |   await second.reload()
  98  |   await test.info().attach('tab-transfer-content', { body: JSON.stringify({ transferred, persisted: await second.locator('.prose').innerText() }), contentType: 'application/json' })
> 99  |   await expect(second.locator('.prose')).toContainText('Bản mới đã lưu từ tab một.')
      |                                          ^ Error: expect(locator).toContainText(expected) failed
  100 | })
  101 | 
  102 | test('QA remote quick note is not overwritten by leaving a previously saved info panel', async ({ page, browser }) => {
  103 |   await login(page); await work(page, 'notes')
  104 |   await page.getByLabel('Ghi chú nhanh').fill('Ghi chú ban đầu từ máy một')
  105 |   await page.getByLabel('Tiêu đề chương').click()
  106 |   const ctx = await browser.newContext()
  107 |   const remote = await ctx.newPage()
  108 |   await login(remote); await remote.goto(page.url())
  109 |   await expect(remote.getByLabel('Ghi chú nhanh')).toHaveValue('Ghi chú ban đầu từ máy một')
  110 |   await remote.getByLabel('Ghi chú nhanh').fill('Ghi chú từ máy thứ hai')
  111 |   await remote.getByLabel('Tiêu đề chương').click()
  112 |   await remote.reload()
  113 |   await expect(remote.getByLabel('Ghi chú nhanh')).toHaveValue('Ghi chú từ máy thứ hai')
  114 |   await page.getByRole('button', { name: 'Lịch sử phiên bản', exact: true }).click()
  115 |   await remote.reload()
  116 |   await expect(remote.getByLabel('Ghi chú nhanh')).toHaveValue('Ghi chú từ máy thứ hai')
  117 |   await ctx.close()
  118 | })
  119 | 
  120 | test('QA cover upload replacement removal and invalid file validation', async ({ page }) => {
  121 |   await login(page)
  122 |   const name = `QA cover ${Date.now()}`
  123 |   const coverOne = await page.screenshot()
  124 |   await page.getByRole('link', { name: 'Tạo tác phẩm', exact: true }).first().click()
  125 |   await page.getByLabel('Tên tác phẩm *').fill(name)
  126 |   await page.locator('input[type=file]').setInputFiles({ name: 'invalid.txt', mimeType: 'text/plain', buffer: Buffer.from('QA invalid image') })
  127 |   await expect(page.getByRole('alert')).toContainText('không phải ảnh')
  128 |   await page.locator('input[type=file]').setInputFiles({ name: 'qa-cover.png', mimeType: 'image/png', buffer: coverOne })
  129 |   await expect(page.locator('.cover img')).toBeVisible()
  130 |   const first = await page.locator('.cover img').getAttribute('src')
  131 |   await page.getByRole('button', { name: 'Lưu', exact: true }).click()
  132 |   await expect(page.getByRole('button', { name: 'Thêm chương đầu tiên' })).toBeVisible()
  133 |   await page.getByRole('link', { name: 'Thư viện', exact: true }).click()
  134 |   await page.getByRole('button', { name: `Thao tác cho ${name}` }).click()
  135 |   await page.getByRole('menuitem', { name: 'Sửa thông tin' }).click()
  136 |   await expect(page.locator('.cover img')).toHaveAttribute('src', first!)
  137 |   const coverTwo = await page.screenshot()
  138 |   await page.locator('input[type=file]').setInputFiles({ name: 'qa-replacement.png', mimeType: 'image/png', buffer: coverTwo })
  139 |   await expect(page.locator('.cover img')).not.toHaveAttribute('src', first!)
  140 |   await page.getByRole('button', { name: 'Lưu', exact: true }).click()
  141 |   await page.getByRole('button', { name: `Thao tác cho ${name}` }).click()
  142 |   await page.getByRole('menuitem', { name: 'Sửa thông tin' }).click()
  143 |   await expect(page.locator('.cover img')).toBeVisible()
  144 |   await page.getByRole('button', { name: 'Xóa ảnh bìa' }).click()
  145 |   await page.getByRole('button', { name: 'Lưu', exact: true }).click()
  146 |   await page.getByRole('button', { name: `Thao tác cho ${name}` }).click()
  147 |   await page.getByRole('menuitem', { name: 'Sửa thông tin' }).click()
  148 |   await expect(page.locator('.cover img')).toHaveCount(0)
  149 | })
  150 | 
```