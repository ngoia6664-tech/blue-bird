import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth'
import { getDoc } from 'firebase/firestore'
import { beforeAll, describe, expect, it } from 'vitest'
import { createChapter } from '../src/data/chapters'
import { workDoc } from '../src/data/refs'
import { listVersions } from '../src/data/versions'
import { saveWork } from '../src/data/works'
import { auth } from '../src/firebase'
import type { Draft } from '../src/sync/drafts'
import { pushDraft } from '../src/sync/push'

Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true })

beforeAll(async () => {
  const token = JSON.stringify({ sub: 'push-test', email: 'ngoia6664@gmail.com', email_verified: true })
  await signInWithCredential(auth, GoogleAuthProvider.credential(token))
})

async function setup() {
  const workId = await saveWork(null, {
    title: 'Thử', aliases: [], genre: '', tags: [], status: 'writing', description: '', privateNote: '',
  }, undefined)
  const chapterId = await createChapter(workId, 'Chương 1', 1)
  const draft = (json: string, baseRev: number, words = 2): Draft => ({
    workId, chapterId, json, text: json, words, baseRev, savedAt: Date.now(), synced: false, conflict: false,
  })
  return { workId, chapterId, draft }
}

describe('pushDraft (Firestore emulator)', () => {
  it('writes when the server is at baseRev and bumps the revision', async () => {
    const { workId, draft } = await setup()
    expect(await pushDraft(draft('{"a":"Xin chào"}', 0))).toMatchObject({ ok: true, rev: 1 })
    expect(await pushDraft(draft('{"a":"Xin chào bạn"}', 1, 3))).toMatchObject({ ok: true, rev: 2 })
    expect((await getDoc(workDoc(workId))).data()?.wordCount).toBe(3)
  })

  it('refuses to overwrite when another device saved first', async () => {
    const { draft } = await setup()
    await pushDraft(draft('{"laptop":1}', 0))
    expect(await pushDraft(draft('{"phone":1}', 0))).toEqual({ ok: false, serverRev: 1 })
  })

  it('treats re-pushing identical content as already synced', async () => {
    const { draft } = await setup()
    await pushDraft(draft('{"same":1}', 0))
    expect(await pushDraft(draft('{"same":1}', 0))).toMatchObject({ ok: true, rev: 1 })
  })

  it('snapshots the replaced text as an automatic version', async () => {
    const { workId, chapterId, draft } = await setup()
    await pushDraft(draft('{"v":1}', 0))
    const r = await pushDraft(draft('{"v":2}', 1))
    expect(r).toMatchObject({ ok: true, snapshot: true })
    const versions = await listVersions(workId, chapterId)
    expect(versions.map((v) => [v.kind, v.json])).toEqual([['auto', '{"v":1}']])
    // Within 10 minutes: no new snapshot.
    expect(await pushDraft(draft('{"v":3}', 2))).toMatchObject({ ok: true, snapshot: false })
  })

  it('rejects chapters too large for one Firestore document', async () => {
    const { draft } = await setup()
    await expect(pushDraft(draft('x'.repeat(600_000), 0))).rejects.toThrow(/quá dài/)
  })
})
