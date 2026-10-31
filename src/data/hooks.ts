import { onSnapshot, type DocumentReference, type Query } from 'firebase/firestore'
import { useEffect, useMemo, useState } from 'react'
import type { BibleItem, Chapter, Work } from '../types'
import { bibleCol, chaptersCol, workDoc, worksCol } from './refs'

interface Live<T> {
  data: T | undefined
  error: Error | null
}

function useLiveQuery<T>(make: () => Query | null, deps: unknown[]): Live<T[]> {
  const [state, setState] = useState<Live<T[]>>({ data: undefined, error: null })
  useEffect(() => {
    const q = make()
    if (!q) return
    setState({ data: undefined, error: null })
    return onSnapshot(
      q,
      (s) => setState({ data: s.docs.map((d) => ({ ...d.data(), id: d.id }) as T), error: null }),
      (error) => setState((p) => ({ ...p, error })),
    )
  }, deps)
  return state
}

function useLiveDoc<T>(make: () => DocumentReference | null, deps: unknown[]): Live<T | null> {
  const [state, setState] = useState<Live<T | null>>({ data: undefined, error: null })
  useEffect(() => {
    const ref = make()
    if (!ref) return
    setState({ data: undefined, error: null })
    return onSnapshot(
      ref,
      (s) => setState({ data: s.exists() ? ({ ...s.data(), id: s.id } as T) : null, error: null }),
      (error) => setState((p) => ({ ...p, error })),
    )
  }, deps)
  return state
}

// shortcut: loads every work's metadata (no paging); fine for a personal library of a few hundred.
export const useWorks = () => useLiveQuery<Work>(() => worksCol(), [])

export const useWork = (workId: string | undefined) =>
  useLiveDoc<Work>(() => (workId ? workDoc(workId) : null), [workId])

/** All chapter metadata of a work (including trashed), sorted by position. */
export function useChapters(workId: string | undefined) {
  const live = useLiveQuery<Chapter>(() => (workId ? chaptersCol(workId) : null), [workId])
  const data = useMemo(() => live.data?.slice().sort((a, b) => a.order - b.order), [live.data])
  return { error: live.error, data }
}

/** Every Story Bible entry of a work (including trashed); small docs, one listener. */
export const useBible = (workId: string | undefined) =>
  useLiveQuery<BibleItem>(() => (workId ? bibleCol(workId) : null), [workId])
