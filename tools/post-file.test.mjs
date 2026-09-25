import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { serializePost, parsePost } from '../lib/post-file.mjs';
import { buildCardView } from '../lib/render-blocks.mjs';

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
  // Trailing space mid-value (not at the string's own start/end, which must
  // stay whitespace-free for the literal block to be usable at all -- see
  // the round-2 fix report) still must not survive per line.
  const text = serializePost({ slug: 's', intro: 'One. \n\nTwo.', blocks: [] });
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

const POSTS = fs.readdirSync('src/posts').filter((f) => f.endsWith('.html'));

test('every committed post parses and re-serializes byte-identically', () => {
  assert.ok(POSTS.length >= 7, 'expected the migrated posts to be present');
  for (const file of POSTS) {
    const original = fs.readFileSync(path.join('src/posts', file), 'utf8');
    assert.equal(serializePost(parsePost(original)), original, file);
  }
});

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

test('a whitespace-only value round trips unchanged', () => {
  const post = { slug: 's', intro: '   ', blocks: [] };
  assert.deepEqual(parsePost(serializePost(post)), post);
});

test('a value ending in a blank line round trips unchanged', () => {
  const post = { slug: 's', intro: 'A.\n\nB.\n\n', blocks: [] };
  assert.deepEqual(parsePost(serializePost(post)), post);
});

test('a bare scalar of "true" stays a string, not a boolean', () => {
  const post = { slug: 's', intro: 'i', blocks: [{ type: 'true' }] };
  assert.deepEqual(parsePost(serializePost(post)), post);
});

test('a top-level bare field of "true" stays a string, not a boolean', () => {
  const post = { slug: 's', type: 'true', intro: 'i', blocks: [] };
  assert.deepEqual(parsePost(serializePost(post)), post);
});

test('a list block still round trips with ordered as a real boolean', () => {
  const post = {
    slug: 's',
    intro: 'i',
    blocks: [{ type: 'list', ordered: false, items: ['one', 'two'] }]
  };
  assert.deepEqual(parsePost(serializePost(post)), post);
});

test('parsePost agrees with gray-matter on a value ending in a blank line', () => {
  const post = { slug: 's', intro: 'A.\n\nB.\n\n', blocks: [] };
  const text = serializePost(post);
  assert.deepEqual(parsePost(text).intro, matter(text).data.intro);
});

// Fails clearly (naming the file) instead of letting a js-yaml throw crash
// the whole test run -- a malformed post file must not take the build down.
function readWithGrayMatter(text, label) {
  try {
    return matter(text).data;
  } catch (err) {
    assert.fail(`gray-matter could not read ${label}: ${err.message}`);
  }
}

test('a value that is only whitespace across several lines round trips unchanged', () => {
  const post = { slug: 's', intro: ' \n \n ', blocks: [] };
  const text = serializePost(post);
  assert.deepEqual(parsePost(text), post);
  assert.deepEqual(readWithGrayMatter(text, 'whitespace-only value').intro, post.intro);
});

test('a value with leading whitespace on its first line round trips unchanged', () => {
  const post = { slug: 's', intro: '  leading\n\nmore', blocks: [] };
  const text = serializePost(post);
  assert.deepEqual(parsePost(text), post);
  assert.deepEqual(readWithGrayMatter(text, 'leading-whitespace value').intro, post.intro);
});

test('a value that starts with a blank line round trips unchanged', () => {
  const post = { slug: 's', intro: '\n\nA', blocks: [] };
  const text = serializePost(post);
  assert.deepEqual(parsePost(text), post);
  assert.deepEqual(readWithGrayMatter(text, 'leading-blank-line value').intro, post.intro);
});

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

test('homeTitle round trips and overrides the home card title, falling back to title otherwise', () => {
  const post = { slug: 's', title: 'Full Title', homeTitle: 'Short Title', blocks: [] };
  const text = serializePost(post);
  assert.equal(parsePost(text).homeTitle, 'Short Title');
  assert.equal(buildCardView(post).homeTitleHtml, 'Short Title');

  const noOverride = { slug: 's', title: 'Full Title', blocks: [] };
  assert.equal(buildCardView(noOverride).homeTitleHtml, 'Full Title');
});
