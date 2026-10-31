import { doc, documentId, getDocs, increment, query, runTransaction, where } from 'firebase/firestore'
import { CHAPTER_SIZE_MAX_BYTES } from '../config'
import { db } from '../firebase'
import { utf8Bytes } from '../format'
import type { Draft } from '../sync/drafts'
import type { Chapter, ChapterContent, VersionKind } from '../types'
import { chapterDoc, contentDoc, contentsCol, deviceId, versionsCol, workDoc } from './refs'

export interface LoadedChapter {
  chapter: Chapter
  json: string
  text: string
  rev: number
  /** Text comes from this device's unsynced draft, newer than the server. */
  local: boolean
}

export interface LoadOptions {
  getDraft: (workId: string, chapterId: string) => Promise<Draft | undefined>
  onProgress?: (done: number, total: number) => void
  signal?: AbortSignal
}

/**
 * Full text of many chapters, 30 per request. An unsynced draft on this device wins over the server.
 * Chapters that could not be read (offline, never cached) are returned in `failed`, never dropped.
 */
export async function loadContents(workId: string, chapters: Chapter[], o: LoadOptions) {
  const items: LoadedChapter[] = []
  const failed: Chapter[] = []
  for (let i = 0; i < chapters.length; i += 30) {
    o.signal?.throwIfAborted()
    const part = chapters.slice(i, i + 30)
    const snap = await getDocs(query(contentsCol(workId), where(documentId(), 'in', part.map((c) => c.id))))
    const server = new Map(snap.docs.map((d) => [d.id, d.data() as ChapterContent]))
    for (const chapter of part) {
      const draft = await o.getDraft(workId, chapter.id)
      const c = server.get(chapter.id)
      if (draft && !draft.synced) items.push({ chapter, json: draft.json, text: draft.text, rev: draft.baseRev, local: true })
      else if (c) items.push({ chapter, json: c.json, text: c.text, rev: c.rev, local: false })
      // No content doc: empty chapter, unless we are offline and it simply isn't cached.
      else if (snap.metadata.fromCache && chapter.wordCount > 0) failed.push(chapter)
      else items.push({ chapter, json: '', text: '', rev: 0, local: false })
    }
    o.onProgress?.(Math.min(i + 30, chapters.length), chapters.length)
  }
  return { items, failed }
}

export type RewriteResult = { ok: true; rev: number; oldJson: string } | { ok: false; reason: 'changed' | 'unchanged' }

/**
 * Rewrite a chapter on the server only if it is still at `expectRev` (compare-and-set), keeping the
 * old text as a version in the same transaction. Used by work-wide replace and its undo.
 */
export async function rewriteChapter(
  workId: string,
  chapterId: string,
  expectRev: number,
  make: (json: string) => { json: string; text: string; words: number } | null,
  snapshot: { kind: VersionKind; label: string },
): Promise<RewriteResult> {
  const cRef = contentDoc(workId, chapterId)
  const mRef = chapterDoc(workId, chapterId)
  return runTransaction(db, async (tx) => {
    const c = await tx.get(cRef)
    const m = await tx.get(mRef)
    const cur = c.data() as ChapterContent | undefined
    if (!m.exists() || (cur?.rev ?? 0) !== expectRev) return { ok: false, reason: 'changed' } as const
    const next = make(cur?.json ?? '')
    if (!next) return { ok: false, reason: 'unchanged' } as const
    if (utf8Bytes(next.json) + utf8Bytes(next.text) > CHAPTER_SIZE_MAX_BYTES) throw new Error('Chương sẽ vượt giới hạn dung lượng.')
    const now = Date.now()
    const rev = expectRev + 1
    if (cur) tx.set(doc(versionsCol(workId, chapterId)), { json: cur.json, kind: snapshot.kind, label: snapshot.label, createdAt: now })
    tx.set(cRef, { json: next.json, text: next.text, rev, updatedAt: now, deviceId } satisfies ChapterContent)
    tx.update(mRef, { wordCount: next.words, updatedAt: now })
    tx.update(workDoc(workId), { wordCount: increment(next.words - ((m.data() as Chapter).wordCount ?? 0)), updatedAt: now })
    return { ok: true, rev, oldJson: cur?.json ?? '' } as const
  })
}
