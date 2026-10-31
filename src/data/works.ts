import { deleteDoc, getDoc, getDocs, updateDoc, writeBatch, doc, type DocumentReference } from 'firebase/firestore'
import { db } from '../firebase'
import type { Work } from '../types'
import { chaptersCol, commit, contentDoc, coverDoc, versionsCol, workDoc, worksCol } from './refs'

export type WorkInput = Pick<Work, 'title' | 'aliases' | 'genre' | 'tags' | 'status' | 'description' | 'privateNote'>

/** `cover`: data URL to set, null to remove, undefined to leave unchanged. */
export async function saveWork(workId: string | null, input: WorkInput, cover: string | null | undefined) {
  const now = Date.now()
  const batch = writeBatch(db)
  const ref = workId ? workDoc(workId) : doc(worksCol())
  if (workId) {
    batch.update(ref, { ...input, updatedAt: now, ...(cover !== undefined && { hasCover: !!cover }) })
  } else {
    const work: Omit<Work, 'id'> = {
      ...input, hasCover: !!cover, chapterCount: 0, wordCount: 0, lastChapterId: null,
      createdAt: now, updatedAt: now, lastOpenedAt: now, deletedAt: null,
    }
    batch.set(ref, work)
  }
  if (cover) batch.set(coverDoc(ref.id), { dataUrl: cover })
  else if (cover === null) batch.delete(coverDoc(ref.id))
  await commit(batch)
  return ref.id
}

export async function getCover(workId: string): Promise<string | null> {
  const s = await getDoc(coverDoc(workId))
  return (s.data()?.dataUrl as string) ?? null
}

export const trashWork = (workId: string) => updateDoc(workDoc(workId), { deletedAt: Date.now() })
export const restoreWork = (workId: string) => updateDoc(workDoc(workId), { deletedAt: null })

export function touchWork(workId: string, chapterId: string) {
  updateDoc(workDoc(workId), { lastChapterId: chapterId, lastOpenedAt: Date.now() }).catch(console.error)
}

/** Permanently deletes a work with every chapter, text and version. Online only. */
export async function deleteWorkForever(workId: string) {
  const refs: DocumentReference[] = []
  for (const ch of (await getDocs(chaptersCol(workId))).docs) {
    for (const v of (await getDocs(versionsCol(workId, ch.id))).docs) refs.push(v.ref)
    refs.push(contentDoc(workId, ch.id), ch.ref)
  }
  refs.push(coverDoc(workId))
  await deleteAll(refs)
  await deleteDoc(workDoc(workId))
}

export async function deleteAll(refs: DocumentReference[]) {
  for (let i = 0; i < refs.length; i += 450) {
    const batch = writeBatch(db)
    refs.slice(i, i + 450).forEach((r) => batch.delete(r))
    await batch.commit()
  }
}
