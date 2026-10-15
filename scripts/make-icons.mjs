// Renders the app icon to PNGs with Playwright's Chromium.
// Run: node scripts/make-icons.mjs
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const icon = (size, pad) => `<!doctype html><html><body style="margin:0">
<div style="width:${size}px;height:${size}px;background:#1f57c3;display:flex;align-items:center;justify-content:center">
<svg width="${size - pad * 2}" height="${size - pad * 2}" viewBox="0 0 64 64" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
<path d="M10 30 32 12l22 18"/><path d="M16 26v26h32V26"/><path d="M25 38l5 5 10-11"/></svg></div></body></html>`;

const out = "public/icons";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, size, pad] of [
  ["icon-192.png", 192, 28],
  ["icon-512.png", 512, 76],
  ["icon-maskable-512.png", 512, 128],
  ["apple-touch-icon.png", 180, 26],
]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(icon(size, pad));
  await page.screenshot({ path: `${out}/${name}` });
}
await browser.close();
