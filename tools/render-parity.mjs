/* Prove lib/render-blocks.mjs still matches src/admin/templates.js.
 *
 * Two implementations of the same escaping pipeline exist on purpose, for now:
 * the build renders posts from data via lib/, and the admin still generates a
 * standalone post in the browser via templates.js. They must agree down to the
 * entity, or a post looks different depending on which one produced it.
 *
 * This goes away with templates.js when Phase 5 rewrites the editor to import
 * lib/ directly. Until then it is the thing standing between us and a silent
 * drift.
 *
 *   npm run verify:render
 *   node tools/render-parity.mjs --self-test    # prove the check has teeth
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SELF_TEST = process.argv.includes('--self-test');

/* templates.js is a browser IIFE that hangs its exports off `window`. Give it
   the two globals it touches and run it in a sandbox. */
function loadOriginal() {
  const src = fs.readFileSync(path.join(ROOT, 'src/admin/templates.js'), 'utf8');
  const sandbox = { window: {}, document: { createElement: () => ({ style: {} }) }, console };
  sandbox.window.window = sandbox.window;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  const T = sandbox.window.WIF_TEMPLATES || sandbox.WIF_TEMPLATES;
  if (!T) throw new Error('templates.js did not expose WIF_TEMPLATES');
  return T;
}

const STRINGS = [
  'plain text',
  "Shira Amrany's career began",
  "don't stop 'quoted' thing",
  'He said "hello" to "her"',
  'spaced -- dash and spaced — emdash',
  'ellipsis... here',
  'arrow -> there',
  'ampersand & <script>alert(1)</script>',
  '**bold** and *italic* and [link](https://example.com)',
  '[relative](fintech-female-fridays.html) and [bad](javascript:alert(1))',
  'query [x](https://e.com/?a=1&b=2)',
  /* URLs holding the characters the prose rewrites act on. Every one of these
     used to come out as a dead link: typo() rewrote the apostrophe, ellipsis
     and double hyphen inside the href, and the bold/italic pass turned a '*'
     in a path into an <em> in the middle of it. */
  "[apostrophe](https://e.com/o'brien)",
  '[ellipsis](https://e.com/a...b)',
  '[asterisks](https://e.com/a/*b*c/d)',
  '[double hyphen](https://e.com/a--b)',
  '[**bold label**](https://e.com/p) and [*em label*](https://e.com/q)',
  'Data & Analytics',
  "trailing apostrophe s' and 'leading",
  'mixed: don\'t -- "quote" ... -> end',
  'a'.repeat(400),
  'word '.repeat(80),
  ''
];

const URLS = [
  'https://x.com/a', 'mailto:a@b.co', '#anchor', 'images/a.jpg',
  'javascript:alert(1)', 'data:text/html,x', '//evil.com', 'a:b', ''
];

const BLOCKS = [
  { type: 'qa', q: "What's next?", a: 'One para.\n\nTwo -- para.' },
  { type: 'heading', text: 'A heading & more' },
  { type: 'paragraph', text: 'Body text...\n\nSecond' },
  { type: 'quote', text: 'Quoted "thing"', attrib: "Someone's name" },
  { type: 'image', src: 'images/x.jpg', alt: 'Alt & co', caption: "Cap's tion" },
  { type: 'image', src: 'javascript:alert(1)', alt: '', caption: '' },
  { type: 'list', items: ['one', '', 'two -> three'], ordered: false },
  { type: 'list', items: ['a'], ordered: true },
  { type: 'qa', q: '', a: '' },
  { type: 'unknown-type', text: 'ignored' }
];

function compare(T, lib, report) {
  let checks = 0;
  const check = (label, a, b, input) => {
    checks++;
    if (a !== b) report({ label, input, original: a, ported: b });
  };

  for (const s of STRINGS) {
    check('escText', T.escText(s), lib.escText(s), s);
    check('escAttr', T.escAttr(s), lib.escAttr(s), s);
    check('escPlain', T.escPlain(s), lib.escPlain(s), s);
    check('renderInline', T.renderInline(s), lib.renderInline(s), s);
    check('paragraphs', T.paragraphs(s), lib.paragraphs(s), s);
    check('makeExcerpt/155', T.makeExcerpt(s, 155), lib.makeExcerpt(s, 155), s);
    // No second argument: exercises the 240 default, which an explicit
    // max would hide.
    check('makeExcerpt/default', T.makeExcerpt(s), lib.makeExcerpt(s), s);
  }

  for (const u of URLS) check('safeUrl', T.safeUrl(u), lib.safeUrl(u), u);

  for (const b of BLOCKS) {
    check('renderBlocks:' + b.type, T.renderBlocks([b]), lib.renderBlocks([b]), JSON.stringify(b));
  }
  check('renderBlocks:all', T.renderBlocks(BLOCKS), lib.renderBlocks(BLOCKS), 'every block');
  check('renderBlocks:empty', T.renderBlocks([]), lib.renderBlocks([]), '[]');

  return checks;
}

/* Parity alone cannot catch a fault both copies share -- it did not catch the
   mangled hrefs above, because templates.js was ported from the same broken
   code. These assert the output itself, and they belong with whatever replaces
   this file when Phase 5 retires templates.js. */
const LINK_INTEGRITY = [
  "https://e.com/o'brien",
  'https://e.com/a...b',
  'https://e.com/a/*b*c/d',
  'https://e.com/a--b',
  'https://e.com/s?a=1&b=2'
];

function checkLinks(lib) {
  const failures = [];
  for (const url of LINK_INTEGRITY) {
    const href = (lib.renderInline(`[x](${url})`).match(/href="([^"]*)"/) || [])[1] || '';
    /* The href is escaped for an attribute, so compare against the same
       escaping rather than the raw URL -- & is legitimately &amp; in there. */
    if (href !== lib.escAttr(url)) failures.push({ url, href });
  }
  return failures;
}

async function main() {
  const T = loadOriginal();
  const lib = await import(path.join(ROOT, 'lib/render-blocks.mjs'));

  if (SELF_TEST) {
    // A harness that has never reported a difference is not a harness. Break
    // one function and confirm the comparison notices.
    const broken = { ...lib, escText: (s) => lib.escText(s).replace(/&rsquo;/g, "'") };
    let caught = 0;
    compare(T, broken, () => caught++);
    if (!caught) {
      console.error('SELF-TEST FAILED: a broken escText was not detected');
      process.exit(1);
    }
    console.log(`self-test passed — ${caught} differences detected in a deliberately broken renderer`);
    return;
  }

  const brokenLinks = checkLinks(lib);
  for (const f of brokenLinks) {
    console.log(`\nMANGLED URL  ${f.url}`);
    console.log('  rendered href:', f.href);
  }

  const diffs = [];
  const checks = compare(T, lib, (d) => diffs.push(d));

  for (const d of diffs) {
    console.log(`\nMISMATCH ${d.label}  input: ${JSON.stringify(d.input).slice(0, 120)}`);
    console.log('  templates.js     :', JSON.stringify(d.original).slice(0, 200));
    console.log('  render-blocks.mjs:', JSON.stringify(d.ported).slice(0, 200));
  }

  if (diffs.length || brokenLinks.length) {
    if (diffs.length) console.log(`\n${diffs.length} of ${checks} checks differ`);
    if (brokenLinks.length) console.log(`${brokenLinks.length} URLs mangled by the inline renderer`);
    process.exit(1);
  }
  console.log(`render parity: ${checks} checks, all identical`);
  console.log(`link integrity: ${LINK_INTEGRITY.length} URLs survive rendering intact`);
}

main();
