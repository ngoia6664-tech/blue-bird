import { expect, test, type Page } from '@playwright/test'
import { AlignmentType, Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx'
import { readFileSync } from 'node:fs'
import { addChapter, createWork, editor, newDevice, openChapter, signIn, synced, typeIn } from './helpers'

const acceptDialogs = (page: Page) => page.on('dialog', (d) => d.accept(d.type() === 'prompt' ? d.defaultValue() : undefined))
const findCount = (page: Page) => page.locator('.find-count')
const findBox = (page: Page) => page.getByRole('searchbox', { name: 'Tìm trong chương' })

/** Story Bible: the "Thêm …" button opens a dialog asking for the entry's name. */
async function addEntry(page: Page, kind: string, name: string) {
  await page.getByRole('button', { name: `Thêm ${kind}`, exact: true }).click()
  const dialog = page.getByRole('dialog', { name: `Thêm ${kind}` })
  await dialog.getByRole('textbox').fill(name)
  await dialog.getByRole('button', { name: `Thêm ${kind}`, exact: true }).click()
  await expect(dialog).toBeHidden()
}

async function typeBold(page: Page, text: string) {
  await page.keyboard.press('Control+b')
  await page.keyboard.type(text)
  await page.keyboard.press('Control+b')
}

test('Ctrl+F finds Vietnamese text in the chapter, highlights and steps through matches without editing', async ({ page }) => {
  await signIn(page)
  await createWork(page, `Tìm ${Date.now()}`)
  await typeIn(page, 'Megumi gặp Hare. ')
  await typeBold(page, 'Megumi')
  await page.keyboard.type(' cười. Tiếng Việt có dấu: Megumi.')
  await synced(page)
  const before = await editor(page).innerHTML()

  await page.keyboard.press('Control+f')
  await expect(findBox(page)).toBeFocused()
  await findBox(page).fill('megumi')
  await expect(findCount(page)).toHaveText('1/3')
  await expect(page.locator('.prose .find-match')).toHaveCount(3)
  await expect(page.locator('.prose .find-match.current')).toHaveCount(1)
  await findBox(page).press('Enter')
  await expect(findCount(page)).toHaveText('2/3')
  await expect(page.locator('.prose strong .find-match.current')).toHaveText('Megumi') // the bold one
  await findBox(page).press('Shift+Enter')
  await expect(findCount(page)).toHaveText('1/3')
  await findBox(page).fill('tiếng việt'.normalize('NFD'))
  await expect(findCount(page)).toHaveText('1/1')
  await findBox(page).fill('không có')
  await expect(findCount(page)).toHaveText('Không tìm thấy')
  await findBox(page).fill('')
  await expect(page.locator('.prose .find-match')).toHaveCount(0)
  await findBox(page).press('Escape')
  await expect(findBox(page)).toHaveCount(0)
  // Searching never changes the document.
  expect(await editor(page).innerHTML()).toBe(before)
  await expect(page.locator('.save-state')).toHaveText('Đã đồng bộ lên cloud')
})

test('Ctrl+H replaces one match or all, keeps bold, is undoable, and snapshots before Replace All', async ({ page }) => {
  await signIn(page)
  acceptDialogs(page)
  await createWork(page, `Thay ${Date.now()}`)
  await typeIn(page, 'Megumi một. ')
  await typeBold(page, 'Megumi')
  await page.keyboard.type(' hai. Megumi ba.')
  await synced(page)

  await page.keyboard.press('Control+h')
  await findBox(page).fill('Megumi')
  await page.getByRole('textbox', { name: 'Thay bằng' }).fill('Fushiguro')
  await findBox(page).press('Enter')
  await expect(findCount(page)).toHaveText('2/3')
  await page.getByRole('button', { name: 'Thay', exact: true }).click()
  await expect(editor(page)).toHaveText('Megumi một. Fushiguro hai. Megumi ba.')
  await expect(page.locator('.prose strong')).toHaveText('Fushiguro')
  await expect(findCount(page)).toHaveText('2/2')

  await page.getByRole('button', { name: 'Hoàn tác (Ctrl+Z)' }).click()
  await expect(editor(page)).toHaveText('Megumi một. Megumi hai. Megumi ba.')

  await page.getByRole('button', { name: 'Thay tất cả' }).click()
  await expect(editor(page)).toHaveText('Fushiguro một. Fushiguro hai. Fushiguro ba.')
  await expect(page.locator('.prose strong')).toHaveText('Fushiguro')
  await expect(findCount(page)).toHaveText('Không tìm thấy')
  await synced(page)

  // Empty replacement deletes.
  await findBox(page).fill(' hai')
  await page.getByRole('textbox', { name: 'Thay bằng' }).fill('')
  await page.getByRole('button', { name: 'Thay tất cả' }).click()
  await expect(editor(page)).toHaveText('Fushiguro một. Fushiguro. Fushiguro ba.')

  await page.getByRole('button', { name: 'Lịch sử phiên bản', exact: true }).click()
  await page.getByRole('button', { name: /Trước khi thay "Megumi"/ }).click()
  await expect(page.locator('.version-preview .prose')).toHaveText('Megumi một. Megumi hai. Megumi ba.')
})

test('work-wide search finds text in unopened chapters and jumps to the exact match', async ({ page }) => {
  await signIn(page)
  await createWork(page, `Tìm toàn bộ ${Date.now()}`)
  await typeIn(page, 'Shinobu một. Shinobu hai.')
  await addChapter(page, 'Chương 2')
  await typeIn(page, 'Không có. Shinobu ba. Shinobu bốn. Shinobu năm.')
  await synced(page)
  await openChapter(page, 'Chương 1')
  await expect(editor(page)).toHaveText('Shinobu một. Shinobu hai.')

  await page.keyboard.press('Control+Shift+F')
  const q = page.getByRole('searchbox', { name: 'Từ khóa trong toàn tác phẩm' })
  await q.fill('shinobu')
  await q.press('Enter')
  await expect(page.getByRole('status').filter({ hasText: 'Tìm thấy' })).toContainText('Tìm thấy 5 kết quả trong 2 chương.')
  await page.locator('.result-list > li', { hasText: 'Chương 2' }).locator('.result-item').nth(2).click()

  await expect(page.locator('.chapter-label-input')).toHaveValue('Chương 2')
  await expect(findCount(page)).toHaveText('3/3')
  const after = await page.locator('.prose .find-match.current').evaluate((el) => el.nextSibling?.textContent)
  expect(after?.startsWith(' năm')).toBe(true)
  // Results stay available.
  await expect(page.locator('.result-item')).toHaveCount(5)
})

test('Replace All across the work: report, snapshot per chapter, and undo that respects later edits', async ({ page }) => {
  await signIn(page)
  acceptDialogs(page)
  await createWork(page, `Thay toàn bộ ${Date.now()}`)
  await typeIn(page, 'Hare đi học.')
  await addChapter(page, 'Chương 2')
  await typeIn(page, 'Hare và Hare.')
  await addChapter(page, 'Chương 3')
  await typeIn(page, 'Không liên quan.')
  await synced(page)
  await openChapter(page, 'Chương 1')
  await synced(page)

  await page.getByRole('button', { name: 'Tìm trong tác phẩm (Ctrl+Shift+F)' }).click()
  await page.getByRole('searchbox', { name: 'Từ khóa trong toàn tác phẩm' }).fill('Hare')
  await page.getByRole('button', { name: 'Tìm', exact: true }).click()
  await page.getByRole('button', { name: 'Thay thế', exact: true }).click()
  await page.getByRole('textbox', { name: 'Thay bằng (toàn tác phẩm)' }).fill('Haru')
  await page.getByRole('button', { name: /Thay tất cả trong tác phẩm/ }).click()
  await expect(page.locator('.replace-report')).toContainText('Đã thay 3 kết quả trong 2 chương.')
  await expect(editor(page)).toHaveText('Haru đi học.') // the open chapter was reloaded
  await openChapter(page, 'Chương 2')
  await expect(editor(page)).toHaveText('Haru và Haru.')
  await expect(page.getByRole('button', { name: 'Hoàn tác lần thay thế này' })).toBeVisible()

  // Edit chapter 2 after the replace: undo must keep this edit.
  await typeIn(page, ' Sửa sau.')
  await synced(page)
  await page.getByRole('button', { name: 'Hoàn tác lần thay thế này' }).click()
  await expect(page.locator('.replace-report')).toHaveCount(0)
  await expect(editor(page)).toHaveText('Haru và Haru. Sửa sau.')
  await openChapter(page, 'Chương 1')
  await expect(editor(page)).toHaveText('Hare đi học.')
  await page.getByRole('button', { name: 'Lịch sử phiên bản', exact: true }).click()
  await expect(page.getByRole('button', { name: /Trước khi thay "Hare"/ })).toBeVisible()
})

test('a replace never overwrites a newer edit made on another device', async ({ page, browser }) => {
  await signIn(page)
  acceptDialogs(page)
  const title = `Thay xung đột ${Date.now()}`
  await createWork(page, title)
  await typeIn(page, 'Gojo một.')
  await addChapter(page, 'Chương 2')
  await typeIn(page, 'Gojo hai.')
  await synced(page)

  await page.getByRole('button', { name: 'Tìm trong tác phẩm (Ctrl+Shift+F)' }).click()
  await page.getByRole('searchbox', { name: 'Từ khóa trong toàn tác phẩm' }).fill('Gojo')
  await page.getByRole('button', { name: 'Tìm', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Tìm thấy' })).toContainText('2 kết quả')

  // The phone edits chapter 1 after the laptop scanned.
  const phone = await newDevice(browser)
  await phone.getByRole('link', { name: title }).first().click()
  await openChapter(phone, 'Chương 1')
  await typeIn(phone, ' Điện thoại.')
  await synced(phone)

  // The laptop's replace re-reads revisions, so it replaces on top of the phone's text instead of erasing it.
  await page.getByRole('button', { name: 'Thay thế', exact: true }).click()
  await page.getByRole('textbox', { name: 'Thay bằng (toàn tác phẩm)' }).fill('Satoru')
  await page.getByRole('button', { name: /Thay tất cả trong tác phẩm/ }).click()
  await expect(page.locator('.replace-report')).toContainText('trong 2 chương')
  await openChapter(page, 'Chương 1')
  await expect(editor(page)).toHaveText('Satoru một. Điện thoại.')
})

test('imports a TXT manuscript split into chapters, then exports TXT and DOCX in order', async ({ page }) => {
  await signIn(page)
  await page.getByRole('button', { name: 'Nhập tác phẩm' }).click()
  const title = `Nhập ${Date.now()}`
  await page.locator('dialog input[type=file]').setInputFiles({
    name: `${title}.txt`, mimeType: 'text/plain',
    buffer: Buffer.from('Lời tựa ngắn.\nChương 1: Khởi đầu\nMegumi đến trường.\nChương 2: Cuộc gặp\nGojo cười.\nĐoạn hai.'),
  })
  await expect(page.getByText('Chia thành 3 chương theo tiêu đề tìm thấy')).toBeVisible()
  await page.getByRole('textbox', { name: 'Tiêu đề' }).nth(2).fill('Cuộc gặp gỡ')
  await page.getByRole('button', { name: 'Nhập 3 chương' }).click()
  await expect(editor(page)).toHaveText('Lời tựa ngắn.')
  await openChapter(page, 'Chương 2')
  await expect(editor(page)).toHaveText('Gojo cười.Đoạn hai.')

  await page.getByRole('button', { name: 'Thêm thao tác cho chương' }).click()
  await page.getByRole('menuitem', { name: 'Xuất toàn tác phẩm' }).click()
  await page.getByLabel('Văn bản (.txt)').check()
  let dl = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Xuất 3 chương' }).click()
  const txt = readFileSync(await (await dl).path(), 'utf8')
  expect(txt).toBe(`${title}\n\n\nMở đầu\n\nLời tựa ngắn.\n\n\nChương 1: Khởi đầu\n\nMegumi đến trường.\n\n\nChương 2: Cuộc gặp gỡ\n\nGojo cười.\n\nĐoạn hai.\n`)

  await page.getByLabel('Word (.docx)').check()
  dl = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Xuất 3 chương' }).click()
  const file = await dl
  expect(file.suggestedFilename()).toBe(`${title}.docx`)
  const mammoth = await import('mammoth')
  const html = (await mammoth.convertToHtml({ path: await file.path() })).value
  expect(html.indexOf('Chương 1: Khởi đầu')).toBeLessThan(html.indexOf('Chương 2: Cuộc gặp gỡ'))
  expect(html).toContain('<p>Megumi đến trường.</p>')

  await page.getByLabel('Chương đang mở').check()
  await page.getByLabel('Markdown (.md)').check()
  dl = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Xuất 1 chương' }).click()
  expect(readFileSync(await (await dl).path(), 'utf8')).toBe('# Chương 2: Cuộc gặp gỡ\n\nGojo cười.\n\nĐoạn hai.\n')
})

test('imports a DOCX chapter keeping headings, bold and italic; replacing a chapter snapshots it first', async ({ page }) => {
  await signIn(page)
  acceptDialogs(page)
  await createWork(page, `DOCX ${Date.now()}`)
  await typeIn(page, 'Nội dung cũ.')
  await synced(page)
  const docx = await Packer.toBuffer(new Document({
    sections: [{ children: [
      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun('Mục một')] }),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun('Trăng '), new TextRun({ text: 'sáng', bold: true }), new TextRun(' và '), new TextRun({ text: 'gió', italics: true })] }),
    ] }],
  }))
  await page.getByRole('button', { name: 'Nhập chương từ file' }).click()
  await page.locator('dialog input[type=file]').setInputFiles({ name: 'chuong.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: docx })
  await page.getByLabel(/Thay nội dung "Chương 1"/).check()
  await page.getByRole('button', { name: 'Thay nội dung' }).click()
  await expect(page.locator('.prose h2')).toHaveText('Mục một')
  await expect(page.locator('.prose strong')).toHaveText('sáng')
  await expect(page.locator('.prose em')).toHaveText('gió')
  await synced(page)
  await page.getByRole('button', { name: 'Lịch sử phiên bản', exact: true }).click()
  await page.getByRole('button', { name: /Trước khi nhập "chuong"/ }).click()
  await expect(page.locator('.version-preview .prose')).toHaveText('Nội dung cũ.')
})

test('backup downloads a ZIP that restores as a copy without touching the original', async ({ page }) => {
  await signIn(page)
  acceptDialogs(page)
  const title = `Sao lưu ${Date.now()}`
  await createWork(page, title)
  await typeIn(page, 'Đoạn cần giữ.')
  // Not waiting for sync: the backup must still contain this text.
  await page.getByRole('link', { name: 'Cài đặt' }).click()
  const dl = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Tạo bản sao lưu' }).click()
  const zip = await (await dl).path()
  await expect(page.getByRole('status').filter({ hasText: 'Đã tạo bản sao lưu' })).toBeVisible()

  await page.locator('#backup input[type=file]').setInputFiles(zip)
  await page.getByRole('button', { name: 'Bỏ chọn tất cả' }).click()
  await page.getByRole('checkbox', { name: new RegExp(title) }).check()
  await expect(page.locator('.restore-preview li', { hasText: title })).toContainText('Đã có trong thư viện')
  await page.getByRole('button', { name: 'Khôi phục 1 tác phẩm' }).click()
  await expect(page.getByText(`Đã khôi phục “${title} (bản khôi phục)” (1 chương)`)).toBeVisible()

  await page.getByRole('link', { name: 'Thư viện', exact: true }).click()
  await page.getByRole('searchbox', { name: 'Tìm tác phẩm' }).fill(title)
  await expect(page.locator('.work-card')).toHaveCount(2)
  await page.getByRole('link', { name: `${title} (bản khôi phục)` }).first().click()
  await expect(editor(page)).toHaveText('Đoạn cần giữ.')
})

test('Story Bible: characters, relations, chapter links, timeline and style rules, kept per work', async ({ page }) => {
  await signIn(page)
  page.on('dialog', (d) => d.accept())
  await createWork(page, `Sổ tay ${Date.now()}`)
  await typeIn(page, 'Chương có Hare.')
  await page.getByRole('link', { name: 'Sổ tay truyện', exact: true }).click()

  await addEntry(page, 'nhân vật', 'Hare')
  await page.getByLabel('Vai trò').fill('Học sinh năm nhất')
  await page.getByLabel('Vai trò').blur()
  await addEntry(page, 'nhân vật', 'Megumi')
  await expect(page.getByRole('region', { name: 'Hồ sơ Megumi' })).toBeVisible() // a new item opens itself once created
  await page.getByRole('button', { name: /^Hare/ }).click()
  await expect(page.getByLabel('Vai trò')).toHaveValue('Học sinh năm nhất')
  await page.getByLabel('Quan hệ (VD: Bạn học)').fill('Bạn học')
  await page.getByLabel('Với nhân vật').selectOption({ label: 'Megumi' })
  await page.getByRole('button', { name: 'Thêm', exact: true }).click()
  await expect(page.locator('.relations')).toContainText('Hare → Bạn học → Megumi')
  await page.getByLabel('Thêm chương liên quan').selectOption({ label: 'Chương 1' })
  await expect(page.locator('.link-chips')).toContainText('Chương 1')

  await page.getByRole('tab', { name: /Dòng thời gian/ }).click()
  await addEntry(page, 'sự kiện', 'Trận chiến Shibuya')
  await page.getByLabel('Mốc thời gian trong truyện').fill('Ba ngày sau trận chiến')
  await page.getByLabel('Mốc thời gian trong truyện').blur()
  await expect(page.locator('.bible-items')).toContainText('Ba ngày sau trận chiến')

  await page.getByRole('tab', { name: 'Quy tắc văn phong' }).click()
  await page.getByLabel('Ngôi kể').fill('Ngôi thứ ba, theo Hare')
  await page.getByLabel('Cách xưng hô').fill('Hare gọi Megumi là "cậu"')
  await page.getByLabel('Cách xưng hô').blur()
  await page.reload()
  await expect(page.getByLabel('Ngôi kể')).toHaveValue('Ngôi thứ ba, theo Hare')
  await expect(page.getByLabel('Cách xưng hô')).toHaveValue('Hare gọi Megumi là "cậu"')

  // The writer's info panel lists and opens the linked entry.
  await page.getByRole('link', { name: 'Về trang viết' }).click()
  await page.locator('.link-chips').getByRole('link', { name: 'Hare' }).click()
  await expect(page.getByLabel('Vai trò')).toHaveValue('Học sinh năm nhất')

  // Another work's notebook is separate.
  await page.getByRole('link', { name: 'Thư viện', exact: true }).click()
  await createWork(page, `Sổ tay khác ${Date.now()}`)
  await page.getByRole('link', { name: 'Sổ tay truyện', exact: true }).click()
  await expect(page.getByText('Chưa có nhân vật nào.')).toBeVisible()
})

test('reading mode shows one chapter at a time with reader settings; focus mode keeps text and undo', async ({ page }) => {
  await signIn(page)
  await createWork(page, `Đọc ${Date.now()}`)
  await typeIn(page, 'Chương một để đọc.')
  await addChapter(page, 'Chương 2')
  await typeIn(page, 'Chương hai để đọc.')
  await synced(page)
  await openChapter(page, 'Chương 1')

  await page.getByRole('button', { name: 'Xem trước / Chế độ đọc' }).click()
  await expect(page.locator('.reader-prose')).toHaveText('Chương một để đọc.')
  await expect(page.locator('[contenteditable=true]')).toHaveCount(0)
  await page.getByRole('link', { name: /Chương sau/ }).click()
  await expect(page.locator('.reader-prose')).toHaveText('Chương hai để đọc.')
  await page.getByRole('button', { name: 'Tùy chỉnh đọc' }).click()
  await page.getByRole('button', { name: 'Tăng cỡ chữ' }).click()
  await expect(page.locator('.reader')).toHaveAttribute('style', /--reader-size: 20px/)
  await page.getByRole('link', { name: 'Trở lại chỉnh sửa' }).click()
  await expect(editor(page)).toHaveText('Chương hai để đọc.')

  await typeIn(page, ' Thêm.')
  await page.getByRole('button', { name: 'Tập trung viết' }).click()
  await expect(page.locator('.topbar')).toBeHidden()
  await expect(page.getByRole('complementary', { name: 'Danh sách chương' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Thoát chế độ tập trung' }).click()
  await expect(page.locator('.topbar')).toBeVisible()
  await expect(editor(page)).toHaveText('Chương hai để đọc. Thêm.')
  await page.getByRole('button', { name: 'Hoàn tác (Ctrl+Z)' }).click() // history survived: same editor
  await expect(editor(page)).not.toHaveText('Chương hai để đọc. Thêm.')
})

test('text alignment buttons apply and persist; italics render with a real italic font', async ({ page }) => {
  await signIn(page)
  await createWork(page, `Căn lề ${Date.now()}`)
  await typeIn(page, 'Giữa trang ')
  await page.keyboard.press('Control+i')
  await page.keyboard.type('nghiêng')
  await page.getByRole('button', { name: /Căn giữa/ }).click()
  await expect(page.locator('.prose p').first()).toHaveAttribute('style', /text-align: center/)
  await synced(page)
  await page.reload()
  await expect(page.locator('.prose p').first()).toHaveAttribute('style', /text-align: center/)
  const em = page.locator('.prose em')
  await expect(em).toHaveText('nghiêng')
  expect(await em.evaluate((el) => getComputedStyle(el).fontStyle)).toBe('italic')
  expect(await page.evaluate(() => document.fonts.check('italic 18px "Literata Variable"', 'nghiêng'))).toBe(true)
})

test('reloading right after typing keeps the text (unsaved-changes guard + emergency copy)', async ({ page }) => {
  await signIn(page)
  page.on('dialog', (d) => d.accept()) // "Leave site?" when edits are not on disk yet
  await createWork(page, `Tải lại ${Date.now()}`)
  await typeIn(page, 'Gõ xong tải lại ngay.')
  await page.reload()
  await expect(editor(page)).toHaveText('Gõ xong tải lại ngay.')
})

test('phone: find button, chapter drawer and Story Bible list/detail @mobile', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'phone layout only')
  await signIn(page)
  page.on('dialog', (d) => d.accept())
  await createWork(page, `Điện thoại ${Date.now()}`)
  await typeIn(page, 'Yuji chạy. Yuji cười.')
  await page.getByRole('button', { name: 'Tìm trong chương (Ctrl+F)' }).first().click()
  await findBox(page).fill('Yuji')
  await expect(findCount(page)).toHaveText('1/2')
  await page.getByRole('button', { name: 'Kết quả sau (Enter)' }).click()
  await expect(findCount(page)).toHaveText('2/2')
  await page.getByRole('button', { name: 'Danh sách chương' }).first().click()
  await expect(page.getByRole('complementary', { name: 'Danh sách chương' })).toBeVisible()
  await page.locator('.scrim').click({ position: { x: page.viewportSize()!.width - 10, y: 300 } })

  await page.getByRole('link', { name: 'Sổ tay truyện', exact: true }).click()
  await addEntry(page, 'nhân vật', 'Yuji')
  await expect(page.getByLabel('Tên chính *')).toHaveValue('Yuji')
  await page.getByRole('button', { name: 'Danh sách' }).click()
  await expect(page.getByRole('button', { name: /^Yuji/ })).toBeVisible()
})
