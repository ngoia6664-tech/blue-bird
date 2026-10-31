import { createStore, del, entries, get, update } from 'idb-keyval'
import { useSyncExternalStore } from 'react'
import { uid } from '../data/refs'
import { pruneAutoVersions } from '../data/versions'
import { draftKey, finalizeDraft, mergeDraft, type Draft, type DraftInput } from './drafts'
import { pushDraft } from './push'

// Local draft queue in IndexedDB. Every editor save lands here first, then is pushed to Firestore.
// A draft is only marked synced after the server confirms the write.

// shortcut: synced drafts are kept (one per chapter edited on this device) because their baseRev
// guards the next save; add cleanup of old synced drafts if browser storage ever becomes a concern.
const store = createStore('novel-studio', 'drafts')

export interface SyncStatus {
  online: boolean
  syncing: boolean
  /** Drafts saved on this device but not yet on the server. */
  pending: number
  error: string | null
}

let status: SyncStatus = { online: navigator.onLine, syncing: false, pending: 0, error: null }
const statusSubs = new Set<() => void>()
function setStatus(patch: Partial<SyncStatus>) {
  status = { ...status, ...patch }
  statusSubs.forEach((f) => f())
}
export function useSyncStatus() {
  return useSyncExternalStore(
    (cb) => (statusSubs.add(cb), () => statusSubs.delete(cb)),
    () => status,
  )
}

export type SyncEvent =
  | { chapterId: string; type: 'synced'; rev: number; savedAt: number }
  | { chapterId: string; type: 'conflict' }
  | { chapterId: string; type: 'error'; message: string }
const eventSubs = new Set<(e: SyncEvent) => void>()
export function onSyncEvent(cb: (e: SyncEvent) => void) {
  eventSubs.add(cb)
  return () => void eventSubs.delete(cb)
}
const emit = (e: SyncEvent) => eventSubs.forEach((f) => f(e))

const key = (workId: string, chapterId: string) => draftKey(uid(), workId, chapterId)

export const getDraft = (workId: string, chapterId: string) => get<Draft>(key(workId, chapterId), store)
export const discardDraft = (workId: string, chapterId: string) =>
  del(key(workId, chapterId), store).then(refreshPending)

export async function saveDraft(input: DraftInput, loadedRev: number): Promise<Draft> {
  let saved!: Draft
  await update<Draft>(key(input.workId, input.chapterId), (old) => (saved = mergeDraft(old, input, loadedRev)), store)
  await refreshPending()
  void flush()
  return saved
}

// IndexedDB writes are async: a tab closed mid-write may lose the last edits. On pagehide we also
// write a synchronous localStorage copy, merged back into the draft queue next time the chapter opens.
const emergencyKey = (workId: string, chapterId: string) => `emergency:${key(workId, chapterId)}`
interface Emergency { input: DraftInput; loadedRev: number }

export function writeEmergency(input: DraftInput, loadedRev: number) {
  try {
    localStorage.setItem(emergencyKey(input.workId, input.chapterId), JSON.stringify({ input, loadedRev } satisfies Emergency))
  } catch (e) {
    console.error('Không ghi được bản khẩn cấp', e) // quota: the IndexedDB save is still in flight
  }
}

export const clearEmergency = (workId: string, chapterId: string) => localStorage.removeItem(emergencyKey(workId, chapterId))

/** Move a leftover emergency copy into the draft queue if it is newer than the stored draft. */
export async function recoverEmergency(workId: string, chapterId: string) {
  const raw = localStorage.getItem(emergencyKey(workId, chapterId))
  if (!raw) return
  const { input, loadedRev } = JSON.parse(raw) as Emergency
  const draft = await getDraft(workId, chapterId)
  if (!draft || draft.savedAt < input.savedAt) await saveDraft(input, loadedRev)
  clearEmergency(workId, chapterId)
}

/** User resolved a conflict by keeping this device's text on top of the server's `serverRev`. */
export async function keepDraftOver(workId: string, chapterId: string, serverRev: number) {
  await update<Draft | undefined>(key(workId, chapterId), (d) => d && { ...d, baseRev: serverRev, conflict: false }, store)
  void flush()
}

async function myDrafts(): Promise<[IDBValidKey, Draft][]> {
  const prefix = `draft:${uid()}:`
  return (await entries<IDBValidKey, Draft>(store)).filter(([k, d]) => String(k).startsWith(prefix) && d)
}

async function refreshPending() {
  setStatus({ pending: (await myDrafts()).filter(([, d]) => !d.synced).length })
}

let running: Promise<void> | null = null
let again = false

/** Push every pending draft, one at a time. Safe to call often; resolves when the queue is drained. */
export function flush(): Promise<void> {
  if (running) {
    again = true
    return running
  }
  // One pusher across tabs, so two tabs never race the same draft into a false conflict.
  running = navigator.locks
    .request('novel-studio-sync', async () => {
      do {
        again = false
        await flushOnce()
      } while (again)
    })
    .finally(() => (running = null))
  return running
}

async function flushOnce() {
  if (!navigator.onLine) return setStatus({ online: false })
  const todo = (await myDrafts()).filter(([, d]) => !d.synced && !d.conflict)
  if (todo.length) setStatus({ syncing: true })
  let error: string | null = null
  for (const [k, d] of todo) {
    try {
      const r = await pushDraft(d)
      if (r.ok) {
        await update<Draft | undefined>(k, (old) => finalizeDraft(old, d.savedAt, r.rev), store)
        emit({ chapterId: d.chapterId, type: 'synced', rev: r.rev, savedAt: d.savedAt })
        if (r.snapshot) pruneAutoVersions(d.workId, d.chapterId).catch(console.error)
      } else {
        await update<Draft | undefined>(k, (old) => old && { ...old, conflict: true }, store)
        emit({ chapterId: d.chapterId, type: 'conflict' })
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
      emit({ chapterId: d.chapterId, type: 'error', message: error })
    }
  }
  setStatus({ syncing: false, error })
  await refreshPending()
}

/** Start background sync for the signed-in user. Returns a stop function. */
export function startSync(): () => void {
  const onOnline = () => (setStatus({ online: true }), void flush())
  const onOffline = () => setStatus({ online: false })
  window.addEventListener('online', onOnline)
  window.addEventListener('offline', onOffline)
  const timer = setInterval(() => void flush(), 30_000)
  void flush()
  return () => {
    window.removeEventListener('online', onOnline)
    window.removeEventListener('offline', onOffline)
    clearInterval(timer)
  }
}
