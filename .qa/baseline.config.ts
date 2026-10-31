import { defineConfig, devices } from '@playwright/test'
export default defineConfig({
  testDir: '../e2e', testMatch: 'writing.spec.ts', timeout: 60000,
  workers: 1, fullyParallel: false, outputDir: './baseline-results',
  reporter: [['list'], ['json', { outputFile: '.qa/baseline-results.json' }]],
  use: { baseURL: 'http://localhost:5173', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, grep: /@mobile/ },
  ],
})
