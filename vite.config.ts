/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Pre-bundle lazily imported deps so the dev server never reloads the page mid-session to add them.
  optimizeDeps: { include: ['mammoth', 'docx', 'jszip'] },
  define: { __APP_VERSION__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ')) },
  test: {
    include: ['src/**/*.test.ts'],
  },
})
