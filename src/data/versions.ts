import { doc, getCountFromServer, getDocs, limit, orderBy, query, setDoc, where } from 'firebase/firestore'
import { AUTO_SNAPSHOTS_KEPT } from '../config'
import type { Version, VersionKind } from '../types'
import { versionsCol } from './refs'
import { deleteAll } from './works'

/**
 * Online: resolves once the server has the version. Offline: Firestore keeps it locally and uploads
 * it later, so a safety snapshot never blocks (or hangs) the action it protects.
 */
export async function addVersion(workId: string, chapterId: string, json: string, kind: VersionKind, label = '') {
  const ref = doc(versionsCol(workId, chapterId))
  const p = setDoc(ref, { json, kind, label, createdAt: Date.now() })
  if (navigator.onLine) await p
  else p.catch((e) => console.error('Lưu phiên bản thất bại', e))
  return ref.id
}

// shortcut: loads full text of the newest 50 versions; split meta/content if lists get slow.
export async function listVersions(workId: string, chapterId: string): Promise<Version[]> {
  const s = await getDocs(query(versionsCol(workId, chapterId), orderBy('createdAt', 'desc'), limit(50)))
  return s.docs.map((d) => ({ ...(d.data() as Omit<Version, 'id'>), id: d.id }))
}

/** Keep only the newest AUTO_SNAPSHOTS_KEPT automatic snapshots; others kinds stay until deleted. */
export async function pruneAutoVersions(workId: string, chapterId: string) {
  const autos = query(versionsCol(workId, chapterId), where('kind', '==', 'auto'))
  const extra = (await getCountFromServer(autos)).data().count - AUTO_SNAPSHOTS_KEPT
  if (extra <= 0) return
  const oldest = await getDocs(query(autos, orderBy('createdAt', 'asc'), limit(extra)))
  await deleteAll(oldest.docs.map((d) => d.ref))
}
