import { doc, getDocs, writeBatch, type DocumentReference } from 'firebase/firestore'
import JSZip from 'jszip'
import { loadContents, type LoadOptions } from '../data/contents'
import { bibleCol, chapterDoc, contentDoc, coverDoc, deviceId, versionsCol, workDoc, worksCol, chaptersCol } from '../data/refs'
import { getCover, deleteAll } from '../data/works'
import { listVersions } from '../data/versions'
import { db } from '../firebase'
import { utf8Bytes } from '../format'
import type { BibleItem, Chapter, ChapterContent, Version, Work } from '../types'

// Backup = everything needed to keep writing in the app, as a ZIP:
//   manifest.json                        schemaVersion, counts
//   works/{id}/work.json                 Work metadata + cover data URL
//   works/{id}/chapters.json             chapter metadata (including trashed chapters)
//   works/{id}/contents/{chapterId}.json Tiptap JSON + text (this device's unsynced drafts included)
//   works/{id}/bible.json                Story Bible entries
//   works/{id}/versions/{chapterId}.json version history (optional)

export const BACKUP_SCHEMA = 1

export interface Manifest {
  schemaVersion: number
  app: 'blue-bird'
  createdAt: number
  includesVersions: boolean
  works: { id: string; title: string; chapters: number; bible: number; deleted: boolean }[]
  /** Chapters whose text came from an unsynced draft on the device that made the backup. */
  localDrafts: number
}

interface StoredContent { json: string; text: string; local: boolean }

export async function createBackup(o: { includeVersions: boolean; getDraft: LoadOptions['getDraft']; onProgress?: (msg: string) => void }) {
  const zip = new JSZip()
  const works = (await getDocs(worksCol())).docs.map((d) => ({ ...(d.data() as Work), id: d.id }))
  const manifest: Manifest = { schemaVersion: BACKUP_SCHEMA, app: 'blue-bird', createdAt: Date.now(), includesVersions: o.includeVersions, works: [], localDrafts: 0 }
  for (const [wi, w] of works.entries()) {
    o.onProgress?.(`Tác phẩm ${wi + 1}/${works.length}: ${w.title}`)
    const dir = zip.folder(`works/${w.id}`)!
    const chapters = (await getDocs(chaptersCol(w.id))).docs.map((d) => ({ ...(d.data() as Chapter), id: d.id }))
    const { items, failed } = await loadContents(w.id, chapters, { getDraft: o.getDraft })
    // A backup that silently misses chapters is worse than no backup.
    if (failed.length) throw new Error(`Chưa tải được ${failed.length} chương của "${w.title}" (cần có mạng). Chưa tạo bản sao lưu.`)
    const bible = (await getDocs(bibleCol(w.id))).docs.map((d) => ({ ...(d.data() as BibleItem), id: d.id }))
    dir.file('work.json', JSON.stringify({ ...w, cover: w.hasCover ? await getCover(w.id) : null }))
    dir.file('chapters.json', JSON.stringify(chapters))
    dir.file('bible.json', JSON.stringify(bible))
    for (const it of items) {
      dir.file(`contents/${it.chapter.id}.json`, JSON.stringify({ json: it.json, text: it.text, local: it.local } satisfies StoredContent))
      if (it.local) manifest.localDrafts++
      if (o.includeVersions) dir.file(`versions/${it.chapter.id}.json`, JSON.stringify(await listVersions(w.id, it.chapter.id)))
    }
    manifest.works.push({ id: w.id, title: w.title, chapters: chapters.length, bible: bible.length, deleted: !!w.deletedAt })
  }
  zip.file('manifest.json', JSON.stringify(manifest, null, 2))
  o.onProgress?.('Đang nén…')
  const data = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
  return { data, manifest }
}

export interface BackupFile {
  zip: JSZip
  manifest: Manifest
}

/** Open and validate a backup file. Throws a readable error for anything else. */
export async function readBackup(data: ArrayBuffer | Uint8Array): Promise<BackupFile> {
  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(data)
  } catch {
    throw new Error('File không phải bản sao lưu (.zip) hợp lệ.')
  }
  const raw = await zip.file('manifest.json')?.async('string')
  if (!raw) throw new Error('File thiếu manifest.json: không phải bản sao lưu của ứng dụng.')
  const manifest = JSON.parse(raw) as Manifest
  if (manifest.app !== 'blue-bird' || !Array.isArray(manifest.works)) throw new Error('manifest.json không đúng định dạng.')
  if (manifest.schemaVersion > BACKUP_SCHEMA) throw new Error(`Bản sao lưu được tạo bởi phiên bản mới hơn (schema ${manifest.schemaVersion}). Hãy cập nhật ứng dụng.`)
  return { zip, manifest }
}

export type RestoreMode = 'copy' | 'missing'

export interface RestoreResult {
  restored: { title: string; workId: string; chapters: number }[]
  skipped: { title: string; reason: string }[]
  failed: { title: string; error: string }[]
}

/**
 * Never overwrites. 'copy': every work gets new ids (a duplicate of an existing work is renamed).
 * 'missing': only works whose id is not in the library, with their original ids.
 * Each work's sub-documents are written first and the work document last, so a work appears in
 * the library only when complete; on failure the partial writes are removed.
 */
export async function restoreBackup(
  file: BackupFile,
  o: { mode: RestoreMode; workIds: string[]; existingIds: Set<string>; onProgress?: (msg: string) => void },
): Promise<RestoreResult> {
  const res: RestoreResult = { restored: [], skipped: [], failed: [] }
  for (const entry of file.manifest.works.filter((w) => o.workIds.includes(w.id))) {
    const exists = o.existingIds.has(entry.id)
    if (o.mode === 'missing' && exists) {
      res.skipped.push({ title: entry.title, reason: 'Đã có trong thư viện' })
      continue
    }
    o.onProgress?.(`Đang khôi phục "${entry.title}"…`)
    const written: DocumentReference[] = []
    try {
      res.restored.push(await restoreWork(file.zip, entry.id, o.mode === 'copy', exists, written))
    } catch (e) {
      await deleteAll(written).catch(console.error)
      res.failed.push({ title: entry.title, error: e instanceof Error ? e.message : String(e) })
    }
  }
  return res
}

async function readJson<T>(zip: JSZip, path: string): Promise<T> {
  const s = await zip.file(path)?.async('string')
  if (s === undefined) throw new Error(`Bản sao lưu thiếu ${path}.`)
  return JSON.parse(s) as T
}

/** Batches split by count and size, both well under Firestore's limits. */
class Writer {
  private batch = writeBatch(db)
  private ops = 0
  private bytes = 0
  constructor(private written: DocumentReference[]) {}
  async set(ref: DocumentReference, data: object) {
    const size = utf8Bytes(JSON.stringify(data))
    if (this.ops >= 400 || this.bytes + size > 4_000_000) await this.flush()
    this.batch.set(ref, data)
    this.written.push(ref)
    this.ops++
    this.bytes += size
  }
  async flush() {
    if (this.ops) await this.batch.commit()
    this.batch = writeBatch(db)
    this.ops = this.bytes = 0
  }
}

async function restoreWork(zip: JSZip, oldId: string, newIds: boolean, exists: boolean, written: DocumentReference[]) {
  const base = `works/${oldId}/`
  const { cover, id: _id, ...work } = await readJson<Work & { cover: string | null }>(zip, base + 'work.json')
  const chapters = await readJson<Chapter[]>(zip, base + 'chapters.json')
  const bible = (await zip.file(base + 'bible.json')?.async('string').then(JSON.parse)) as BibleItem[] | undefined ?? []
  const workId = newIds ? doc(worksCol()).id : oldId
  const fresh = (col: () => DocumentReference, old: string) => (newIds ? col().id : old)
  const chapterIds = new Map(chapters.map((c) => [c.id, fresh(() => doc(chaptersCol(workId)), c.id)]))
  const bibleIds = new Map(bible.map((b) => [b.id, b.id === 'style' ? 'style' : fresh(() => doc(bibleCol(workId)), b.id)]))
  const mapIds = (ids: string[] = [], m: Map<string, string>) => ids.map((x) => m.get(x)).filter((x): x is string => !!x)

  const w = new Writer(written)
  for (const { id, ...c } of chapters) {
    const cid = chapterIds.get(id)!
    const versions = await zip.file(`${base}versions/${id}.json`)?.async('string').then((s) => JSON.parse(s) as Version[])
    // The canon marker points at a version id, which survives only when ids are kept.
    await w.set(chapterDoc(workId, cid), { ...c, canonVersionId: !newIds && versions ? c.canonVersionId ?? null : null })
    const content = await zip.file(`${base}contents/${id}.json`)?.async('string').then((s) => JSON.parse(s) as StoredContent)
    if (content) await w.set(contentDoc(workId, cid), { json: content.json, text: content.text, rev: 1, updatedAt: Date.now(), deviceId } satisfies ChapterContent)
    for (const { id: vid, ...v } of versions ?? []) await w.set(doc(versionsCol(workId, cid), newIds ? doc(versionsCol(workId, cid)).id : vid), v)
  }
  for (const { id, ...b } of bible) {
    await w.set(doc(bibleCol(workId), bibleIds.get(id)!), {
      ...b,
      links: {
        characters: mapIds(b.links?.characters, bibleIds), places: mapIds(b.links?.places, bibleIds),
        events: mapIds(b.links?.events, bibleIds), chapters: mapIds(b.links?.chapters, chapterIds),
      },
      relations: (b.relations ?? []).filter((r) => bibleIds.has(r.targetId)).map((r) => ({ ...r, targetId: bibleIds.get(r.targetId)! })),
    })
  }
  if (cover) await w.set(coverDoc(workId), { dataUrl: cover })
  await w.flush()
  // Last: the work becomes visible only now. A copy of a work still in the library is renamed.
  const title = newIds && exists ? `${work.title} (bản khôi phục)` : work.title
  const lastChapterId = work.lastChapterId ? chapterIds.get(work.lastChapterId) ?? null : null
  await w.set(workDoc(workId), { ...work, title, lastChapterId, hasCover: !!cover })
  await w.flush()
  return { title, workId, chapters: chapters.length }
}
