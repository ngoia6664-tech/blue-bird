import { defineConfig } from 'vitest/config'
export default defineConfig({ test: {
 include: ['.qa/rules.test.ts', 'tests/push.test.ts'],
 env: { VITE_USE_EMULATOR: 'true', VITE_FIREBASE_PROJECT_ID: 'demo-novel-qa' },
 fileParallelism: false, testTimeout: 20000
}})
