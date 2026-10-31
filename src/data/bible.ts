import { doc, writeBatch } from 'firebase/firestore'
import { db } from '../firebase'
import type { BibleItem, BibleKind } from '../types'
import { bibleCol, commit } from './refs'

// Story Bible: one small document per entry under works/{workId}/bible, so a work's notes never
// pile up into one huge document and entries of two works can never mix.

export const emptyLinks = (): BibleItem['links'] => ({ characters: [], places: [], events: [], chapters: [] })

export async function createBibleItem(workId: string, kind: BibleKind, name: string, order: number, id?: string) {
  const ref = id ? doc(bibleCol(workId), id) : doc(bibleCol(workId))
  const now = Date.now()
  const item: Omit<BibleItem, 'id'> = {
    kind, name, fields: {}, status: '', order, tags: [], links: emptyLinks(), relations: [],
    createdAt: now, updatedAt: now, deletedAt: null,
  }
  const batch = writeBatch(db)
  batch.set(ref, item)
  await commit(batch)
  return ref.id
}

export type BiblePatch = Partial<Omit<BibleItem, 'id' | 'kind' | 'createdAt'>>

export function updateBibleItem(workId: string, id: string, patch: BiblePatch) {
  const batch = writeBatch(db)
  batch.update(doc(bibleCol(workId), id), { ...patch, updatedAt: Date.now() })
  return commit(batch)
}

/** One free-text field only (dotted path), so two quick edits of different fields never clobber each other. */
export function updateBibleField(workId: string, id: string, key: string, value: string) {
  const batch = writeBatch(db)
  batch.update(doc(bibleCol(workId), id), { [`fields.${key}`]: value, updatedAt: Date.now() })
  return commit(batch)
}

/** Style rules live in one fixed entry, created on first edit. */
export const STYLE_ID = 'style'
export function saveStyleField(workId: string, exists: boolean, key: string, value: string) {
  if (exists) return updateBibleField(workId, STYLE_ID, key, value)
  const batch = writeBatch(db)
  const now = Date.now()
  // merge: a second field saved before the first one shows up must not erase it.
  batch.set(doc(bibleCol(workId), STYLE_ID), { kind: 'style', name: 'Quy tắc văn phong', fields: { [key]: value }, status: '', order: 0, tags: [], links: emptyLinks(), relations: [], createdAt: now, updatedAt: now, deletedAt: null }, { merge: true })
  return commit(batch)
}
