import { defineConfig, devices } from '@playwright/test';

function port(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < 1024 || value > 65535) {
    throw new Error(`${name} must be an integer port between 1024 and 65535`);
  }
  return value;
}

const apiPort = port('PERNOVA_E2E_API_PORT', 8000);
const webPort = port('PERNOVA_E2E_WEB_PORT', 5173);
if (apiPort === webPort) throw new Error('E2E API and frontend ports must differ');
const apiOrigin = `http://127.0.0.1:${apiPort}`;
const webOrigin = `http://127.0.0.1:${webPort}`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: webOrigin,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  metadata: { apiOrigin },
  webServer: [
    {
      command: `uv run --project backend uvicorn backend.app.main:app --host 127.0.0.1 --port ${apiPort}`,
      url: `${apiOrigin}/health/ready`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        PERNOVA_DATA_DIR: `tmp/e2e-data-${apiPort}`,
        PERNOVA_ALLOWED_ORIGINS: `${webOrigin},${apiOrigin}`,
      },
    },
    {
      command: `npm --prefix frontend run dev -- --host 127.0.0.1 --port ${webPort} --strictPort`,
      url: webOrigin,
      reuseExistingServer: false,
      timeout: 120_000,
      env: { PERNOVA_E2E_API_PORT: String(apiPort) },
    },
  ],
});
