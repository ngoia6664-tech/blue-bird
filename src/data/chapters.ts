import { doc, getDoc, getDocs, updateDoc, writeBatch } from 'firebase/firestore'
import { db } from '../firebase'
import type { Chapter, ChapterContent } from '../types'
import { chapterDoc, chaptersCol, commit, contentDoc, deviceId, versionsCol, workDoc } from './refs'
import { deleteAll } from './works'

// Counts on the Work doc (chapterCount, wordCount) are reconciled by the Writer from the chapter list.

export async function createChapter(workId: string, label: string, order: number, title = '') {
  const ref = doc(chaptersCol(workId))
  const now = Date.now()
  const chapter: Omit<Chapter, 'id'> = {
    label, title, order, status: 'draft', note: '', wordCount: 0,
    createdAt: now, updatedAt: now, lastSnapshotAt: 0, deletedAt: null,
  }
  // No content doc yet: rev 0 means "empty, never saved".
  const batch = writeBatch(db)
  batch.set(ref, chapter)
  await commit(batch)
  return ref.id
}

export type ChapterPatch = Partial<Pick<Chapter, 'label' | 'title' | 'status' | 'note' | 'order' | 'deletedAt'>>

export function updateChapter(workId: string, chapterId: string, patch: ChapterPatch) {
  const batch = writeBatch(db)
  batch.update(chapterDoc(workId, chapterId), { ...patch, updatedAt: Date.now() })
  return commit(batch)
}

/** Swap positions of two chapters. */
export function swapOrder(workId: string, a: Chapter, b: Chapter) {
  const batch = writeBatch(db)
  batch.update(chapterDoc(workId, a.id), { order: b.order })
  batch.update(chapterDoc(workId, b.id), { order: a.order })
  return commit(batch)
}

/** Copies meta and the saved text (not unsynced local edits) right after the original. Online only. */
export async function duplicateChapter(workId: string, src: Chapter, order: number) {
  const content = (await getDoc(contentDoc(workId, src.id))).data() as ChapterContent | undefined
  const ref = doc(chaptersCol(workId))
  const now = Date.now()
  const batch = writeBatch(db)
  const { id: _id, ...meta } = src
  batch.set(ref, { ...meta, label: `${src.label} (bản sao)`, order, createdAt: now, updatedAt: now, lastSnapshotAt: 0 })
  if (content) batch.set(contentDoc(workId, ref.id), { ...content, rev: 1, updatedAt: now, deviceId })
  await batch.commit()
  return ref.id
}

export async function deleteChapterForever(workId: string, chapterId: string) {
  const versions = (await getDocs(versionsCol(workId, chapterId))).docs.map((d) => d.ref)
  await deleteAll([...versions, contentDoc(workId, chapterId)])
  await deleteAll([chapterDoc(workId, chapterId)])
}

export function reconcileWorkCounts(workId: string, chapterCount: number, wordCount: number) {
  updateDoc(workDoc(workId), { chapterCount, wordCount }).catch(console.error)
}
