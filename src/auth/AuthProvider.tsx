import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithCredential,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
} from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { auth, db } from '../firebase'
import { startSync } from '../sync/engine'

export type AuthState =
  | { status: 'loading' }
  | { status: 'signedOut' }
  | { status: 'denied'; user: User }
  | { status: 'ready'; user: User }

const AuthContext = createContext<AuthState>({ status: 'loading' })
export const useAuth = () => useContext(AuthContext)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' })

  useEffect(
    () =>
      onAuthStateChanged(auth, async (user) => {
        if (!user) return setState({ status: 'signedOut' })
        // Security Rules decide access; this probe only picks which screen to show.
        try {
          await getDoc(doc(db, 'users', user.uid, 'meta', 'access'))
          setState({ status: 'ready', user })
        } catch (e) {
          const denied = (e as { code?: string }).code === 'permission-denied'
          setState({ status: denied ? 'denied' : 'ready', user }) // offline: let cached data load
        }
      }),
    [],
  )

  useEffect(() => (state.status === 'ready' ? startSync() : undefined), [state])

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>
}

export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider()
  provider.setCustomParameters({ prompt: 'select_account' })
  try {
    await signInWithPopup(auth, provider)
  } catch (e) {
    const code = (e as { code?: string }).code
    if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
      await signInWithRedirect(auth, provider)
    } else if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
      throw e
    }
  }
}

export const signOutUser = () => signOut(auth)

// Emulator-only sign-in for automated tests; removed from production builds.
if (import.meta.env.VITE_USE_EMULATOR === 'true') {
  Object.assign(window, {
    __signInForTest: (email: string) =>
      signInWithCredential(
        auth,
        GoogleAuthProvider.credential(JSON.stringify({ sub: email, email, email_verified: true })),
      ),
  })
}
