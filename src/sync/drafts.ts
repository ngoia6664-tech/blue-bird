// Pure rules for the local draft queue. Storage and network live in engine.ts.

export interface Draft {
  workId: string
  chapterId: string
  json: string
  text: string
  words: number
  /** Server revision this draft was written on top of. */
  baseRev: number
  savedAt: number
  /** True once the server has this exact content. */
  synced: boolean
  /** True when the server moved on without this draft; needs the user's choice. */
  conflict: boolean
}

export type DraftInput = Pick<Draft, 'workId' | 'chapterId' | 'json' | 'text' | 'words' | 'savedAt'>

export const draftKey = (uid: string, workId: string, chapterId: string) =>
  `draft:${uid}:${workId}:${chapterId}`

/** Merge an editor save into whatever draft is stored. `loadedRev` is the rev the editor opened. */
export function mergeDraft(old: Draft | undefined, input: DraftInput, loadedRev: number): Draft {
  const pending = !!old && !old.synced
  return {
    ...input,
    baseRev: pending ? old.baseRev : Math.max(old?.baseRev ?? 0, loadedRev),
    synced: false,
    conflict: pending ? old.conflict : false,
  }
}

/** After a successful push of the draft saved at `pushedSavedAt`, now at `newRev` on the server. */
export function finalizeDraft(old: Draft | undefined, pushedSavedAt: number, newRev: number) {
  if (!old) return undefined
  // Edits made during the push are still pending, but now build on newRev.
  return { ...old, baseRev: newRev, synced: old.savedAt === pushedSavedAt }
}

/** What to show when a chapter opens, given the stored draft and the server's rev. */
export function decideOnOpen(draft: Draft | undefined, serverRev: number): 'server' | 'draft' | 'conflict' {
  if (!draft || draft.synced) return 'server'
  // serverRev < baseRev only happens with a stale offline cache: the draft is newer.
  if (draft.conflict || serverRev > draft.baseRev) return 'conflict'
  return 'draft'
}
