// Fails the build when the app grows past its size budget (checked after `vite build`).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const BUDGET = {
  jsGzipKB: 160, // JavaScript loaded on start (the entry and what it preloads), gzipped (Drop 13)
  allJsGzipKB: 300, // every page's JavaScript, gzipped, apart from the language words
  languagesGzipKB: 80, // the Telugu and Hindi words, about 36 KB each; a device loads only its own (Drop 13)
  cssGzipKB: 16,
  precacheKB: 1300, // everything stored for offline use, apart from the language words
  languagesPrecacheKB: 320, // the Telugu and Hindi words, stored for offline use too (Drop 13)
};

const dist = 'dist';
const assets = join(dist, 'assets');
const files = readdirSync(assets);
const gzOf = (list) =>
  list.reduce((s, f) => s + gzipSync(readFileSync(join(assets, f))).length, 0) / 1024;
// The language words are chunks named after their language: te-<hash>.js and hi-<hash>.js.
const isLanguage = (f) => /^(te|hi)-[\w-]+\.js$/.test(f.split('/').pop());
const gz = (ext) => gzOf(files.filter((f) => f.endsWith(ext) && !isLanguage(f)));

// What the page loads on start: the module script plus every modulepreload link in index.html.
const html = readFileSync(join(dist, 'index.html'), 'utf8');
const startup = [
  ...html.matchAll(/<script[^>]+type="module"[^>]+src="[^"]*assets\/([^"]+\.js)"/g),
  ...html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="[^"]*assets\/([^"]+\.js)"/g),
].map((m) => m[1]);

const sw = readFileSync(join(dist, 'sw.js'), 'utf8');
const precached = [...sw.matchAll(/url:"([^"]+)"/g)].map((m) => m[1]);
const sizeKB = (urls) =>
  urls.reduce((s, url) => {
    try {
      return s + statSync(join(dist, url)).size;
    } catch {
      return s;
    }
  }, 0) / 1024;
const languageFiles = files.filter(isLanguage);
if (languageFiles.length !== 2) {
  console.error(
    `Expected the Telugu and Hindi chunks, found: ${languageFiles.join(', ') || 'none'}`,
  );
  process.exit(1);
}
const precacheKB = sizeKB(precached.filter((u) => !isLanguage(u)));
const languagesPrecacheKB = sizeKB(precached.filter(isLanguage));
if (new Set(precached).size !== precached.length) {
  console.error('The precache lists a file twice.');
  process.exit(1);
}

const rows = [
  ['JavaScript at start-up (gzip)', gzOf([...new Set(startup)]), BUDGET.jsGzipKB],
  ['All JavaScript (gzip)', gz('.js'), BUDGET.allJsGzipKB],
  ['Telugu and Hindi words (gzip)', gzOf(languageFiles), BUDGET.languagesGzipKB],
  ['CSS (gzip)', gz('.css'), BUDGET.cssGzipKB],
  ['Offline precache', precacheKB, BUDGET.precacheKB],
  ['Telugu and Hindi words, offline', languagesPrecacheKB, BUDGET.languagesPrecacheKB],
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
