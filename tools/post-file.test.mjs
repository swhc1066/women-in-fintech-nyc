import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { serializePost, parsePost } from '../lib/post-file.mjs';

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
