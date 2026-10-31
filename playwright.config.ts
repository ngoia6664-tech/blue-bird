import { defineConfig, devices } from '@playwright/test'

// End-to-end tests against the local Firebase emulators. Never touches the real project.
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:5174', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, grep: /@mobile/ },
  ],
  webServer: [
    {
      command: 'npx firebase emulators:start --only auth,firestore --project demo-novel-studio',
      url: 'http://127.0.0.1:8080',
      wait: { stdout: /All emulators ready/ },
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: 'npx vite --mode emulator --host 127.0.0.1 --port 5174 --strictPort',
      url: 'http://127.0.0.1:5174',
      reuseExistingServer: true,
    },
  ],
})
