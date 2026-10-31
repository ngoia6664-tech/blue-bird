import { initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth } from 'firebase/auth'
import {
  connectFirestoreEmulator,
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore'

const env = import.meta.env
export const usingEmulator = env.VITE_USE_EMULATOR === 'true'

const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY || 'demo-key',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID || 'demo-novel-studio',
  appId: env.VITE_FIREBASE_APP_ID,
})

export const auth = getAuth(app)

// Persistent cache lets the app read works/chapters offline. Chapter text writes do NOT rely on
// Firestore's offline write queue (last-write-wins); they go through src/sync instead.
export const db = initializeFirestore(app, {
  localCache:
    typeof indexedDB === 'undefined'
      ? memoryLocalCache()
      : persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  ignoreUndefinedProperties: true,
})

if (usingEmulator) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  connectFirestoreEmulator(db, '127.0.0.1', 8080)
}
