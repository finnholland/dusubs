// Shared helpers for the dictionary build scripts.
// Sources are streamed straight from the network (or a local file path), never saved to disk.

const fs = require('fs');
const path = require('path');
const https = require('https');
const zlib = require('zlib');
const readline = require('readline');

const VENDOR_DIR = path.join(__dirname, '..', '..', 'extension', 'vendor');

/** @param {string} url @returns {Promise<import('http').IncomingMessage>} */
function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'dusubs-build' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        resolve(httpsGet(res.headers.location));
        return;
      }
      if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode} for ${url}`)); return; }
      resolve(res);
    }).on('error', reject);
  });
}

/**
 * Opens an http(s) URL or a local file as a readable stream, gunzipping when `gzip` is set.
 * @param {string} src @param {{ gzip?: boolean }} [opts]
 */
async function openSource(src, { gzip = false } = {}) {
  const raw = /^https?:\/\//.test(src) ? await httpsGet(src) : fs.createReadStream(src);
  if (!gzip) return raw;
  const gunzip = zlib.createGunzip();
  raw.on('error', e => gunzip.destroy(e));
  return raw.pipe(gunzip);
}

/** Yields each parsed JSON line of a JSONL source, skipping blank or malformed lines. */
async function* jsonLines(src, opts) {
  const rl = readline.createInterface({ input: await openSource(src, opts), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    try { yield JSON.parse(line); } catch { /* skip malformed line */ }
  }
}

/** Writes `data` as extension/vendor/<name>.json.gz and logs its size. */
function writeVendorGzip(name, data) {
  fs.mkdirSync(VENDOR_DIR, { recursive: true });
  const outPath = path.join(VENDOR_DIR, `${name}.json.gz`);
  fs.writeFileSync(outPath, zlib.gzipSync(JSON.stringify(data), { level: 9 }));
  const mb = (fs.statSync(outPath).size / 1024 / 1024).toFixed(1);
  console.log(`Built ${path.basename(outPath)}: ${Object.keys(data).length} entries (${mb} MB gzipped)`);
}

module.exports = { httpsGet, openSource, jsonLines, writeVendorGzip };
