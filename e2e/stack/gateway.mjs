// A local stand-in for a Supabase project, for end-to-end tests only.
// /rest/v1 is proxied to PostgREST (the same server Supabase uses); /auth/v1
// is a minimal fake of Supabase Auth where any 6-digit code signs you in;
// /storage/v1 keeps files in a temp folder with the same access rules; and
// /v1/messages is a scripted Claude (see fake-claude.mjs).
import { createHash, createHmac, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import pg from "pg";
import { fakeClaude, lastRequest } from "./fake-claude.mjs";

const { DATABASE_URL, JWT_SECRET, PORT = "54321", POSTGREST_PORT = "54322" } = process.env;
// What the app sends as SUPABASE_SERVICE_ROLE_KEY in tests.
const SERVICE_KEY = "sb_secret_e2e";
const FILES = join(tmpdir(), `reno-e2e-storage-${process.pid}`);
const db = new pg.Client({ connectionString: DATABASE_URL });
await db.connect();

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const mac = (s) => createHmac("sha256", JWT_SECRET).update(s).digest("base64url");
const sign = (payload) => {
  const head = `${b64({ alg: "HS256", typ: "JWT" })}.${b64(payload)}`;
  return `${head}.${mac(head)}`;
};
const verify = (token) => {
  const [h, b, s] = (token ?? "").split(".");
  if (!s || mac(`${h}.${b}`) !== s) return null;
  const p = JSON.parse(Buffer.from(b, "base64url").toString());
  return p.exp > Date.now() / 1000 ? p : null;
};

const userJson = (u) => ({
  id: u.id,
  aud: "authenticated",
  role: "authenticated",
  email: u.email,
  app_metadata: { provider: "email" },
  user_metadata: u.raw_user_meta_data ?? {},
  created_at: new Date().toISOString(),
});
const refreshTokens = new Map();
// Sign-in links: the last link per email (for tests to "open"), and PKCE auth
// codes waiting to be exchanged with the matching verifier.
const lastLink = new Map();
const linkTokens = new Map();
const authCodes = new Map();
const findOrCreateUser = async (email) => {
  let { rows } = await db.query("select * from auth.users where email = $1", [email]);
  if (!rows.length) {
    ({ rows } = await db.query("insert into auth.users (email) values ($1) returning *", [email]));
  }
  return rows[0];
};
const session = (u) => {
  const now = Math.floor(Date.now() / 1000);
  const refresh = randomUUID();
  refreshTokens.set(refresh, u);
  return {
    access_token: sign({
      sub: u.id,
      email: u.email,
      role: "authenticated",
      aud: "authenticated",
      iat: now,
      exp: now + 3600,
    }),
    token_type: "bearer",
    expires_in: 3600,
    expires_at: now + 3600,
    refresh_token: refresh,
    user: userJson(u),
  };
};

const readBody = (req) =>
  new Promise((resolve) => {
    let d = "";
    req.on("data", (c) => (d += c));
    req.on("end", () => resolve(d ? JSON.parse(d) : {}));
  });
const readRaw = (req) =>
  new Promise((resolve) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
  });
const serviceToken = () =>
  sign({
    role: "service_role",
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
  });

/** Storage access, mirroring the policies: members read, owners and editors upload. */
async function storageRole(req, path) {
  if (req.headers.apikey === SERVICE_KEY && !verify(req.headers.authorization?.slice(7)))
    return "service";
  const p = verify(req.headers.authorization?.slice(7));
  const [top, project] = path.split("/");
  if (!p || top !== "projects" || !/^[0-9a-f-]{36}$/.test(project ?? "")) return null;
  const { rows } = await db.query(
    "select role from public.project_members where project_id = $1 and user_id = $2",
    [project, p.sub],
  );
  return rows[0]?.role ?? null;
}

/** The file from a storage upload: raw, or the file part of the browser's multipart form. */
function fileFrom(contentType, raw) {
  const boundary = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/);
  if (!contentType.startsWith("multipart/form-data") || !boundary)
    return { body: raw, type: contentType || "application/octet-stream" };
  const sep = Buffer.from(`--${boundary[1] ?? boundary[2]}`);
  let at = raw.indexOf(sep);
  while (at !== -1) {
    const next = raw.indexOf(sep, at + sep.length);
    if (next === -1) break;
    const part = raw.subarray(at + sep.length + 2, next - 2);
    const split = part.indexOf("\r\n\r\n");
    const head = part.subarray(0, split).toString();
    if (/filename=/i.test(head)) {
      return {
        body: part.subarray(split + 4),
        type: head.match(/content-type:\s*([^\r\n]+)/i)?.[1] ?? "application/octet-stream",
      };
    }
    at = next;
  }
  return { body: raw, type: "application/octet-stream" };
}

async function storage(req, res, url) {
  const BUCKET = "project-files";
  const rest = decodeURIComponent(url.pathname.replace("/storage/v1/object/", ""));
  // Signed links for viewing: POST sign/{bucket} {paths}, then GET sign/{bucket}/{path}?token=
  if (rest === `sign/${BUCKET}` && req.method === "POST") {
    const b = await readBody(req);
    const out = [];
    for (const path of b.paths) {
      const ok = await storageRole(req, path);
      out.push(
        ok
          ? { path, signedURL: `/object/sign/${BUCKET}/${path}?token=${mac(path)}`, error: null }
          : {
              path,
              signedURL: null,
              error: "Either the object does not exist or you do not have access to it",
            },
      );
    }
    return send(res, 200, out);
  }
  if (rest.startsWith(`sign/${BUCKET}/`) && req.method === "GET") {
    const path = rest.slice(`sign/${BUCKET}/`.length);
    const file = join(FILES, path);
    if (url.searchParams.get("token") !== mac(path) || !existsSync(file))
      return send(res, 400, { error: "invalid signature" });
    res.writeHead(200, { "content-type": readFileSync(`${file}.type`, "utf8") });
    return res.end(readFileSync(file));
  }
  if (!rest.startsWith(`${BUCKET}/`)) return send(res, 404, { error: "not found" });
  const path = rest.slice(BUCKET.length + 1);
  if (path.includes("..")) return send(res, 400, { error: "bad path" });
  const role = await storageRole(req, path);
  const file = join(FILES, path);
  if (req.method === "POST" || req.method === "PUT") {
    if (!["owner", "editor", "service"].includes(role))
      return send(res, 403, {
        statusCode: "403",
        error: "Unauthorized",
        message: "new row violates row-level security policy",
      });
    mkdirSync(dirname(file), { recursive: true });
    const { body, type } = fileFrom(req.headers["content-type"] ?? "", await readRaw(req));
    writeFileSync(file, body);
    writeFileSync(`${file}.type`, type);
    return send(res, 200, { Id: randomUUID(), Key: `${BUCKET}/${path}` });
  }
  if (req.method === "GET") {
    if (!role || !existsSync(file))
      return send(res, 400, { statusCode: "404", error: "not_found", message: "Object not found" });
    res.writeHead(200, { "content-type": readFileSync(`${file}.type`, "utf8") });
    return res.end(readFileSync(file));
  }
  send(res, 404, { error: "not implemented" });
}

const send = (res, status, obj) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(obj === undefined ? "" : JSON.stringify(obj));
};

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, "http://local");
    // The browser uploads photos straight to Storage, from the app's origin.
    res.setHeader("access-control-allow-origin", req.headers.origin ?? "*");
    res.setHeader("access-control-allow-credentials", "true");
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
        "access-control-allow-headers": req.headers["access-control-request-headers"] ?? "*",
        "access-control-max-age": "600",
      });
      return res.end();
    }
    if (url.pathname === "/v1/messages" && req.method === "POST") {
      return send(res, 200, fakeClaude(await readBody(req)));
    }
    if (url.pathname === "/v1/test/last-request") return send(res, 200, lastRequest ?? {});
    if (url.pathname.startsWith("/storage/v1/object/")) return storage(req, res, url);
    if (url.pathname.startsWith("/rest/v1")) {
      const headers = { ...req.headers, host: `localhost:${POSTGREST_PORT}` };
      // The publishable key isn't a JWT; without a user token, PostgREST uses
      // the anon role. The secret key acts as the service role, as on Supabase.
      if (!verify(headers.authorization?.slice(7))) {
        if (headers.apikey === SERVICE_KEY) headers.authorization = `Bearer ${serviceToken()}`;
        else delete headers.authorization;
      }
      const upstream = http.request(
        {
          host: "localhost",
          port: POSTGREST_PORT,
          path: req.url.replace("/rest/v1", "") || "/",
          method: req.method,
          headers,
        },
        (r) => {
          res.writeHead(r.statusCode, r.headers);
          r.pipe(res);
        },
      );
      req.pipe(upstream);
      return;
    }

    const path = url.pathname.replace("/auth/v1", "");
    if (path === "/settings") return send(res, 200, { external: { email: true, google: false } });
    if (path === "/otp") {
      const b = await readBody(req);
      const token = randomUUID();
      linkTokens.set(token, {
        email: b.email.toLowerCase(),
        challenge: b.code_challenge,
        redirectTo: url.searchParams.get("redirect_to"),
      });
      lastLink.set(
        b.email.toLowerCase(),
        `http://localhost:${PORT}/auth/v1/verify?token=${token}&type=magiclink`,
      );
      return send(res, 200, {});
    }
    if (path === "/test/last-link") {
      const link = lastLink.get(url.searchParams.get("email"));
      return link ? send(res, 200, { link }) : send(res, 404, { msg: "no link sent" });
    }
    if (path === "/verify" && req.method === "GET") {
      // Opening the emailed link: like Supabase, redirect with a one-time code.
      const t = linkTokens.get(url.searchParams.get("token"));
      if (!t) return send(res, 403, { msg: "unknown link" });
      if (t.used) {
        // Like Supabase: back to the app with the error in the URL fragment.
        res.writeHead(303, {
          location: `${t.redirectTo}#error=access_denied&error_code=otp_expired`,
        });
        return res.end();
      }
      t.used = true;
      const code = randomUUID();
      authCodes.set(code, { user: await findOrCreateUser(t.email), challenge: t.challenge });
      const target = new URL(t.redirectTo);
      target.searchParams.set("code", code);
      res.writeHead(303, { location: target.toString() });
      return res.end();
    }
    if (path === "/token" && url.searchParams.get("grant_type") === "pkce") {
      const b = await readBody(req);
      const pending = authCodes.get(b.auth_code);
      if (!pending)
        return send(res, 404, { error_code: "flow_state_not_found", msg: "invalid flow state" });
      // Like Supabase, the code is single-use whether or not the verifier matches.
      authCodes.delete(b.auth_code);
      const challenge = createHash("sha256")
        .update(b.code_verifier ?? "")
        .digest("base64url");
      if (challenge !== pending.challenge) {
        return send(res, 403, {
          error_code: "bad_code_verifier",
          msg: "code challenge does not match",
        });
      }
      return send(res, 200, session(pending.user));
    }
    if (path === "/verify") {
      // Typing the code from the email.
      const b = await readBody(req);
      if (!/^\d{6}$/.test(b.token ?? "")) {
        return send(res, 403, {
          code: 403,
          error_code: "otp_expired",
          msg: "Token has expired or is invalid",
        });
      }
      const email = b.email.toLowerCase();
      let { rows } = await db.query("select * from auth.users where email = $1", [email]);
      if (!rows.length) {
        ({ rows } = await db.query("insert into auth.users (email) values ($1) returning *", [
          email,
        ]));
      }
      return send(res, 200, session(rows[0]));
    }
    if (path === "/token" && url.searchParams.get("grant_type") === "refresh_token") {
      const u = refreshTokens.get((await readBody(req)).refresh_token);
      return u
        ? send(res, 200, session(u))
        : send(res, 400, { error_code: "refresh_token_not_found", msg: "Invalid Refresh Token" });
    }
    if (path === "/user") {
      const p = verify(req.headers.authorization?.slice(7));
      if (!p) return send(res, 401, { code: 401, error_code: "bad_jwt", msg: "invalid JWT" });
      const { rows } = await db.query("select * from auth.users where id = $1", [p.sub]);
      return rows.length
        ? send(res, 200, userJson(rows[0]))
        : send(res, 403, { error_code: "user_not_found", msg: "User not found" });
    }
    if (path === "/logout") return send(res, 204);
    send(res, 404, { msg: `test auth: ${req.method} ${path} isn't implemented` });
  })
  .listen(Number(PORT), () => console.log(`test Supabase on :${PORT}`));
