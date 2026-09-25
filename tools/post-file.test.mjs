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
