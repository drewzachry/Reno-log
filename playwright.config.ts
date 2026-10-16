import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
// The app talks to the local test stack from e2e/stack, never a real project.
const SUPABASE_ENV = {
  NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_e2e",
};

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/stack/setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: `http://localhost:${PORT}` },
  // Phone first: iPhone-sized viewport in Chromium (WebKit isn't installed in every environment).
  projects: [
    {
      name: "phone",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: {
    command: `npm run build && npm run start -- -p ${PORT}`,
    port: PORT,
    timeout: 240_000,
    reuseExistingServer: false,
    env: SUPABASE_ENV,
  },
});
