// Fails the build when the app grows past its size budget (checked after `vite build`).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const BUDGET = {
  jsGzipKB: 170, // all JavaScript loaded on start, gzipped
  cssGzipKB: 16,
  precacheKB: 1100, // everything stored for offline use
};

const dist = 'dist';
const assets = join(dist, 'assets');
const files = readdirSync(assets);
const gz = (ext) =>
  files
    .filter((f) => f.endsWith(ext))
    .reduce((s, f) => s + gzipSync(readFileSync(join(assets, f))).length, 0) / 1024;

const sw = readFileSync(join(dist, 'sw.js'), 'utf8');
const precached = [...sw.matchAll(/url:"([^"]+)"/g)].map((m) => m[1]);
const precacheKB =
  precached.reduce((s, url) => {
    try {
      return s + statSync(join(dist, url)).size;
    } catch {
      return s;
    }
  }, 0) / 1024;

const rows = [
  ['JavaScript (gzip)', gz('.js'), BUDGET.jsGzipKB],
  ['CSS (gzip)', gz('.css'), BUDGET.cssGzipKB],
  ['Offline precache', precacheKB, BUDGET.precacheKB],
];
let ok = true;
for (const [name, kb, limit] of rows) {
  const pass = kb <= limit;
  ok &&= pass;
  console.log(`${pass ? 'ok  ' : 'OVER'} ${name}: ${Math.round(kb)} KB of ${limit} KB`);
}
if (!ok) {
  console.error('Size budget exceeded. See scripts/budget.mjs.');
  process.exit(1);
}
