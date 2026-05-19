/* eslint-env node */
import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';

const port = Number(process.env.PLAYWRIGHT_PORT || 4173);
const baseURL = `http://127.0.0.1:${port}`;
const codexRuntimeNode = `${homedir()}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node`;
const nodeBin = process.env.OPENMELON_NODE_BIN || (existsSync(codexRuntimeNode) ? codexRuntimeNode : process.execPath);
const quoteShellArg = (value) => JSON.stringify(value);

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    headless: true,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `${quoteShellArg(nodeBin)} ./node_modules/vite/bin/vite.js --host 127.0.0.1 --port ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
