// A local stand-in for a Supabase project, for end-to-end tests only.
// /rest/v1 is proxied to PostgREST (the same server Supabase uses); /auth/v1
// is a minimal fake of Supabase Auth where any 6-digit code signs you in.
import { createHash, createHmac, randomUUID } from "node:crypto";
import http from "node:http";
import pg from "pg";

const { DATABASE_URL, JWT_SECRET, PORT = "54321", POSTGREST_PORT = "54322" } = process.env;
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
const send = (res, status, obj) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(obj === undefined ? "" : JSON.stringify(obj));
};

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, "http://local");
    if (url.pathname.startsWith("/rest/v1")) {
      const headers = { ...req.headers, host: `localhost:${POSTGREST_PORT}` };
      // The publishable key isn't a JWT; without a user token, PostgREST uses the anon role.
      if (!verify(headers.authorization?.slice(7))) delete headers.authorization;
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
