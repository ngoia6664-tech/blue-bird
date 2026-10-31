import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'

// Must match the first address in firestore.rules.
const OWNER_EMAIL = 'ngoia6664@gmail.com'

let env: RulesTestEnvironment

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-novel-studio',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  })
})
beforeEach(() => env.clearFirestore())
afterAll(() => env.cleanup())

const work = 'users/owner/works/w1'

describe('firestore.rules', () => {
  it('lets the allowed owner read and write their own data', async () => {
    const db = env.authenticatedContext('owner', { email: OWNER_EMAIL, email_verified: true }).firestore()
    await assertSucceeds(setDoc(doc(db, work), { title: 'Truyện' }))
    await assertSucceeds(getDoc(doc(db, work)))
    await assertSucceeds(setDoc(doc(db, `${work}/chapters/c1/versions/v1`), { json: '' }))
  })

  it('blocks a Google account that is not on the list, even on its own uid path', async () => {
    const db = env.authenticatedContext('stranger', { email: 'stranger@gmail.com', email_verified: true }).firestore()
    await assertFails(setDoc(doc(db, 'users/stranger/works/w1'), { title: 'x' }))
    await assertFails(getDoc(doc(db, work)))
  })

  it('blocks an unverified email', async () => {
    const db = env.authenticatedContext('owner', { email: OWNER_EMAIL, email_verified: false }).firestore()
    await assertFails(getDoc(doc(db, work)))
  })

  it('blocks the owner email under another uid', async () => {
    const db = env.authenticatedContext('other', { email: OWNER_EMAIL, email_verified: true }).firestore()
    await assertFails(getDoc(doc(db, work)))
  })

  it('protects Story Bible entries like every other part of a work', async () => {
    const owner = env.authenticatedContext('owner', { email: OWNER_EMAIL, email_verified: true }).firestore()
    await assertSucceeds(setDoc(doc(owner, `${work}/bible/b1`), { kind: 'character', name: 'Hare' }))
    await assertSucceeds(getDoc(doc(owner, `${work}/bible/b1`)))
    const other = env.authenticatedContext('other', { email: OWNER_EMAIL, email_verified: true }).firestore()
    await assertFails(getDoc(doc(other, `${work}/bible/b1`)))
    await assertFails(setDoc(doc(other, `${work}/bible/b2`), { name: 'x' }))
    const stranger = env.authenticatedContext('owner', { email: 'stranger@gmail.com', email_verified: true }).firestore()
    await assertFails(getDoc(doc(stranger, `${work}/bible/b1`)))
  })

  it('blocks signed-out access and paths outside users/', async () => {
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), work)))
    const db = env.authenticatedContext('owner', { email: OWNER_EMAIL, email_verified: true }).firestore()
    await assertFails(setDoc(doc(db, 'public/x'), { a: 1 }))
  })
})
