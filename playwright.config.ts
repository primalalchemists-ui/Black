import { defineConfig, devices } from '@playwright/test'

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
import 'dotenv/config'

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './tests/e2e',
  /*
   * Pierwsze wejscie na strone w `next dev` kompiluje trase i potrafi zajac
   * ponad 30 s. Domyslny limit Playwrighta ucinalby taki test jako bledny.
   */
  timeout: 120_000,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: 'html',
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Cel testow. Ustaw E2E_BASE_URL, zeby uderzyc w staging zamiast lokalnego serwera. */
    baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3000',

    /*
     * Bramka stagingowa. Naglowek dziala bez logowania w przegladarce
     * (patrz docs/STAGING-ACCESS.md). Poza stagingiem brak klucza oznacza
     * brak naglowka, wiec konfiguracja nie zmienia niczego lokalnie.
     */
    extraHTTPHeaders: process.env.STAGING_ACCESS_KEY
      ? { 'x-staging-access': process.env.STAGING_ACCESS_KEY }
      : {},

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], channel: 'chromium' },
    },
  ],
  /*
   * Lokalny serwer podnosimy tylko wtedy, gdy nie wskazano zdalnego celu.
   * Przy E2E_BASE_URL (np. staging) startowanie `pnpm dev` byloby bledem:
   * czytaloby lokalny .env i celowalo w inna baze.
   */
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'pnpm dev',
        reuseExistingServer: true,
        url: 'http://127.0.0.1:3000',
      },
})
