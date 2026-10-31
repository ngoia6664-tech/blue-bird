import { describe, expect, it } from 'vitest'
import { decideOnOpen, finalizeDraft, mergeDraft, type Draft } from './drafts'

const input = (savedAt: number, json = `{"v":${savedAt}}`) => ({
  workId: 'w', chapterId: 'c', json, text: 't', words: 1, savedAt,
})

describe('mergeDraft', () => {
  it('first save builds on the rev the editor loaded', () => {
    expect(mergeDraft(undefined, input(1), 4)).toMatchObject({ baseRev: 4, synced: false, conflict: false })
  })

  it('keeps baseRev of a still-pending draft', () => {
    const old = mergeDraft(undefined, input(1), 4)
    expect(mergeDraft(old, input(2), 9).baseRev).toBe(4)
  })

  it('keeps the conflict flag of a pending draft', () => {
    const old: Draft = { ...mergeDraft(undefined, input(1), 4), conflict: true }
    expect(mergeDraft(old, input(2), 4).conflict).toBe(true)
  })

  it('after a sync, builds on the newer of synced rev and loaded rev', () => {
    const synced: Draft = { ...mergeDraft(undefined, input(1), 4), synced: true, baseRev: 5 }
    expect(mergeDraft(synced, input(2), 4).baseRev).toBe(5) // we pushed after loading
    expect(mergeDraft(synced, input(2), 8).baseRev).toBe(8) // reopened after another device saved
  })
})

describe('finalizeDraft', () => {
  it('marks the pushed draft synced', () => {
    const d = mergeDraft(undefined, input(1), 4)
    expect(finalizeDraft(d, 1, 5)).toMatchObject({ synced: true, baseRev: 5 })
  })

  it('keeps edits made during the push pending, on top of the new rev', () => {
    const newer = mergeDraft(mergeDraft(undefined, input(1), 4), input(2), 4)
    expect(finalizeDraft(newer, 1, 5)).toMatchObject({ synced: false, baseRev: 5, savedAt: 2 })
  })

  it('does nothing if the draft was discarded', () => {
    expect(finalizeDraft(undefined, 1, 5)).toBeUndefined()
  })
})

describe('decideOnOpen', () => {
  const pending = mergeDraft(undefined, input(1), 4)

  it('uses the server when there is no pending draft', () => {
    expect(decideOnOpen(undefined, 3)).toBe('server')
    expect(decideOnOpen({ ...pending, synced: true }, 9)).toBe('server')
  })

  it('restores an unsynced draft built on the current server rev', () => {
    expect(decideOnOpen(pending, 4)).toBe('draft')
  })

  it('trusts the draft over a stale offline cache', () => {
    expect(decideOnOpen(pending, 2)).toBe('draft')
  })

  it('reports a conflict when the server moved on', () => {
    expect(decideOnOpen(pending, 5)).toBe('conflict')
    expect(decideOnOpen({ ...pending, conflict: true }, 4)).toBe('conflict')
  })
})
