import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router'
import { AuthProvider } from './auth/AuthProvider'
import { AppLayout } from './components/AppLayout'
import { Library } from './pages/Library'
import { Settings } from './pages/Settings'
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
      { path: 'settings', element: <Settings /> },
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
