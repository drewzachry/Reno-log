import { randomUUID } from "node:crypto";
import type { Page, Route } from "@playwright/test";

/**
 * A local stand-in for Google Identity Services, the Picker, and the Drive
 * and Sheets REST APIs, for end-to-end tests only. Unlike the fake Supabase
 * auth in gateway.mjs (a real HTTP server with its own state), this lives in
 * the Playwright process and intercepts the browser's own requests directly
 * — the two script URLs become fake scripts with the same window.google /
 * window.gapi shape the real ones expose, and the Drive/Sheets REST calls
 * (made straight from the browser with the user's access token, per the
 * no-database design) are answered from an in-memory file store here.
 *
 * Sign-in itself still goes through src/lib/google/verify.ts unmodified: see
 * fake-google.mjs, a separate real HTTP server that signs genuine,
 * verifiable ID tokens.
 */
export const FAKE_GOOGLE_PORT = 54323;
// Must match what fake-google.mjs signs tokens for (passed to it as
// GOOGLE_CLIENT_ID) and what the app checks ID tokens against (passed to it
// as NEXT_PUBLIC_GOOGLE_CLIENT_ID) — see playwright.config.ts.
export const FAKE_GOOGLE_CLIENT_ID = "e2e-google-client-id";

declare global {
  interface Window {
    __googleIdCallback?: (response: { credential: string }) => void;
    __fakePickerResult?: { id: string; name: string } | null;
  }
}

type FakeFile = {
  id: string;
  name: string;
  mimeType: string;
  parents: string[];
  appProperties: Record<string, string>;
};

// Shared across every page in the run, like the fake Supabase stack's one
// Postgres database — tests rely on unique names, not resets, for isolation.
const driveStore = new Map<string, FakeFile>();
const installedOn = new WeakSet<Page>();

const FAKE_GSI_SCRIPT = `
(function () {
  window.google = window.google || {};
  window.google.accounts = window.google.accounts || {};
  window.google.accounts.id = {
    initialize: function (config) {
      window.__googleIdCallback = config.callback;
    },
    renderButton: function (parent) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = "Sign in with Google (test)";
      parent.appendChild(btn);
    },
    disableAutoSelect: function () {},
  };
  window.google.accounts.oauth2 = {
    initTokenClient: function (config) {
      return {
        requestAccessToken: function () {
          setTimeout(function () {
            config.callback({ access_token: "fake-drive-access-token", expires_in: 3600 });
          }, 0);
        },
      };
    },
  };
})();
`;

const FAKE_GAPI_SCRIPT = `
(function () {
  window.gapi = window.gapi || {};
  window.gapi.load = function (_api, callback) {
    setTimeout(callback, 0);
  };
  window.google = window.google || {};

  function DocsView() {}
  DocsView.prototype.setIncludeFolders = function () { return this; };
  DocsView.prototype.setSelectFolderEnabled = function () { return this; };
  DocsView.prototype.setMimeTypes = function () { return this; };

  function PickerBuilder() { this._callback = null; }
  PickerBuilder.prototype.addView = function () { return this; };
  PickerBuilder.prototype.setOAuthToken = function () { return this; };
  PickerBuilder.prototype.setDeveloperKey = function () { return this; };
  PickerBuilder.prototype.setCallback = function (cb) { this._callback = cb; return this; };
  PickerBuilder.prototype.build = function () {
    var callback = this._callback;
    return {
      setVisible: function (visible) {
        if (!visible) return;
        setTimeout(function () {
          var picker = window.google.picker;
          var result = window.__fakePickerResult;
          var data = {};
          if (result) {
            var doc = {};
            doc[picker.Document.ID] = result.id;
            doc[picker.Document.NAME] = result.name;
            data[picker.Response.ACTION] = picker.Action.PICKED;
            data[picker.Response.DOCUMENTS] = [doc];
          } else {
            data[picker.Response.ACTION] = picker.Action.CANCEL;
          }
          callback(data);
        }, 0);
      },
    };
  };

  window.google.picker = {
    DocsView: DocsView,
    PickerBuilder: PickerBuilder,
    ViewId: { FOLDERS: "folders" },
    Action: { PICKED: "picked", CANCEL: "cancel" },
    Response: { ACTION: "action", DOCUMENTS: "documents" },
    Document: { ID: "id", NAME: "name" },
  };
})();
`;

async function driveHandler(route: Route) {
  const req = route.request();
  const url = new URL(req.url());
  const method = req.method();
  const body = () => (req.postData() ? JSON.parse(req.postData()!) : {});

  if (method === "POST" && url.pathname === "/drive/v3/files") {
    const { name, mimeType, parents } = body();
    const file: FakeFile = {
      id: randomUUID(),
      name,
      mimeType,
      parents: parents ?? [],
      appProperties: {},
    };
    driveStore.set(file.id, file);
    return route.fulfill({ json: { id: file.id, name: file.name } });
  }

  const itemMatch = url.pathname.match(/^\/drive\/v3\/files\/([^/]+)$/);
  if (itemMatch) {
    const file = driveStore.get(itemMatch[1]);
    if (!file) return route.fulfill({ status: 404, json: { error: "file not found" } });
    if (method === "GET") {
      return route.fulfill({ json: { name: file.name, appProperties: file.appProperties } });
    }
    if (method === "PATCH") {
      Object.assign(file.appProperties, body().appProperties ?? {});
      return route.fulfill({ json: { id: file.id } });
    }
  }

  return route.fulfill({ status: 404, json: { error: `fake drive: ${method} ${url.pathname}` } });
}

/**
 * Not a real spreadsheet backend — Phase 1 only needs these calls to
 * succeed, since nothing yet reads Sheet content back in a test. Phase 2's
 * Sheet read/write layer should replace this with something that actually
 * tracks tabs and values once tests need to assert on them.
 */
async function sheetsHandler(route: Route) {
  const method = route.request().method();
  if (method === "POST" || method === "PUT") return route.fulfill({ json: {} });
  const url = new URL(route.request().url());
  return route.fulfill({ status: 404, json: { error: `fake sheets: ${method} ${url.pathname}` } });
}

/** Installs the Google fakes on a page. Safe to call more than once per page. */
export async function installGoogleFakes(page: Page): Promise<void> {
  if (installedOn.has(page)) return;
  installedOn.add(page);
  await page.route("https://accounts.google.com/gsi/client", (route) =>
    route.fulfill({ contentType: "application/javascript", body: FAKE_GSI_SCRIPT }),
  );
  await page.route("https://apis.google.com/js/api.js", (route) =>
    route.fulfill({ contentType: "application/javascript", body: FAKE_GAPI_SCRIPT }),
  );
  await page.route("https://www.googleapis.com/drive/v3/**", driveHandler);
  await page.route("https://sheets.googleapis.com/v4/**", sheetsHandler);
}

/**
 * Signs in as a fake Google user: fetches a real, verifiable ID token from
 * fake-google.mjs (not a stub — the app's own server-side verification runs
 * unmodified against it) and hands it straight to the page's stored
 * Identity Services callback, the same thing a real Google popup eventually
 * calls. Call after navigating to a page that renders the sign-in button
 * (so `google.accounts.id.initialize` has run).
 */
export async function signInAsGoogleUser(page: Page, email: string, name?: string): Promise<void> {
  await installGoogleFakes(page);
  const res = await fetch(
    `http://localhost:${FAKE_GOOGLE_PORT}/sign?email=${encodeURIComponent(email)}&name=${encodeURIComponent(name ?? "")}`,
  );
  if (!res.ok) throw new Error(`fake google /sign failed: ${res.status} ${await res.text()}`);
  const { idToken } = (await res.json()) as { idToken: string };
  await page.waitForFunction(() => typeof window.__googleIdCallback === "function");
  await page.evaluate((token) => window.__googleIdCallback!({ credential: token }), idToken);
}

/** Sets what the fake Picker "returns" the next time it's opened on this page. */
export async function setFakePickerResult(
  page: Page,
  result: { id: string; name: string } | null,
): Promise<void> {
  await installGoogleFakes(page);
  await page.evaluate((r) => {
    window.__fakePickerResult = r;
  }, result);
}

/**
 * The top-level project folders ("<name> — Reno") created so far in the
 * fake Drive store, for tests that need a real folder id — e.g. to
 * simulate a second person opening a project someone already created, via
 * the Picker. Excludes the Uploads subfolder each project also creates.
 */
export function fakeDriveProjectFolders(): FakeFile[] {
  return [...driveStore.values()].filter(
    (f) => f.mimeType === "application/vnd.google-apps.folder" && f.name.endsWith(" — Reno"),
  );
}
