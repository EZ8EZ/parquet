// Cached, rate-limited Sleeper GET. Usage: const {get}=require('./fetch.cjs'); await get(url)
// Every response is cached to ./cache/<sanitized-url>.json with a .meta (status, bytes, fetchedAt).
const fs = require('fs'), path = require('path');
const DIR = process.env.LOCKIN_CACHE_DIR || path.join(__dirname, 'cache');
fs.mkdirSync(DIR, { recursive: true });
let last = 0;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
function key(url) { return url.replace(/^https?:\/\//, '').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 200); }
async function get(url, { refresh = false } = {}) {
  const f = path.join(DIR, key(url) + '.json');
  if (!refresh && fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8'));
  const wait = last + 220 - Date.now(); if (wait > 0) await sleep(wait); last = Date.now();
  const t0 = Date.now();
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  const txt = await res.text();
  fs.writeFileSync(f + '.meta', JSON.stringify({ url, status: res.status, bytes: txt.length, ms: Date.now() - t0, fetchedAt: new Date().toISOString(), lastModified: res.headers.get('last-modified'), cacheControl: res.headers.get('cache-control') }));
  if (!res.ok) throw new Error(url + ' -> ' + res.status);
  fs.writeFileSync(f, txt);
  return JSON.parse(txt);
}
module.exports = { get, key, DIR };
