# Post Editor Round-Trip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The editor reads and writes the post-file format, one renderer exists, and the post cards render from the posts collection instead of pasted markup.

**Architecture:** A new `lib/post-file.mjs` owns the post file in both directions and is imported by the Wix importer, the tests and the browser. `src/admin/` becomes ES modules importing `/lib/render-blocks.mjs` from the build output, which lets `src/admin/templates.js` — the second renderer and the last copy of the site chrome — be deleted along with the parity harness that existed only to watch it. Cards move into a Nunjucks macro fed by `collections.fff`.

**Tech Stack:** Node 22, Eleventy 3, Nunjucks, plain ES modules, `node --test`. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-25-post-editor-round-trip-design.md`

## Global Constraints

- ES modules everywhere (`import`/`export`), never CommonJS. 2-space indent.
- **No new dependencies.** `node --test` is built in; the parser is hand-written on purpose.
- Node 22.x (`package.json` `engines`).
- The seven post pages in `_site/` must stay **byte-identical** through every task except where a task says otherwise in writing.
- `node tools/import-wix-post.mjs --all` must keep reproducing `src/posts/` byte-identically.
- Comments explain WHY, never WHAT. Match the density of the surrounding files.
- Errors surface in terms an author can act on: no stack traces as the primary message, no silent recovery.
- The editor runs over http (deployed `/admin`, or `npm run dev`). `file://` support ends in Task 7 and the README must say so.

## Review Focus

Input classes the spec implies but no happy-path test exercises. Each has a test assigned to the task that owns the code.

1. **A file saved with CRLF endings or a UTF-8 BOM** — an author's machine, a round-trip through Windows or a text editor. `parsePost` must read it, not fail on `\r` or a leading `﻿`. → Task 2.
2. **Body text containing `---` at the start of a line** — a legitimate thing to write in a post, and the front-matter delimiter. It must not truncate the file on write or end the front matter on read. → Task 2.
3. **Text holding a double quote, a backslash, or a trailing space** — `JSON.stringify` escapes on the way out; the parser must unescape exactly, and a trailing space must not change meaning inside a `|-` block. → Task 2.
4. **Two posts with the same slug** — both want one permalink. The build must fail naming both files rather than letting one silently overwrite the other, because nobody will be watching. → Task 4.
5. **Emoji and non-ASCII in a value** — Meitar's post already contains `😉`, and D'aundra's name carries an apostrophe. These must survive serialize → parse → serialize unchanged. → Task 2.

---

## Task 1: `lib/post-file.mjs` — serializing a post

**Files:**
- Create: `lib/post-file.mjs`
- Create: `tools/post-file.test.mjs`
- Modify: `package.json` (add the `test` script)

**Interfaces:**
- Consumes: nothing.
- Produces: `serializePost(post) -> string`. Emits the front-matter file exactly as `tools/import-wix-post.mjs` emits it today, so the seven existing files are reproduced byte for byte.

- [ ] **Step 1: Add the test script**

In `package.json`, add to `scripts`:

```json
"test": "node --test tools/"
```

- [ ] **Step 2: Write the failing test**

Create `tools/post-file.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { serializePost } from '../lib/post-file.mjs';

test('serializes a minimal post', () => {
  const text = serializePost({
    name: 'Shira Amrany',
    slug: 'shira-amrany',
    title: 'FinTech Female Fridays: Meet Shira Amrany',
    tag: 'Fintech Female Fridays',
    role: 'Data & Analytics',
    company: 'Indagari',
    linkedin: '',
    author: 'Manvir Singh',
    displayDate: 'Jul 10',
    isoDate: '2026-07-10',
    readTime: '4 min',
    coverPath: 'images/fff-shira-amrany.jpg',
    intro: 'One line.',
    blocks: []
  });
  assert.ok(text.startsWith('---\n'));
  assert.ok(text.endsWith('---\n'));
  assert.match(text, /^name: "Shira Amrany"$/m);
  assert.match(text, /^slug: shira-amrany$/m);
  assert.match(text, /^role: "Data & Analytics"$/m);
});

test('a multi-line value becomes a literal block, indented, never trailing space', () => {
  const text = serializePost({ slug: 's', intro: 'One.\n\nTwo. ', blocks: [] });
  assert.match(text, /^intro: \|-\n  One\.\n\n  Two\.$/m);
});

test('every block type round-trips through the emitter', () => {
  const text = serializePost({
    slug: 's',
    intro: 'i',
    blocks: [
      { type: 'qa', q: 'Q?', a: 'A one.\n\nA two.' },
      { type: 'heading', text: 'H' },
      { type: 'paragraph', text: 'P' },
      { type: 'quote', text: 'Quoted', attrib: 'Someone' },
      { type: 'image', src: 'images/x.jpg', alt: 'Alt' },
      { type: 'list', ordered: false, items: ['one', 'two'] }
    ]
  });
  assert.match(text, /^ {2}- type: qa$/m);
  assert.match(text, /^ {4}a: \|-\n {6}A one\.\n\n {6}A two\.$/m);
  assert.match(text, /^ {4}ordered: false$/m);
  assert.match(text, /^ {6}- "one"$/m);
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../lib/post-file.mjs'`

- [ ] **Step 4: Write `lib/post-file.mjs`**

Move `yamlValue` and `yamlBlocks` out of `tools/import-wix-post.mjs` verbatim (they are correct and already produce the committed files), and add the front-matter assembly currently inlined in `importPost`:

```js
/* The post file, both directions.
 *
 * src/posts/<slug>.html is front matter and nothing else. This module is the
 * only thing that writes that format and the only thing that reads it, so the
 * two cannot drift: the Wix importer, the tests and the browser editor all
 * come through here.
 */

/* The order keys are written in. Fixed, so that a file rewritten by the editor
   diffs against the importer's output in the content and nowhere else. */
const FIELD_ORDER = [
  'name', 'slug', 'type', 'title', 'tag', 'role', 'company', 'cardTag',
  'linkedin', 'author', 'displayDate', 'isoDate', 'readTime', 'gradient',
  'coverPath', 'excerpt', 'metaDescription', 'ogTitle', 'ogImage', 'intro'
];

/* Keys written as bare scalars rather than quoted, matching the files already
   committed. Everything else goes out as a JSON string, which is valid YAML. */
const BARE = new Set(['slug', 'type', 'tag', 'coverPath', 'gradient']);

/* JSON string syntax is valid YAML, so single-line values go out as-is.
   Anything with a newline becomes a literal block, which has no escaping to
   get wrong -- but only if every line is indented and none trails a space. */
export function yamlValue(value, indent) {
  const s = String(value == null ? '' : value);
  if (!s.includes('\n')) return JSON.stringify(s);
  const pad = ' '.repeat(indent);
  const lines = s.split('\n').map((line) => line.replace(/\s+$/, ''));
  return '|-\n' + lines.map((line) => (line ? pad + line : '')).join('\n');
}

export function yamlBlocks(blocks) {
  return (blocks || [])
    .map((b) => {
      const lines = [`  - type: ${b.type}`];
      for (const [key, val] of Object.entries(b)) {
        if (key === 'type') continue;
        if (key === 'items') {
          lines.push('    items:');
          val.forEach((item) => lines.push(`      - ${yamlValue(item, 0)}`));
        } else if (typeof val === 'boolean') {
          lines.push(`    ${key}: ${val}`);
        } else {
          lines.push(`    ${key}: ${yamlValue(val, 6)}`);
        }
      }
      return lines.join('\n');
    })
    .join('\n');
}

export function serializePost(post) {
  const lines = ['---'];
  for (const key of FIELD_ORDER) {
    if (post[key] === undefined) continue;
    const indent = key === 'intro' || key === 'excerpt' ? 2 : 0;
    lines.push(`${key}: ${BARE.has(key) ? post[key] : yamlValue(post[key], indent)}`);
  }
  lines.push('blocks:');
  lines.push(yamlBlocks(post.blocks));
  lines.push('---');
  lines.push('');
  return lines.join('\n');
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test`
Expected: PASS, 3 tests.

- [ ] **Step 6: Commit**

```bash
git add lib/post-file.mjs tools/post-file.test.mjs package.json
git commit -m "Give the post file one writer"
```

---

## Task 2: `parsePost` — reading a post file back

**Files:**
- Modify: `lib/post-file.mjs`
- Modify: `tools/post-file.test.mjs`

**Interfaces:**
- Consumes: `serializePost` from Task 1.
- Produces: `parsePost(text) -> post`. Throws `Error` with a message naming the line on anything outside the emitted subset.

- [ ] **Step 1: Write the failing tests**

Append to `tools/post-file.test.mjs`:

```js
import { parsePost } from '../lib/post-file.mjs';

const FULL = {
  name: "D'aundra Lewis",
  slug: 'daundra-lewis',
  type: 'fff',
  title: 'FinTech Female Fridays: Meet D\'aundra Lewis',
  tag: 'Fintech Female Fridays',
  role: 'Compliance',
  company: 'Financial Crime',
  linkedin: 'https://www.linkedin.com/in/daundralewis/',
  author: 'Manvir Singh',
  displayDate: 'Jul 3',
  isoDate: '2026-07-03',
  readTime: '5 min',
  gradient: 'g1',
  coverPath: 'images/fff-daundra-lewis.jpg',
  intro: 'A line.\n\nAnother "quoted" line.',
  blocks: [
    { type: 'qa', q: 'Q?', a: 'One.\n\nTwo.' },
    { type: 'heading', text: 'More about D\'aundra' },
    { type: 'list', ordered: false, items: ['6:00am Wakeup', 'a "quoted" item'] },
    { type: 'image', src: 'images/x.jpg', alt: '' }
  ]
};

test('round trips a full post', () => {
  assert.deepEqual(parsePost(serializePost(FULL)), FULL);
});

test('round trips emoji and non-ASCII', () => {
  const post = { slug: 's', intro: 'Reels (not TikTok -- grown-up 😉)', blocks: [] };
  assert.deepEqual(parsePost(serializePost(post)), post);
});

test('a line of three dashes inside the body does not end the front matter', () => {
  const post = { slug: 's', intro: 'Before.\n\n---\n\nAfter.', blocks: [] };
  assert.deepEqual(parsePost(serializePost(post)), post);
});

test('reads a file with CRLF endings and a BOM', () => {
  const text = '﻿' + serializePost(FULL).replace(/\n/g, '\r\n');
  assert.deepEqual(parsePost(text), FULL);
});

test('a trailing space in a value does not survive as meaning', () => {
  const post = { slug: 's', intro: 'Line one. \n\nLine two.', blocks: [] };
  assert.equal(parsePost(serializePost(post)).intro, 'Line one.\n\nLine two.');
});

test('refuses a file it does not understand, naming the line', () => {
  const bad = '---\nslug: s\nweird: [1, 2]\nblocks:\n---\n';
  assert.throws(() => parsePost(bad), /line 3/);
});

test('refuses a file with no front matter', () => {
  assert.throws(() => parsePost('<html></html>'), /front matter/i);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `parsePost is not a function`.

- [ ] **Step 3: Implement `parsePost`**

Append to `lib/post-file.mjs`:

```js
/* Reads only what serializePost writes: quoted scalars, bare scalars, `|-`
   literal blocks, and the blocks list. It is not a YAML implementation and
   must not grow into one -- anything outside the subset is an error naming the
   line, because a post that half-parses would be written back with the missing
   half silently gone. */
export function parsePost(text) {
  const raw = String(text).replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const match = raw.match(/^---\n([\s\S]*?)\n---\s*$/);
  if (!match) throw new Error('No front matter found: a post file starts and ends with ---');

  const lines = match[1].split('\n');
  const post = {};
  let blocks = null;   // non-null once `blocks:` has been seen
  let i = 0;

  /* A literal block runs until a line that is neither blank nor indented past
     the key that opened it. */
  const readLiteral = (indent) => {
    const pad = indent + 2;
    const out = [];
    while (i < lines.length) {
      const line = lines[i];
      if (line.trim() && !line.startsWith(' '.repeat(pad))) break;
      out.push(line.trim() ? line.slice(pad) : '');
      i++;
    }
    while (out.length && !out[out.length - 1]) out.pop();
    return out.join('\n');
  };

  const readScalar = (rest, indent, lineNo) => {
    if (rest === '|-') return readLiteral(indent);
    if (rest === 'true') return true;
    if (rest === 'false') return false;
    if (rest.startsWith('"')) {
      try {
        return JSON.parse(rest);
      } catch {
        throw new Error(`Could not read the value on line ${lineNo}`);
      }
    }
    if (/^[[{]/.test(rest)) throw new Error(`Unsupported value on line ${lineNo}`);
    return rest;
  };

  while (i < lines.length) {
    const lineNo = i + 1;
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    const top = line.match(/^([a-zA-Z]+):\s*(.*)$/);
    if (top && blocks === null) {
      const [, key, rest] = top;
      i++;
      if (key === 'blocks') { blocks = []; continue; }
      post[key] = readScalar(rest, 0, lineNo);
      continue;
    }

    const item = line.match(/^ {2}- type:\s*(.*)$/);
    if (item && blocks) {
      blocks.push({ type: item[1].trim() });
      i++;
      continue;
    }

    const field = line.match(/^ {4}([a-zA-Z]+):\s*(.*)$/);
    if (field && blocks && blocks.length) {
      const [, key, rest] = field;
      i++;
      const block = blocks[blocks.length - 1];
      if (key === 'items') {
        block.items = [];
        while (i < lines.length) {
          const entry = lines[i].match(/^ {6}- (.*)$/);
          if (!entry) break;
          block.items.push(readScalar(entry[1], 6, i + 1));
          i++;
        }
        continue;
      }
      block[key] = readScalar(rest, 4, lineNo);
      continue;
    }

    throw new Error(`Could not read line ${lineNo}: ${line.trim().slice(0, 60)}`);
  }

  post.blocks = blocks || [];
  return post;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS. If the `---`-in-body test fails, the fix belongs in `serializePost`, not the parser: the body must be indented inside a `|-` block, so a bare `---` cannot occur at column 0.

- [ ] **Step 5: Add the real-file tests**

Append:

```js
import fs from 'node:fs';
import path from 'node:path';

const POSTS = fs.readdirSync('src/posts').filter((f) => f.endsWith('.html'));

test('every committed post parses and re-serializes byte-identically', () => {
  assert.ok(POSTS.length >= 7, 'expected the migrated posts to be present');
  for (const file of POSTS) {
    const original = fs.readFileSync(path.join('src/posts', file), 'utf8');
    assert.equal(serializePost(parsePost(original)), original, file);
  }
});
```

- [ ] **Step 6: Cross-check against the reader the build actually uses**

Our parser is not the one Eleventy uses, and the build is what ships. If the
two disagree about a value, the editor would show one thing and the site would
publish another. Append:

```js
import matter from 'gray-matter';

/* gray-matter is what Eleventy reads front matter with; it arrives as an
   Eleventy dependency, not one of ours. If these two ever disagree about a
   value, the editor is showing something the site will not publish. */
test('parsePost agrees with the reader the build uses', () => {
  for (const file of POSTS) {
    const text = fs.readFileSync(path.join('src/posts', file), 'utf8');
    const theirs = matter(text).data;
    const ours = parsePost(text);
    for (const key of Object.keys(theirs)) {
      assert.deepEqual(ours[key], theirs[key], `${file}: ${key}`);
    }
  }
});
```

If `gray-matter` cannot be imported, check what Eleventy 3 resolves it to
before reaching for a dependency — it must come from the existing tree, since
this plan adds none.

- [ ] **Step 7: Run and commit**

Run: `npm test`
Expected: PASS.

```bash
git add lib/post-file.mjs tools/post-file.test.mjs
git commit -m "Read the post file back, or say which line stopped us"
```

---

## Task 3: The importer uses the shared writer

**Files:**
- Modify: `tools/import-wix-post.mjs` (delete `yamlValue`, `yamlBlocks` and the front-matter assembly in `importPost`; import from `lib/post-file.mjs`)

**Interfaces:**
- Consumes: `serializePost` from Task 1.
- Produces: no new interface. The importer's output must not move.

- [ ] **Step 1: Record the current output**

```bash
cp -r src/posts /tmp/posts-before
```

- [ ] **Step 2: Replace the emitter with the import**

In `tools/import-wix-post.mjs`: delete `yamlValue` and `yamlBlocks`, add
`import { serializePost } from '../lib/post-file.mjs';`, and replace the
`frontMatter` array assembly in `importPost` with:

```js
  const frontMatter = serializePost({
    name,
    slug: entry.slug,
    title: toSourceText(title),
    tag: 'Fintech Female Fridays',
    role: entry.role,
    company: entry.company,
    linkedin,
    author,
    displayDate,
    isoDate,
    readTime,
    coverPath: `images/fff-${entry.slug}.jpg`,
    intro,
    blocks
  });
```

- [ ] **Step 3: Verify the output did not move**

```bash
node tools/import-wix-post.mjs --all && diff -r /tmp/posts-before src/posts && echo IDENTICAL
```
Expected: `IDENTICAL`. Any diff means the shared writer does not match the emitter it replaced — fix `serializePost`, not the posts.

- [ ] **Step 4: Run the tests and commit**

Run: `npm test`

```bash
git add tools/import-wix-post.mjs
git commit -m "Point the importer at the shared post writer"
```

---

## Task 4: The fields the cards need

**Files:**
- Modify: `tools/import-wix-post.mjs` (the `POSTS` manifest and the `serializePost` call)
- Modify: `src/posts/*.html` (regenerated)
- Modify: `src/posts/posts.11tydata.js` (derive `tags` from `type`; fail on a duplicate slug)
- Modify: `tools/post-file.test.mjs`

**Interfaces:**
- Consumes: `serializePost`, `parsePost`.
- Produces: every post file carries `type: fff`, a `gradient`, and — where the card text is not derivable — `excerpt` and `cardTag`.

**Why `cardTag` exists:** the featured card reads `Data &middot; Indagari` while Shira's post data says role `Data & Analytics`. Her role renders in the post page byline, so it cannot be changed to match. The card needs its own optional override, defaulting to `role · company`.

- [ ] **Step 1: Extend the manifest**

In `tools/import-wix-post.mjs`, add `gradient` to every `POSTS` entry in the order the grid uses today — `daundra-lewis: g1`, `adina-fischer: g2`, `alessia-russo: g3`, `meitar-landau: g4`, `samantha-lassoff: g5`, `mor-grisariu: g6`, and `shira-amrany: g7` (featured, so its gradient is unused today but must exist for when it moves into the grid). Add to the two entries whose card copy is not derivable:

```js
  {
    slug: 'shira-amrany',
    file: 'fintech-female-fridays-meet-shira-amrany.html',
    role: 'Data & Analytics',
    company: 'Indagari',
    gradient: 'g7',
    /* The featured card says "Data · Indagari", not the role that renders in
       the byline. Card copy the archive cannot supply lives here. */
    cardTag: 'Data · Indagari'
  },
```

```js
  {
    slug: 'samantha-lassoff',
    file: 'fintech-female-fridays-meet-samantha-lassoff-executive-coach-leadership-advisor.html',
    role: 'Executive Coach',
    company: 'Leadership',
    gradient: 'g5',
    /* Her card opens "Samantha Lassoff works with founders…" while her intro
       opens "…is an executive coach and leadership advisor who works with…".
       Not derivable, so it is stated. */
    excerpt: 'Samantha Lassoff works with founders, CEOs, and senior operators navigating complex decisions, growth, and the demands of scale. Her career spans financial services, fintech, and high-growth companies, and her work focuses on helping leaders operate with greater clarity, stronger judgment, and more intentional impact.'
  },
```

Pass them through in the `serializePost` call: `type: 'fff'`, `gradient: entry.gradient`, `cardTag: entry.cardTag`, `excerpt: entry.excerpt`.

- [ ] **Step 2: Regenerate and check the diff is only the new keys**

```bash
node tools/import-wix-post.mjs --all
git diff --stat src/posts
git diff src/posts | grep '^[-+]' | grep -v '^[-+][-+]' | grep -v '^+type:\|^+gradient:\|^+cardTag:\|^+excerpt:'
```
Expected: the last command prints nothing. Anything else means a field moved that should not have.

- [ ] **Step 3: Write the failing build tests**

Append to `tools/post-file.test.mjs`:

```js
test('every post declares a type and a gradient', () => {
  for (const file of POSTS) {
    const post = parsePost(fs.readFileSync(path.join('src/posts', file), 'utf8'));
    assert.equal(post.type, 'fff', `${file} type`);
    assert.match(post.gradient, /^g[1-7]$/, `${file} gradient`);
  }
});

test('slugs are unique, because two posts cannot share one permalink', () => {
  const slugs = POSTS.map((f) => parsePost(fs.readFileSync(path.join('src/posts', f), 'utf8')).slug);
  assert.equal(new Set(slugs).size, slugs.length, `duplicate slug among: ${slugs.join(', ')}`);
});
```

- [ ] **Step 4: Make the build itself refuse a duplicate slug**

In `src/posts/posts.11tydata.js`, replace the hard-coded `tags: 'fff'` with a
derivation from `type`, and add the guard. Nobody is watching this build after
handoff, so a collision has to stop it rather than silently drop a post:

```js
  eleventyComputed: {
    /* A post joins the collection for its own type, so a second type needs no
       change here. */
    tags: (data) => data.type || 'fff',

    /* Two posts with one slug would write one file and lose the other. There
       is no one to notice that after handoff, so it fails the build instead. */
    permalink: (data) => {
      const seen = (globalThis.__postSlugs ||= new Map());
      const previous = seen.get(data.slug);
      const here = data.page.inputPath;
      if (previous && previous !== here) {
        throw new Error(`Two posts share the slug "${data.slug}": ${previous} and ${here}`);
      }
      seen.set(data.slug, here);
      return `fff-${data.slug}.html`;
    }
  }
```

- [ ] **Step 5: Verify the build output did not move**

```bash
cp -r _site /tmp/site-before && npm run build && diff -r /tmp/site-before _site && echo IDENTICAL
```
Expected: `IDENTICAL` — the new fields feed the cards in Task 6 and must change nothing yet.

- [ ] **Step 6: Run the tests and commit**

Run: `npm test && npm run verify:render`

```bash
git add tools/import-wix-post.mjs src/posts tools/post-file.test.mjs
git commit -m "Give posts the fields their cards need"
```

---

## Task 5: One copy of the article CSS

**Files:**
- Create: `src/_includes/post-article.css`
- Modify: `src/_includes/post.njk:30-82` (replace the inline CSS with an include)
- Modify: `eleventy.config.js` (passthrough copy so the preview can load it)

**Interfaces:**
- Consumes: nothing.
- Produces: `/post-article.css` in the build output, for Task 7's preview iframe.

**Why:** the preview needs the article CSS, and `templates.js` currently holds a second copy of it (`POST_PAGE_CSS`, flagged in `post.njk`'s own header comment). Including one file into the page keeps the built output identical while making the same bytes fetchable.

- [ ] **Step 1: Move the CSS into an include**

Cut the contents between `<style>` and `</style>` in `src/_includes/post.njk`
into `src/_includes/post-article.css`, and leave behind:

```njk
<style>
{% include "post-article.css" %}
</style>
```

- [ ] **Step 2: Serve the same file for the editor preview**

In `eleventy.config.js`, next to the other passthrough copies:

```js
  /* The post body's CSS, served as a file so the editor preview can load the
     same bytes the page inlines. */
  eleventyConfig.addPassthroughCopy({ 'src/_includes/post-article.css': 'post-article.css' });
```

- [ ] **Step 3: Verify the post pages did not move**

```bash
cp -r _site /tmp/site-before && npm run build && diff -r /tmp/site-before _site --brief
```
Expected: the only new file is `_site/post-article.css`. If a post page differs, the include added or lost a newline — adjust the include line, not the CSS.

- [ ] **Step 4: Commit**

```bash
git add src/_includes/post-article.css src/_includes/post.njk eleventy.config.js
git commit -m "Keep the article CSS in one file the preview can load too"
```

---

## Task 6: Cards from the collection

**Files:**
- Create: `src/_includes/post-card.njk`
- Modify: `src/fintech-female-fridays.html:77-95`
- Modify: `src/index.html:338-352`

**Interfaces:**
- Consumes: `collections.fff`, and the `gradient` / `excerpt` / `cardTag` fields from Task 4.
- Produces: three macros — `featured(post)`, `grid(post)`, `home(post)`.

- [ ] **Step 1: Build the card's view model in the renderer**

The cards carry typographic entities today — `D&rsquo;aundra`, `&mdash;`,
`&amp;` — because they were written by the same pipeline the post pages use.
Nunjucks autoescaping would print `D&#39;aundra` instead, so the macros must
receive values that are already escaped and print them with `| safe`, exactly
as `post.njk` does with `buildPostView`.

Add to `lib/render-blocks.mjs`, beside `buildPostView`:

```js
/* Everything a card prints, escaped for the context it is printed in. The
   cards and the post page share one pipeline, so a name is typeset the same
   way in both -- and a card is never a place where markup can be introduced by
   a post's text. */
export function buildCardView(post) {
  const cover = coverPath(post);
  const tagLine = String(post.cardTag || '').trim() ||
    [post.role, post.company].map((p) => String(p == null ? '' : p).trim()).filter(Boolean).join(' · ');
  const excerpt = String(post.excerpt || '').trim() || makeExcerpt(post.intro, 240);
  return {
    href: postFilename(post),
    coverAttr: escAttr(cover),
    nameAttr: escAttr(post.name),
    gradient: escAttr(post.gradient || 'g1'),
    tagHtml: escText(tagLine),
    titleHtml: escText(post.title),
    excerptHtml: escText(excerpt),
    authorHtml: escText(post.author),
    dateHtml: escText(post.displayDate),
    readTimeHtml: escText(post.readTime)
  };
}
```

- [ ] **Step 2: Test it against the cards that exist**

Append to `tools/post-file.test.mjs`:

```js
import { buildCardView } from '../lib/render-blocks.mjs';

test('a card typesets the way the post page does', () => {
  const card = buildCardView(parsePost(fs.readFileSync('src/posts/daundra-lewis.html', 'utf8')));
  assert.equal(card.href, 'fff-daundra-lewis.html');
  assert.match(card.titleHtml, /D&rsquo;aundra/);
  assert.ok(!card.excerptHtml.includes(' -- '), 'dashes are typeset');
});

test('cardTag overrides the role line, because one card does not use the role', () => {
  const shira = parsePost(fs.readFileSync('src/posts/shira-amrany.html', 'utf8'));
  assert.equal(buildCardView(shira).tagHtml, 'Data · Indagari');
  assert.notEqual(buildCardView(shira).tagHtml, 'Data & Analytics · Indagari');
});
```

Run `npm test`; expect PASS.

- [ ] **Step 3: Write the macros**

Create `src/_includes/post-card.njk`. Every value is pre-escaped by
`buildCardView`, so every one prints with `| safe`:

```njk
{# The post cards. One definition per placement, fed by collections.fff, so a
   new post reaches both pages by existing rather than by being pasted.
   Values arrive escaped from buildCardView -- printing them any other way
   would double-escape "Data & Analytics" into "Data &amp;amp; Analytics". #}

{% macro featured(card) %}
    <a class="feature" href="{{ card.href | safe }}">
      <div class="feature-img"><span class="star">&#9733; Latest</span><img src="{{ card.coverAttr | safe }}" alt="{{ card.nameAttr | safe }}"></div>
      <div class="feature-body">
        <div class="post-tag">{{ card.tagHtml | safe }}</div>
        <h2>{{ card.titleHtml | safe }}</h2>
        <p>{{ card.excerptHtml | safe }}</p>
        <div class="byline"><div class="av"></div><div class="who">{{ card.authorHtml | safe }}<small>{{ card.dateHtml | safe }} &middot; {{ card.readTimeHtml | safe }} read</small></div></div>
      </div>
    </a>
{% endmacro %}

{% macro grid(card) %}
      <a class="post" href="{{ card.href | safe }}"><div class="post-img {{ card.gradient | safe }}"><span class="num">FFF</span><img src="{{ card.coverAttr | safe }}" alt="{{ card.nameAttr | safe }}"></div><div class="post-body"><div class="post-tag">{{ card.tagHtml | safe }}</div><h3>{{ card.titleHtml | safe }}</h3><p class="ex">{{ card.excerptHtml | safe }}</p><div class="post-foot"><span>{{ card.authorHtml | safe }} &middot; {{ card.dateHtml | safe }} &middot; {{ card.readTimeHtml | safe }}</span><span class="read">Read &rarr;</span></div></div></a>
{% endmacro %}

{% macro home(card) %}
        <a href="{{ card.href | safe }}" style="background: #fff; border: 1px solid var(--line); border-radius: 20px; padding: 24px 28px; display: flex; gap: 18px; align-items: flex-start; text-decoration: none; color: inherit; transition: box-shadow .2s;">
          <img src="{{ card.coverAttr | safe }}" alt="{{ card.nameAttr | safe }}" width="48" height="48" style="width: 48px; height: 48px; border-radius: 50%; object-fit: cover; flex-shrink: 0;">
          <div>
            <div style="font-size: 11px; font-weight: 700; color: var(--pink-deep); letter-spacing: 0.12em; text-transform: uppercase; margin-bottom: 6px;">{{ card.dateHtml | safe }} · {{ card.readTimeHtml | safe }} read</div>
            <div style="font-family: var(--font-display); font-weight: 600; font-size: 17px; color: var(--plum); line-height: 1.3; margin-bottom: 4px;">{{ card.titleHtml | safe }}</div>
          </div>
        </a>
{% endmacro %}
```

- [ ] **Step 4: Expose the card on each post**

In `src/posts/posts.11tydata.js`, import `buildCardView` alongside
`buildPostView` and add to `eleventyComputed`:

```js
    /* The listing page and the homepage both print this, so it is derived once
       here rather than in two templates. */
    card: (data) => buildCardView(data),
```

- [ ] **Step 5: Replace the hand-written cards**

In `src/fintech-female-fridays.html`, above the `<!-- FEATURED -->` section add
`{% import "post-card.njk" as card %}`, then replace the featured anchor and the
six `<a class="post">` lines with:

```njk
{% set posts = collections.fff | reverse %}
{{ card.featured(posts[0].data.card) }}

    <div class="blog-grid">
{% for post in posts.slice(1) %}{{ card.grid(post.data.card) }}{% endfor %}
    </div>
```

Eleventy sorts a collection oldest-first, so `reverse` puts the newest at the
front. In `src/index.html`, import the same macro and replace both cards in the
`#fff` column with:

```njk
{% for post in (collections.fff | reverse).slice(0, 2) %}{{ card.home(post.data.card) }}{% endfor %}
```

- [ ] **Step 6: Check the diff is only what was intended**

```bash
cp -r _site /tmp/site-before && npm run build
diff /tmp/site-before/fintech-female-fridays.html _site/fintech-female-fridays.html
diff /tmp/site-before/index.html _site/index.html
diff -r /tmp/site-before _site --brief | grep -v 'fintech-female-fridays.html\|index.html'
```

Expected, and nothing else:

- **The listing page**: no differences at all, or differences confined to
  `alt` attributes where a hand-typed apostrophe (`alt="D'aundra Lewis"`)
  becomes the escaped `alt="D&#39;aundra Lewis"`. That is the same text to a
  reader and to a screen reader; it is the one place the old markup was not
  written the way the pipeline writes it. Any difference in visible copy means
  a field is wrong — fix the data, not the macro.
- **The homepage**: the same `alt` change, plus its second card becoming an
  `<a>` pointing at `fff-daundra-lewis.html` with `images/fff-daundra-lewis.jpg`,
  replacing the dead `<div>` that pointed at
  `images/3b1c3b_c5700ebd78b84736bb77561e8c772375~mv2.avif`.
- **No other file differs.**

- [ ] **Step 7: Commit**

```bash
git add src/_includes/post-card.njk src/fintech-female-fridays.html src/index.html \
        src/posts/posts.11tydata.js lib/render-blocks.mjs tools/post-file.test.mjs
git commit -m "Render the post cards from the posts, not from pasted markup"
```

---

## Task 7: The editor speaks post data

**Files:**
- Delete: `src/admin/templates.js`
- Create: `src/admin/text.js` (`slugify`, `isUrlSafe` — the two helpers that were editor-only)
- Modify: `src/admin/index.html` (one module script; drop the snippets panel)
- Modify: `src/admin/editor.js` (ES module; open, save, preview)
- Modify: `src/admin/types.js` (ES module; drop `snippets`, `buildPage`, `previewPage`)
- Modify: `eleventy.config.js` (passthrough copy `lib`)
- Modify: `README.md`

**Interfaces:**
- Consumes: `renderBlocks`, `paragraphs`, `makeExcerpt` from `/lib/render-blocks.mjs`; `serializePost`, `parsePost` from `/lib/post-file.mjs`.
- Produces: an editor that opens a post file and downloads one.

- [ ] **Step 1: Serve `lib/` to the browser**

In `eleventy.config.js`:

```js
  /* The renderer and the post-file format, served so the editor imports the
     same modules the build uses instead of carrying a second copy. */
  eleventyConfig.addPassthroughCopy({ lib: 'lib' });
```

- [ ] **Step 2: Rescue the two editor-only helpers**

`slugify` and `isUrlSafe` are the only things in `templates.js` that are not
duplicates. Create `src/admin/text.js`:

```js
/* Editor-only text helpers. Everything else the editor needs comes from
   /lib/render-blocks.mjs -- these two have no meaning at build time, because a
   committed post already has its slug and its links are already checked. */
import { safeUrl } from '/lib/render-blocks.mjs';

/* Copied verbatim from the deleted templates.js. The NFD pass matters: it is
   what turns an accented name into the slug an existing post already uses. */
export function slugify(name) {
  return String(name == null ? '' : name)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')          // D'aundra -> daundra
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/* Blank is fine; anything the renderer would collapse to '#' is not. */
export function isUrlSafe(s) {
  const raw = String(s == null ? '' : s).trim();
  return !raw || safeUrl(raw) !== '#';
}
```

Both bodies are the committed ones, not rewrites: a different `slugify` would
change the slug of an existing post, and `isUrlSafe` has to agree with the
renderer's `safeUrl` or the editor would accept a link the build discards.

- [ ] **Step 3: Convert the scripts to modules**

In `src/admin/index.html`, replace the three script tags with:

```html
<script type="module" src="editor.js"></script>
```

Make `types.js` export its registry (`export const TYPES = …`) instead of
assigning `window.WIF_TYPES`, delete its `snippets`, `buildPage` and
`previewPage` entries along with the `T.*` calls they used, and have `editor.js`
open with:

```js
import { renderBlocks, paragraphs, makeExcerpt } from '/lib/render-blocks.mjs';
import { serializePost, parsePost } from '/lib/post-file.mjs';
import { slugify, isUrlSafe } from './text.js';
import { TYPES } from './types.js';
```

Replace `T.slugify` / `T.isUrlSafe` with the imported names, and wrap the
module body's `(function () { … })()` IIFE away — a module already has its own
scope.

- [ ] **Step 4: Preview through the real renderer**

Replace `renderPreview`'s call to `def.previewPage(...)` with a document built
from the shared renderer and the CSS file from Task 5:

```js
  function previewDocument(model) {
    return [
      '<!doctype html><html lang="en"><head><meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      '<link rel="stylesheet" href="/site.css">',
      '<link rel="stylesheet" href="/post-article.css">',
      '</head><body><article class="article-body" style="padding: 32px 20px;">',
      '<p class="article-lede">' + paragraphs(model.intro) + '</p>',
      renderBlocks(model.blocks),
      '</article></body></html>'
    ].join('\n');
  }
```

and write it into the preview iframe with `srcdoc`. The preview shows the
article only: the nav and footer are the build's business now, which is what
lets `templates.js` go.

- [ ] **Step 5: Open a post file**

Add a file input to `index.html` beside the existing import control
(`<input type="file" id="post-file" accept=".html" hidden>` plus a
`btn-open-post` button labelled "Open post"), and in `editor.js`:

```js
  async function openPostFile(file) {
    let post;
    try {
      post = parsePost(await file.text());
    } catch (err) {
      /* The reader is an author, not a developer: say what to fix, and do not
         load half a post that a later save would write back with the rest
         missing. */
      toast('Could not open that post — ' + err.message);
      return;
    }
    /* A block the renderer does not know would vanish from the page without a
       word. Say so instead: the file is newer than this editor, or hand-edited. */
    const KNOWN = ['qa', 'heading', 'paragraph', 'quote', 'image', 'list'];
    const unknown = (post.blocks || []).map((b) => b.type).filter((t) => !KNOWN.includes(t));
    if (unknown.length) {
      toast('That post uses a block this editor does not know: ' + unknown.join(', '));
      return;
    }
    model = Object.assign(emptyModel(), post, { date: post.displayDate });
    renderFields();
    renderBlocks();
    schedulePreview();
    save();
    toast('Opened ' + (post.name || post.slug));
  }
```

- [ ] **Step 6: Save a post file**

Replace `downloadHtml` with:

```js
  function downloadPost() {
    const m = resolved();
    const post = Object.assign({}, m, { type: 'fff', displayDate: m.date });
    delete post.date;
    downloadBlob(
      new Blob([serializePost(post)], { type: 'text/plain;charset=utf-8' }),
      m.slug + '.html'
    );
  }
```

Relabel the button "Download post file", and replace the snippets panel in
`index.html` with a line saying the cards come from the post itself now:
`<p class="hint">The cards on the listing page and the homepage are generated from this post. Nothing to paste.</p>`

- [ ] **Step 7: Delete the second renderer**

```bash
git rm src/admin/templates.js
```

- [ ] **Step 8: Verify the editor by using it**

```bash
npm run build && npx @11ty/eleventy --serve
```

In the browser at `http://localhost:8080/admin/`: open
`src/posts/mor-grisariu.html`, confirm the fields and preview fill in, change a
word in the intro, download, and diff the result against the original.

Expected: the diff is the one word. Check the browser console is clean.

- [ ] **Step 9: Update the README**

In the "Post editor" section, replace the download-and-paste instructions with
opening a post, editing, downloading the post file into `src/posts/`, and
rebuilding — and state that the editor now needs to be served
(`npm run dev` or the deployed `/admin`) because it imports ES modules, so
opening `index.html` from disk no longer works. Delete the note about
`templates.js` carrying a copy of the nav.

- [ ] **Step 10: Commit**

```bash
git add -A src/admin README.md eleventy.config.js
git commit -m "Teach the editor the post format and retire the second renderer"
```

---

## Task 8: Retire the parity harness

**Files:**
- Delete: `tools/render-parity.mjs`
- Create: `tools/render-blocks.test.mjs`
- Modify: `package.json` (`verify:render` goes; `test` stays)
- Modify: `README.md`

**Interfaces:**
- Consumes: `lib/render-blocks.mjs`.
- Produces: the assertions that outlive `templates.js`.

- [ ] **Step 1: Move the assertions into a test**

Create `tools/render-blocks.test.mjs`, carrying over the link-integrity URLs
and the escaping cases from `tools/render-parity.mjs` — asserted against fixed
expectations now, rather than against a second implementation:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderInline, escText, escAttr, safeUrl, makeExcerpt } from '../lib/render-blocks.mjs';

/* These URLs were all mangled before 35e75f6: typo() rewrote the apostrophe
   and the ellipsis, and the bold/italic pass turned a '*' in a path into an
   <em> inside the href. Parity could not catch it, because both renderers were
   wrong together. */
for (const url of [
  "https://e.com/o'brien",
  'https://e.com/a...b',
  'https://e.com/a/*b*c/d',
  'https://e.com/a--b',
  'https://e.com/s?a=1&b=2'
]) {
  test(`a link survives rendering: ${url}`, () => {
    const href = renderInline(`[x](${url})`).match(/href="([^"]*)"/)[1];
    assert.equal(href, escAttr(url));
  });
}

test('markers still render around a link', () => {
  assert.equal(
    renderInline('**b** and [l](https://e.com) and *i*'),
    '<strong>b</strong> and <a href="https://e.com" target="_blank" rel="noopener">l</a> and <em>i</em>'
  );
});

test('a dangerous scheme collapses', () => {
  assert.equal(safeUrl('javascript:alert(1)'), '#');
  assert.equal(safeUrl('data:text/html,x'), '#');
  assert.equal(safeUrl('images/a.jpg'), 'images/a.jpg');
});

test('text is escaped before typography runs', () => {
  assert.equal(escText('ampersand & <script>'), 'ampersand &amp; &lt;script&gt;');
  assert.equal(escText("don't"), 'don&rsquo;t');
});

test('an excerpt is plain text, never markup', () => {
  assert.equal(makeExcerpt('[Alessia Russo](https://e.com) is an investor', 155), 'Alessia Russo is an investor');
});
```

- [ ] **Step 2: Run it**

Run: `npm test`
Expected: PASS, including Tasks 1–4's tests.

- [ ] **Step 3: Delete the harness**

```bash
git rm tools/render-parity.mjs
```

Remove `verify:render` from `package.json`.

- [ ] **Step 4: Prove the suite still has teeth**

Temporarily break `renderInline` in `lib/render-blocks.mjs` (for example, drop
the `applyMarkers` call on the label) and run `npm test`.
Expected: FAIL. Restore the file and confirm PASS.

- [ ] **Step 5: Update the README and commit**

In "Verifying a change didn't break anything", replace `npm run verify:render`
with `npm test`, and say what it covers: the post-file round trip, the seven
committed posts, and the renderer's escaping and links.

```bash
git add -A tools package.json README.md
git commit -m "Replace the parity harness with tests of the thing itself"
```

---

## Done when

- `npm test` passes and `npm run verify` reports no change beyond the known `pre-eleventy` divergence.
- `src/admin/templates.js` and `tools/render-parity.mjs` no longer exist.
- The seven post pages in `_site/` are byte-identical to before the work started.
- `fintech-female-fridays.html` is byte-identical; `index.html` differs only in its second FFF card, which is now a working link to a migrated image.
- A post opened in the editor, edited and downloaded differs from the original only in the edit.
