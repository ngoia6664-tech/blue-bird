import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router'
import { AuthProvider } from './auth/AuthProvider'
import { AppLayout } from './components/AppLayout'
import { Library } from './pages/Library'
import { WorkForm } from './pages/WorkForm'
import { Writer } from './pages/Writer'
import '@fontsource-variable/literata/wght.css'
import '@fontsource-variable/literata/wght-italic.css'
import '@fontsource/be-vietnam-pro/400.css'
import '@fontsource/be-vietnam-pro/500.css'
import '@fontsource/be-vietnam-pro/600.css'
import './styles/tokens.css'
import './styles/app.css'

const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { index: true, element: <Library /> },
      { path: 'works/new', element: <WorkForm /> },
      { path: 'works/:workId/edit', element: <WorkForm /> },
      { path: 'write/:workId?/:chapterId?', element: <Writer /> },
      // Loaded on first visit: reading, Story Bible and backup (zip) code stay out of the main bundle.
      { path: 'read/:workId?/:chapterId?', lazy: () => import('./pages/Reader').then((m) => ({ Component: m.Reader })) },
      { path: 'bible/:workId?', lazy: () => import('./pages/Bible').then((m) => ({ Component: m.Bible })) },
      { path: 'settings', lazy: () => import('./pages/Settings').then((m) => ({ Component: m.Settings })) },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  </StrictMode>,
)

// Offline app shell. Production only: in dev a service worker would cache Vite's modules.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker
    .register('/sw.js')
    .then((reg) => {
      const announce = (w: ServiceWorker | null) =>
        w && navigator.serviceWorker.controller && window.dispatchEvent(new CustomEvent('sw-update', { detail: w }))
      announce(reg.waiting)
      reg.addEventListener('updatefound', () => {
        const w = reg.installing
        w?.addEventListener('statechange', () => w.state === 'installed' && announce(w))
      })
      setInterval(() => void reg.update(), 60 * 60 * 1000)
    })
    .catch(console.error)
  let reloading = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!reloading) location.reload() // the editor's unload handlers save the draft first
    reloading = true
  })
}
