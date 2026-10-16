// A local stand-in for a Supabase project, for end-to-end tests only.
// /rest/v1 is proxied to PostgREST (the same server Supabase uses); /auth/v1
// is a minimal fake of Supabase Auth where any 6-digit code signs you in.
import { createHmac, randomUUID } from "node:crypto";
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
    if (path === "/otp") return send(res, 200, {});
    if (path === "/verify") {
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
