import { doc, increment, runTransaction } from 'firebase/firestore'
import { AUTO_SNAPSHOT_EVERY_MS, CHAPTER_SIZE_MAX_BYTES } from '../config'
import { db } from '../firebase'
import { utf8Bytes } from '../format'
import { chapterDoc, contentDoc, deviceId, versionsCol, workDoc } from '../data/refs'
import type { Chapter, ChapterContent } from '../types'
import type { Draft } from './drafts'

export type PushResult =
  | { ok: true; rev: number; snapshot: boolean }
  | { ok: false; serverRev: number }

export class ChapterTooLargeError extends Error {}

/**
 * Write a draft only if the server is still at draft.baseRev (compare-and-set).
 * Otherwise report a conflict and write nothing: no device silently overwrites another.
 */
export async function pushDraft(d: Draft): Promise<PushResult> {
  if (utf8Bytes(d.json) + utf8Bytes(d.text) > CHAPTER_SIZE_MAX_BYTES) {
    throw new ChapterTooLargeError('Chương quá dài để lưu lên máy chủ (giới hạn ~1 MB). Hãy tách chương.')
  }
  const cRef = contentDoc(d.workId, d.chapterId)
  const mRef = chapterDoc(d.workId, d.chapterId)
  return runTransaction(db, async (tx) => {
    const c = await tx.get(cRef)
    const m = await tx.get(mRef)
    // Chapter created offline and not uploaded yet: retry later.
    if (!m.exists()) throw new Error('Chương chưa có trên máy chủ.')
    const cur = c.data() as ChapterContent | undefined
    const serverRev = cur?.rev ?? 0
    if (serverRev !== d.baseRev) {
      // An earlier push committed but the app closed before recording it.
      if (cur?.json === d.json) return { ok: true, rev: serverRev, snapshot: false }
      return { ok: false, serverRev }
    }
    const meta = m.data() as Chapter
    const now = Date.now()
    const rev = serverRev + 1
    // Snapshot the text being replaced, at most every AUTO_SNAPSHOT_EVERY_MS.
    const snapshot = !!cur && now - (meta.lastSnapshotAt ?? 0) >= AUTO_SNAPSHOT_EVERY_MS
    if (snapshot) {
      tx.set(doc(versionsCol(d.workId, d.chapterId)), { json: cur.json, kind: 'auto', label: '', createdAt: cur.updatedAt })
    }
    const content: ChapterContent = { json: d.json, text: d.text, rev, updatedAt: now, deviceId }
    tx.set(cRef, content)
    tx.update(mRef, { wordCount: d.words, updatedAt: now, ...(snapshot && { lastSnapshotAt: now }) })
    tx.update(workDoc(d.workId), { wordCount: increment(d.words - (meta.wordCount ?? 0)), updatedAt: now })
    return { ok: true, rev, snapshot }
  })
}
