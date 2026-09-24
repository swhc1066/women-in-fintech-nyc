/* Download every image the Wix archive references, before the site is deleted.
 *
 * The HTML archive at ~/Desktop/Projects/wix-archive-nycfintechwomen/ is 428MB
 * of markup and zero bytes of media: every image is still a live URL on
 * static.wixstatic.com. Post covers, in-body images and ~1,000 IFF honoree
 * headshots exist nowhere else. When the domain moves, those URLs may go with
 * it, so this runs while the old site is still up.
 *
 * Wix serves one asset under many URLs — /v1/fill/w_768,h_956,…/ is a
 * transform, not a different picture. Everything reduces to the id in the
 * first path segment after /media/, and requesting that id bare returns the
 * original at full resolution.
 *
 *   node tools/archive-media.mjs --scan      # count unique assets, download nothing
 *   node tools/archive-media.mjs             # download what is missing
 *
 * Resumable: a file already on disk with a non-zero size is skipped, so an
 * interrupted run is restarted by running it again.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const ARCHIVE = flag('archive', path.join(os.homedir(), 'Desktop/Projects/wix-archive-nycfintechwomen'));
const CONCURRENCY = Number(flag('concurrency', '8'));
const SCAN_ONLY = process.argv.includes('--scan');

const HTML_DIR = path.join(ARCHIVE, 'html');
const MEDIA_DIR = path.join(ARCHIVE, 'media');
const REPORT = path.join(ARCHIVE, 'media-report.json');

const TIMEOUT_MS = 60000;
const RETRIES = 3;

function flag(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

/* Every reference to a wixstatic asset, in any of the forms the archive uses:
   an <img src>, a data-pin-media, a srcset entry, or the bare `uri` inside the
   HTML-escaped JSON of data-image-info. */
const URL_RE = /static\.wixstatic\.com\/media\/([^/"'\s\\?&<>]+)/g;
const URI_RE = /&quot;uri&quot;:&quot;([^"&]+?~mv2\.\w+)&quot;/g;

/* Reject anything that could escape the media directory when used as a
   filename. Real ids look like 3b1c3b_e477ed3bd281467788df6868381b1345~mv2.png. */
function validId(id) {
  if (!id || id.length > 200) return false;
  if (id.includes('/') || id.includes('\\') || id.startsWith('.')) return false;
  return /^[\w.~%-]+$/.test(id);
}

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.name.endsWith('.html')) out.push(full);
  }
  return out;
}

function collectIds(files) {
  const ids = new Map();   // id -> number of files referencing it
  for (const file of files) {
    const html = fs.readFileSync(file, 'utf8');
    const seen = new Set();
    for (const re of [URL_RE, URI_RE]) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(html))) {
        let id;
        try {
          id = decodeURIComponent(m[1]);
        } catch {
          id = m[1];
        }
        if (validId(id)) seen.add(id);
      }
    }
    for (const id of seen) ids.set(id, (ids.get(id) || 0) + 1);
  }
  return ids;
}

async function download(id) {
  const dest = path.join(MEDIA_DIR, id);
  // Resume: a previous run already got this one.
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) return { id, status: 'skipped' };

  let lastError = 'unknown';
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
    try {
      // The bare id, with no /v1/… transform, is the untouched original.
      const res = await fetch(`https://static.wixstatic.com/media/${encodeURIComponent(id)}`, {
        signal: abort.signal,
        headers: { 'user-agent': 'nycfintechwomen-archive/1.0' }
      });
      if (!res.ok) {
        lastError = `http_${res.status}`;
        // 404 and 403 will not improve on retry; give up on them immediately.
        if (res.status === 404 || res.status === 403) break;
        throw new Error(lastError);
      }
      const buf = Buffer.from(await res.arrayBuffer());
      if (!buf.length) {
        lastError = 'empty_body';
        throw new Error(lastError);
      }
      // Write to a temp name first so an interrupted run never leaves a
      // truncated file that the next run would treat as complete.
      const tmp = dest + '.part';
      fs.writeFileSync(tmp, buf);
      fs.renameSync(tmp, dest);
      return { id, status: 'downloaded', bytes: buf.length };
    } catch (err) {
      lastError = abort.signal.aborted ? 'timeout' : (err.message || String(err));
      if (attempt < RETRIES) {
        await new Promise((r) => setTimeout(r, 400 * attempt * attempt));
      }
    } finally {
      clearTimeout(timer);
    }
  }
  return { id, status: 'failed', error: lastError };
}

async function pool(items, worker, size) {
  const results = [];
  let next = 0;
  let done = 0;
  const runners = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index]);
      done++;
      if (done % 50 === 0 || done === items.length) {
        process.stdout.write(`\r  ${done}/${items.length}`);
      }
    }
  });
  await Promise.all(runners);
  if (items.length) process.stdout.write('\n');
  return results;
}

async function main() {
  if (!fs.existsSync(HTML_DIR)) {
    console.error(`No archive HTML at ${HTML_DIR}`);
    console.error('Pass --archive <path> if the archive lives somewhere else.');
    process.exit(1);
  }

  const files = walk(HTML_DIR);
  console.log(`scanning ${files.length} archived pages…`);
  const ids = collectIds(files);
  console.log(`${ids.size} unique media assets referenced`);

  if (SCAN_ONLY) {
    const top = [...ids.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    console.log('\nmost-referenced:');
    for (const [id, count] of top) console.log(`  ${count.toString().padStart(4)}  ${id}`);
    const onDisk = fs.existsSync(MEDIA_DIR)
      ? fs.readdirSync(MEDIA_DIR).filter((f) => !f.endsWith('.part')).length
      : 0;
    console.log(`\n${onDisk} already downloaded, ${ids.size - onDisk} to go`);
    return;
  }

  fs.mkdirSync(MEDIA_DIR, { recursive: true });
  const list = [...ids.keys()];
  console.log(`downloading into ${MEDIA_DIR}`);
  const results = await pool(list, download, CONCURRENCY);

  const downloaded = results.filter((r) => r.status === 'downloaded');
  const skipped = results.filter((r) => r.status === 'skipped');
  const failed = results.filter((r) => r.status === 'failed');
  const bytes = downloaded.reduce((sum, r) => sum + (r.bytes || 0), 0);

  fs.writeFileSync(REPORT, JSON.stringify({
    ranAt: new Date().toISOString(),
    pagesScanned: files.length,
    uniqueAssets: ids.size,
    downloaded: downloaded.length,
    skipped: skipped.length,
    failed: failed.map((r) => ({ id: r.id, error: r.error })),
    bytes
  }, null, 2));

  console.log(`\ndownloaded ${downloaded.length}, skipped ${skipped.length}, failed ${failed.length}`);
  console.log(`${(bytes / 1024 / 1024).toFixed(1)} MB written`);
  console.log(`report: ${REPORT}`);

  if (failed.length) {
    console.log('\nfailures:');
    for (const r of failed.slice(0, 20)) console.log(`  ${r.error}  ${r.id}`);
    if (failed.length > 20) console.log(`  … and ${failed.length - 20} more, all listed in the report`);
    process.exitCode = 1;
  }
}

/* Only run when invoked directly. Importing this module — to reuse walk() or
   collectIds() from another tool, or from a test — must not start a 1.9GB
   download as a side effect. */
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
