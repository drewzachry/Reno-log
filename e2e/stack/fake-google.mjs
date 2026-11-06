// A local stand-in for Google's ID token issuer, for end-to-end tests only.
// Generates a throwaway RSA keypair at startup, serves it as a JWKS at
// /oauth2/v3/certs (the same path src/lib/google/verify.ts points
// GOOGLE_JWKS_URL at in tests), and signs a real, verifiable ID token for
// whatever email the test asks for at /sign. The app's own server-side
// verification (signature, issuer, audience, expiry) runs unmodified against
// this — only the key material and the browser-side popup are faked, not the
// verification itself.
import { createHash, randomUUID } from "node:crypto";
import http from "node:http";
import { SignJWT, exportJWK, generateKeyPair } from "jose";

const { PORT = "54323", GOOGLE_CLIENT_ID = "e2e-google-client-id" } = process.env;

const { publicKey, privateKey } = await generateKeyPair("RS256", { extractable: true });
const kid = randomUUID();
const jwk = { ...(await exportJWK(publicKey)), kid, alg: "RS256", use: "sig" };

const send = (res, status, obj) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(obj));
};

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, "http://local");
    if (url.pathname === "/oauth2/v3/certs") return send(res, 200, { keys: [jwk] });
    if (url.pathname === "/sign") {
      const email = url.searchParams.get("email");
      if (!email) return send(res, 400, { error: "email required" });
      const name = url.searchParams.get("name") || null;
      // Deterministic per email, like a real Google account id would be.
      const sub = createHash("sha256").update(email).digest("hex").slice(0, 21);
      const idToken = await new SignJWT({ email, name, picture: null })
        .setProtectedHeader({ alg: "RS256", kid })
        .setSubject(sub)
        .setIssuer("https://accounts.google.com")
        .setAudience(GOOGLE_CLIENT_ID)
        .setIssuedAt()
        .setExpirationTime("1h")
        .sign(privateKey);
      return send(res, 200, { idToken });
    }
    send(res, 404, { error: `fake google: ${req.method} ${url.pathname} isn't implemented` });
  })
  .listen(Number(PORT), () => console.log(`fake google on :${PORT}`));
