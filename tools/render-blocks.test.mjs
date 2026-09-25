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
