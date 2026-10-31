import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth'
import { getDoc, getDocs } from 'firebase/firestore'
import JSZip from 'jszip'
import { beforeAll, describe, expect, it } from 'vitest'
import { createBackup, readBackup, restoreBackup } from '../src/backup/backup'
import { createBibleItem, updateBibleItem } from '../src/data/bible'
import { createChapter } from '../src/data/chapters'
import { rewriteChapter } from '../src/data/contents'
import { bibleCol, chaptersCol, contentDoc, workDoc, worksCol } from '../src/data/refs'
import { addVersion, listVersions } from '../src/data/versions'
import { deleteWorkForever, getCover, saveWork } from '../src/data/works'
import { toContent, txtToNodes } from '../src/doc/convert'
import { auth } from '../src/firebase'
import { replaceInJson } from '../src/search/doc'
import type { Draft } from '../src/sync/drafts'
import type { BibleItem, Chapter, ChapterContent, Work } from '../src/types'

Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true })
const noDrafts = async () => undefined

const signIn = (sub: string) =>
  signInWithCredential(auth, GoogleAuthProvider.credential(JSON.stringify({ sub, email: 'ngoia6664@gmail.com', email_verified: true })))

const COVER = 'data:image/png;base64,iVBORw0KGgo='
const input = { title: 'Chú chim xanh', aliases: [], genre: 'Fanfic', tags: ['a'], status: 'writing' as const, description: 'Mô tả', privateNote: '' }

async function seed(chapters = 3) {
  const workId = await saveWork(null, input, COVER)
  const ids: string[] = []
  for (let i = 1; i <= chapters; i++) ids.push(await createChapter(workId, `Chương ${i}`, i, `Tên ${i}`, toContent(txtToNodes(`Megumi đi học ${i}.\nĐoạn hai của chương ${i}.`))))
  const hare = await createBibleItem(workId, 'character', 'Hare', 1)
  const megumi = await createBibleItem(workId, 'character', 'Megumi', 2)
  await updateBibleItem(workId, hare, { relations: [{ targetId: megumi, label: 'Bạn học' }], links: { characters: [], places: [], events: [], chapters: [ids[0]] } })
  await addVersion(workId, ids[0], '{"type":"doc"}', 'manual', 'Bản cũ')
  return { workId, ids, hare, megumi }
}

const unzip = async (data: Uint8Array) => readBackup(data)

describe('backup and restore (Firestore emulator)', () => {
  beforeAll(() => signIn('backup-source'))

  it('backs up works with cover, chapters, text, Story Bible and versions, and restores them after the work was deleted', async () => {
    const { workId } = await seed(3)
    const { data, manifest } = await createBackup({ includeVersions: true, getDraft: noDrafts })
    const entry = manifest.works.find((w) => w.id === workId)!
    expect(entry).toMatchObject({ title: 'Chú chim xanh', chapters: 3, bible: 2 })

    // Lose the work completely, then bring it back from the file.
    await deleteWorkForever(workId)
    expect((await getDoc(workDoc(workId))).exists()).toBe(false)
    const file = await unzip(data)
    const existingIds = new Set((await getDocs(worksCol())).docs.map((d) => d.id))
    const r = await restoreBackup(file, { mode: 'missing', workIds: [workId], existingIds })
    expect(r.failed).toEqual([])
    expect(r.restored).toHaveLength(1)

    const work = (await getDoc(workDoc(workId))).data() as Work
    expect(work).toMatchObject({ title: 'Chú chim xanh', description: 'Mô tả', hasCover: true })
    expect(await getCover(workId)).toBe(COVER)
    const chapters = (await getDocs(chaptersCol(workId))).docs.map((d) => ({ ...(d.data() as Chapter), id: d.id })).sort((a, b) => a.order - b.order)
    expect(chapters.map((c) => [c.label, c.title])).toEqual([['Chương 1', 'Tên 1'], ['Chương 2', 'Tên 2'], ['Chương 3', 'Tên 3']])
    const c1 = (await getDoc(contentDoc(workId, chapters[0].id))).data() as ChapterContent
    expect(c1.text).toBe('Megumi đi học 1.\nĐoạn hai của chương 1.')
    expect((await listVersions(workId, chapters[0].id)).map((v) => v.label)).toEqual(['Bản cũ'])
    const bible = (await getDocs(bibleCol(workId))).docs.map((d) => ({ ...(d.data() as BibleItem), id: d.id }))
    const hare = bible.find((b) => b.name === 'Hare')!
    expect(hare.relations[0].targetId).toBe(bible.find((b) => b.name === 'Megumi')!.id)
    expect(hare.links.chapters).toEqual([chapters[0].id])
  })

  it('copy mode never overwrites: a work already in the library comes back as a renamed copy with new ids', async () => {
    const { workId, ids } = await seed(2)
    const { data } = await createBackup({ includeVersions: false, getDraft: noDrafts })
    const file = await unzip(data)
    const r = await restoreBackup(file, { mode: 'copy', workIds: [workId], existingIds: new Set([workId]) })
    const copy = r.restored[0]
    expect(copy.workId).not.toBe(workId)
    expect(copy.title).toBe('Chú chim xanh (bản khôi phục)')
    const copied = (await getDocs(chaptersCol(copy.workId))).docs.map((d) => d.id)
    expect(copied).toHaveLength(2)
    expect(copied.some((id) => ids.includes(id))).toBe(false)
    // Original untouched.
    expect(((await getDoc(workDoc(workId))).data() as Work).title).toBe('Chú chim xanh')
    // 'missing' mode skips it.
    const skip = await restoreBackup(file, { mode: 'missing', workIds: [workId], existingIds: new Set([workId]) })
    expect(skip.skipped).toHaveLength(1)
  })

  it('includes text that only exists in an unsynced draft on this device', async () => {
    const { workId, ids } = await seed(1)
    const draft: Draft = { workId, chapterId: ids[0], json: toContent(txtToNodes('Bản nháp chưa đồng bộ')).json, text: 'Bản nháp chưa đồng bộ', words: 4, baseRev: 1, savedAt: 1, synced: false, conflict: false }
    const { data, manifest } = await createBackup({ includeVersions: false, getDraft: async (_w, c) => (c === ids[0] ? draft : undefined) })
    expect(manifest.localDrafts).toBeGreaterThanOrEqual(1)
    const zip = await JSZip.loadAsync(data)
    expect(JSON.parse(await zip.file(`works/${workId}/contents/${ids[0]}.json`)!.async('string'))).toMatchObject({ text: 'Bản nháp chưa đồng bộ', local: true })
  })

  it('rejects files that are not backups, or from a newer schema', async () => {
    await expect(readBackup(new Uint8Array([1, 2, 3]))).rejects.toThrow(/không phải bản sao lưu/)
    const z = new JSZip()
    z.file('manifest.json', JSON.stringify({ app: 'blue-bird', schemaVersion: 99, works: [] }))
    await expect(readBackup(await z.generateAsync({ type: 'uint8array' }))).rejects.toThrow(/phiên bản mới hơn/)
  })

  it('a broken work in the backup is reported and leaves nothing behind', async () => {
    const { workId } = await seed(1)
    const { data } = await createBackup({ includeVersions: false, getDraft: noDrafts })
    const zip = await JSZip.loadAsync(data)
    zip.remove(`works/${workId}/work.json`)
    const file = await readBackup(await zip.generateAsync({ type: 'uint8array' }))
    const before = (await getDocs(worksCol())).size
    const r = await restoreBackup(file, { mode: 'copy', workIds: [workId], existingIds: new Set([workId]) })
    expect(r.failed[0].error).toMatch(/thiếu/)
    expect((await getDocs(worksCol())).size).toBe(before)
  })
})

describe('rewriteChapter (work-wide replace)', () => {
  beforeAll(() => signIn('backup-source'))

  it('replaces with a snapshot, and refuses when the chapter changed since the scan', async () => {
    const { workId, ids } = await seed(1)
    const opts = { caseSensitive: false, wholeWord: false }
    const make = (json: string) => {
      const r = replaceInJson(json, 'Megumi', 'Fushiguro Megumi', opts)
      return r.count ? r : null
    }
    const r = await rewriteChapter(workId, ids[0], 1, make, { kind: 'pre-replace', label: 'Trước khi thay' })
    expect(r).toMatchObject({ ok: true, rev: 2 })
    const c = (await getDoc(contentDoc(workId, ids[0]))).data() as ChapterContent
    expect(c.text).toBe('Fushiguro Megumi đi học 1.\nĐoạn hai của chương 1.')
    expect((await listVersions(workId, ids[0])).map((v) => v.kind)).toContain('pre-replace')
    // Stale scan (rev 1) must not overwrite rev 2.
    expect(await rewriteChapter(workId, ids[0], 1, make, { kind: 'pre-replace', label: '' })).toEqual({ ok: false, reason: 'changed' })
    // Undo with a revision check.
    if (!r.ok) throw new Error()
    const undo = await rewriteChapter(workId, ids[0], 2, () => toContent([]) && { json: r.oldJson, text: 'x', words: 1 }, { kind: 'pre-restore', label: '' })
    expect(undo).toMatchObject({ ok: true, rev: 3 })
    expect(((await getDoc(contentDoc(workId, ids[0]))).data() as ChapterContent).json).toBe(r.oldJson)
  })
})
