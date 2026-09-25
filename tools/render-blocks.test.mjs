import test from 'node:test';
import assert from 'node:assert/strict';
import { renderInline, escText, escAttr, safeUrl, makeExcerpt, buildCardView } from '../lib/render-blocks.mjs';

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

test('markers inside a link label render too', () => {
  assert.equal(
    renderInline('[**bold label**](https://e.com/p)'),
    '<a href="https://e.com/p" target="_blank" rel="noopener"><strong>bold label</strong></a>'
  );
});

test('a link label gets typography, and the href stays untouched', () => {
  const rendered = renderInline("[Shira's post](https://e.com)");
  assert.match(rendered, /&rsquo;/);
  assert.equal(rendered.match(/href="([^"]*)"/)[1], 'https://e.com');
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

// Regression for the round-3 fix report, CRITICAL 2: buildCardView had no
// fallback for a blank title, unlike buildPostView, even though the editor's
// own help text tells an author to leave it blank. A post with no title must
// not publish an untitled card.
test('a post with no title falls back to the name-based title, on both cards', () => {
  const view = buildCardView({ slug: 's', name: 'Alessia Russo', blocks: [] });
  assert.equal(view.titleHtml, 'FinTech Female Fridays: Meet Alessia Russo');
  assert.equal(view.homeTitleHtml, 'FinTech Female Fridays: Meet Alessia Russo');
});

test('homeTitle still overrides the name-based fallback when title is also blank', () => {
  const view = buildCardView({ slug: 's', name: 'Alessia Russo', homeTitle: 'Short', blocks: [] });
  assert.equal(view.homeTitleHtml, 'Short');
});

// Regression for IMPORTANT 3: blank card fields used to leave a dangling
// ' · ' separator and an empty, still-bordered .post-tag chip. Joining must
// drop blanks the way metaLine() does for the post page's byline.
test('blank card fields leave no dangling separators', () => {
  const view = buildCardView({ slug: 's', name: 'No Meta', blocks: [] });
  assert.equal(view.tagHtml, '');
  assert.equal(view.gridFootHtml, '');
  assert.equal(view.featuredMetaHtml, '');
});

test('a blank read time drops the word "read" entirely', () => {
  const view = buildCardView({ slug: 's', name: 'N', displayDate: 'Jul 10', blocks: [] });
  assert.equal(view.featuredMetaHtml, 'Jul 10');
  assert.ok(!view.featuredMetaHtml.includes('read'));
});

test('a full set of card fields joins with the middle dot and no dangling parts', () => {
  const view = buildCardView({
    slug: 's', name: 'N', author: 'Manvir Singh', displayDate: 'Jul 10', readTime: '4 min', blocks: []
  });
  assert.equal(view.gridFootHtml, 'Manvir Singh · Jul 10 · 4 min');
  assert.equal(view.featuredMetaHtml, 'Jul 10 · 4 min read');
});
