import { defineConfig, devices } from '@playwright/test'
export default defineConfig({
  testDir: '../e2e', testMatch: 'qa*.spec.ts', timeout: 45000,
  fullyParallel: false, workers: 1, outputDir: './results',
  reporter: [['list'], ['json', { outputFile: '.qa/results.json' }]],
  use: { baseURL: 'http://localhost:5173', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, grep: /@mobile/ },
  ],
})
