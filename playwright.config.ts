import { defineConfig, devices } from "@playwright/test";
import { FAKE_GOOGLE_CLIENT_ID, FAKE_GOOGLE_PORT } from "./e2e/stack/google";

const PORT = 3100;
// The app talks to the local test stack from e2e/stack, never a real project
// or a real Google account. Budget/decisions/chat/documents are still on
// Supabase (not yet migrated to the Sheet — see CLAUDE.md); sign-in and
// project creation talk to the fakes in e2e/stack/google.ts and
// fake-google.mjs instead.
const TEST_ENV = {
  NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_e2e",
  SUPABASE_SERVICE_ROLE_KEY: "sb_secret_e2e",
  // Claude is the scripted fake in e2e/stack/fake-claude.mjs.
  ANTHROPIC_API_KEY: "e2e",
  ANTHROPIC_BASE_URL: "http://localhost:54321",
  NEXT_PUBLIC_GOOGLE_CLIENT_ID: FAKE_GOOGLE_CLIENT_ID,
  NEXT_PUBLIC_GOOGLE_PICKER_API_KEY: "e2e-picker-api-key",
  GOOGLE_JWKS_URL: `http://localhost:${FAKE_GOOGLE_PORT}/oauth2/v3/certs`,
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
    env: TEST_ENV,
  },
});
