// Fails the build when the app grows past its size budget (checked after `vite build`).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const BUDGET = {
  jsGzipKB: 170, // JavaScript loaded on start (the entry and what it preloads), gzipped
  allJsGzipKB: 300, // every page's JavaScript, gzipped
  cssGzipKB: 16,
  precacheKB: 1300, // everything stored for offline use (raised from 1,100 in Drop 10)
};

const dist = 'dist';
const assets = join(dist, 'assets');
const files = readdirSync(assets);
const gzOf = (list) =>
  list.reduce((s, f) => s + gzipSync(readFileSync(join(assets, f))).length, 0) / 1024;
const gz = (ext) => gzOf(files.filter((f) => f.endsWith(ext)));

// What the page loads on start: the module script plus every modulepreload link in index.html.
const html = readFileSync(join(dist, 'index.html'), 'utf8');
const startup = [
  ...html.matchAll(/<script[^>]+type="module"[^>]+src="[^"]*assets\/([^"]+\.js)"/g),
  ...html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="[^"]*assets\/([^"]+\.js)"/g),
].map((m) => m[1]);

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
  ['JavaScript at start-up (gzip)', gzOf([...new Set(startup)]), BUDGET.jsGzipKB],
  ['All JavaScript (gzip)', gz('.js'), BUDGET.allJsGzipKB],
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
