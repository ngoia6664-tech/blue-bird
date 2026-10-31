import { defineConfig } from 'vitest/config'

// Tests that need the Firebase emulators; run via `npm run test:emu`.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    env: { VITE_USE_EMULATOR: 'true', VITE_FIREBASE_PROJECT_ID: 'demo-novel-studio' },
    fileParallelism: false,
    testTimeout: 20000,
  },
})
