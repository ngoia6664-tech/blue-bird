import { collection, doc, type WriteBatch } from 'firebase/firestore'
import { auth, db } from '../firebase'

export function uid(): string {
  const u = auth.currentUser
  if (!u) throw new Error('Chưa đăng nhập.')
  return u.uid
}

export const worksCol = () => collection(db, 'users', uid(), 'works')
export const workDoc = (workId: string) => doc(worksCol(), workId)
export const coverDoc = (workId: string) => doc(db, 'users', uid(), 'covers', workId)
export const chaptersCol = (workId: string) => collection(workDoc(workId), 'chapters')
export const chapterDoc = (workId: string, chapterId: string) => doc(chaptersCol(workId), chapterId)
export const contentDoc = (workId: string, chapterId: string) =>
  doc(workDoc(workId), 'contents', chapterId)
export const contentsCol = (workId: string) => collection(workDoc(workId), 'contents')
export const versionsCol = (workId: string, chapterId: string) =>
  collection(chapterDoc(workId, chapterId), 'versions')
export const bibleCol = (workId: string) => collection(workDoc(workId), 'bible')

/**
 * Metadata writes: wait for the server when online so errors surface; offline, Firestore keeps
 * the write locally and sends it later, so don't block the UI on it.
 */
export async function commit(batch: WriteBatch): Promise<void> {
  const p = batch.commit()
  if (navigator.onLine) return p
  p.catch((e) => console.error('Ghi dữ liệu thất bại', e))
}

/** Stable per-browser id, used to tell our own saves from another device's. */
export const deviceId: string = (() => {
  const k = 'novel-studio-device'
  if (typeof localStorage === 'undefined') return crypto.randomUUID() // tests under Node
  let id = localStorage.getItem(k)
  if (!id) localStorage.setItem(k, (id = crypto.randomUUID()))
  return id
})()
