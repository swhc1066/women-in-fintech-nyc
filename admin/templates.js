/* NYC Fintech Women — admin: page templates + HTML generation.
 *
 * Classic script, no modules: the admin tool must work from file:// as well as
 * over http, and ES modules are hard-blocked on file:// (origin null).
 *
 * MAINTENANCE: NAV_HTML / MOBILE_NAV_HTML / FOOTER_HTML below are copies of the
 * markup in the 10 root pages. There is no templating on this site, so when the
 * nav or footer changes, update them here too or generated posts will drift.
 * Backticks and ${ inside that markup must be escaped.
 */
(function () {
  'use strict';

  var SITE_ORIGIN = 'https://www.nycfintechwomen.com';

  /* ---------------------------------------------------------------- escaping */

  /* Smart typography. Runs AFTER entity-escaping: it only rewrites ' " - .
     and >, none of which survive in the &amp;/&lt;/&gt; entities produced
     there, so nothing gets double-encoded. Never applied to attributes. */
  function typo(s) {
    return String(s)
      .replace(/(\w)'/g, '$1&rsquo;')
      .replace(/'/g, '&lsquo;')
      .replace(/"(\w)/g, '&ldquo;$1')
      .replace(/"/g, '&rdquo;')
      .replace(/ -- | — /g, ' &mdash; ')
      .replace(/\.\.\./g, '&hellip;')
      .replace(/-&gt;/g, '&rarr;');
  }

  function escText(s) {
    return typo(
      String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
    );
  }

  /* Plain escape with no typographic rewriting — for alt text and anywhere the
     literal characters matter. */
  function escPlain(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function escAttr(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /* Allowlist: absolute http(s), mailto, in-page anchors, and relative paths.
     Everything else (javascript:, data:, vbscript:) collapses to '#'. */
  function safeUrl(s) {
    var raw = String(s == null ? '' : s).trim();
    if (!raw) return '';
    if (/^https?:\/\//i.test(raw)) return raw;
    if (/^mailto:[^\s]+$/i.test(raw)) return raw;
    if (/^#[\w-]*$/.test(raw)) return raw;
    // Relative path: must not contain a scheme separator before the first slash.
    if (/^\/?[\w.\-~%]+(\/[\w.\-~%]+)*(\.[a-z0-9]+)?([?#][^\s]*)?$/i.test(raw) && raw.indexOf(':') === -1) {
      return raw;
    }
    return '#';
  }

  function isUrlSafe(s) {
    var raw = String(s == null ? '' : s).trim();
    return !raw || safeUrl(raw) !== '#';
  }

  /* JSON-LD: stringify, then neutralise < so a "</script>" in the copy cannot
     break out of the script element. */
  function escJson(value) {
    return JSON.stringify(value).replace(/</g, '\\u003c');
  }

  /* ------------------------------------------------------- inline formatting */

  /* A deliberately tiny whitelist applied AFTER escaping, so the markers can
     never introduce tags the author didn't ask for.
     **bold** · *italic* · [text](url) */
  function renderInline(text) {
    var out = escText(text);
    out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (_m, label, url) {
      // `url` came through escText above; undo that before validating, or a
      // query string's & ends up as &amp;amp; in the href.
      var raw = String(url).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
      var href = safeUrl(raw);
      var ext = /^https?:\/\//i.test(href);
      return '<a href="' + escAttr(href) + '"' +
        (ext ? ' target="_blank" rel="noopener"' : '') + '>' + label + '</a>';
    });
    out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    out = out.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
    return out;
  }

  /* Split on blank lines so one textarea can produce several <p>s. */
  function paragraphs(text, className) {
    var cls = className ? ' class="' + className + '"' : '';
    return String(text == null ? '' : text)
      .split(/\n\s*\n/)
      .map(function (chunk) { return chunk.trim(); })
      .filter(Boolean)
      .map(function (chunk) { return '<p' + cls + '>' + renderInline(chunk) + '</p>'; })
      .join('\n      ');
  }

  /* ----------------------------------------------------------- site chrome */

  var NAV_HTML = [
    '<nav class="nav">',
    '  <div class="wrap">',
    '    <div class="nav-inner">',
    '    <a href="index.html" class="logo"><img src="images/nyc-fintech-women-logo.png" alt="NYC Fintech Women"></a>',
    '    <div class="nav-links">',
    '      <div class="has-menu"><a href="events.html">Events</a><div class="dropdown"><a href="events.html#upcoming">Upcoming Events</a><a href="events.html#past">Past Events</a></div></div>',
    '      <div class="has-menu"><a href="fintech-female-fridays.html" class="active">Our Programs</a><div class="dropdown"><a href="fintech-female-fridays.html" class="active">Fintech Female Fridays</a><a href="co-founder-matching.html">Co-founder Matching</a><a href="inspiring-fintech-females.html">Inspiring Fintech Females</a></div></div>',
    '      <div class="has-menu"><a href="meet-the-team.html">About</a><div class="dropdown"><a href="meet-the-team.html">Meet the Team</a><a href="#">Become a Member</a><a href="#">Sponsor</a></div></div>',
    '      <a href="new-york.html">New York</a>',
    '      <a href="chicago.html">Chicago</a>',
    '      <a href="san-francisco.html">San Francisco</a>',
    '    </div>',
    '    <button class="nav-toggle" type="button" aria-label="Open menu" aria-expanded="false" aria-controls="mobile-nav">',
    '      <span class="nav-toggle-bar"></span>',
    '      <span class="nav-toggle-bar"></span>',
    '      <span class="nav-toggle-bar"></span>',
    '    </button>',
    '    </div>',
    '  </div>',
    '</nav>'
  ].join('\n');

  var MOBILE_NAV_HTML = [
    '<div class="mobile-nav" id="mobile-nav" aria-hidden="true">',
    '  <div class="mobile-nav-backdrop"></div>',
    '  <aside class="mobile-nav-panel" role="dialog" aria-modal="true" aria-label="Navigation menu">',
    '    <div class="mobile-nav-head">',
    '      <div class="mobile-nav-brand"><img src="images/nyc-fintech-women-logo.png" alt="NYC Fintech Women"></div>',
    '      <button type="button" class="mobile-nav-close" aria-label="Close menu">&times;</button>',
    '    </div>',
    '    <div class="mobile-nav-body">',
    '      <div class="mobile-nav-group">',
    '        <button type="button" class="mobile-nav-trigger" aria-expanded="false">Chapters</button>',
    '        <div class="mobile-nav-sub">',
    '          <a href="new-york.html">New York</a>',
    '          <a href="san-francisco.html">San Francisco</a>',
    '          <a href="chicago.html">Chicago</a>',
    '        </div>',
    '      </div>',
    '      <div class="mobile-nav-group">',
    '        <button type="button" class="mobile-nav-trigger" aria-expanded="false">Events</button>',
    '        <div class="mobile-nav-sub"><a href="events.html#upcoming">Upcoming Events</a><a href="events.html#past">Past Events</a></div>',
    '      </div>',
    '      <div class="mobile-nav-group open">',
    '        <button type="button" class="mobile-nav-trigger current" aria-expanded="true">Our Programs</button>',
    '        <div class="mobile-nav-sub">',
    '          <a href="fintech-female-fridays.html" class="active">Fintech Female Fridays</a>',
    '          <a href="co-founder-matching.html">Co-founder Matching</a>',
    '          <a href="inspiring-fintech-females.html">Inspiring Fintech Females</a>',
    '        </div>',
    '      </div>',
    '      <div class="mobile-nav-group">',
    '        <button type="button" class="mobile-nav-trigger" aria-expanded="false">About</button>',
    '        <div class="mobile-nav-sub">',
    '          <a href="meet-the-team.html">Meet the Team</a>',
    '          <a href="#">Become a Member</a>',
    '          <a href="#">Sponsor</a>',
    '        </div>',
    '      </div>',
    '    </div>',
    '    <div class="mobile-nav-foot">',
    '      <a href="#" class="btn btn-pink">Become a Member</a>',
    '    </div>',
    '  </aside>',
    '</div>'
  ].join('\n');

  var FOOTER_HTML = [
    '<footer>',
    '  <div class="wrap">',
    '    <div class="foot-grid">',
    '      <div>',
    '        <div class="foot-brand"><span class="dot"></span> NYC Fintech Women</div>',
    '        <p>A community of 20,000+ women shaping the future of financial services across NYC, San Francisco, and Chicago.</p>',
    '      </div>',
    '      <div class="foot-col"><h4>Events</h4><ul><li><a href="events.html">Events</a></li><li><a href="events.html#past">Past Events</a></li><li><a href="inspiring-fintech-females.html">Inspiring Fintech Females</a></li><li><a href="fintech-female-fridays.html">Fintech Female Fridays</a></li></ul></div>',
    '      <div class="foot-col"><h4>Community</h4><ul><li><a href="co-founder-matching.html">Co-founder Matching</a></li><li><a href="meet-the-team.html">Meet the Team</a></li><li><a href="inspiring-fintech-females.html">Inspiring Fintech Females</a></li><li><a href="new-york.html">New York</a></li><li><a href="san-francisco.html">San Francisco</a></li><li><a href="chicago.html">Chicago</a></li></ul></div>',
    '      <div class="foot-col"><h4>Get involved</h4><ul><li><a href="#">Become a Member</a></li><li><a href="#">Sponsor</a></li><li><a href="#">Contact</a></li><li><a href="#">LinkedIn</a></li></ul></div>',
    '    </div>',
    '    <div class="foot-bot"><span>&copy; 2026 NYC Fintech Women &middot; All rights reserved</span><span>Built with care in NYC</span></div>',
    '  </div>',
    '</footer>'
  ].join('\n');

  /* -------------------------------------------------------- post page CSS */

  var POST_PAGE_CSS = [
    '  /* article hero */',
    '  .article-hero { padding-bottom: 34px; }',
    '  .article-hero .inner { max-width: 820px; }',
    '  .article-hero h1 { margin-bottom: 0; }',
    '  .article-tag { display: inline-block; font-size: 11px; font-weight: 700; color: var(--pink-deep); letter-spacing: 0.12em; text-transform: uppercase; background: #fff; border: 1px solid var(--line); padding: 6px 13px; border-radius: 999px; margin-bottom: 18px; }',
    '  /* byline */',
    '  .article-byline { display: flex; align-items: center; gap: 14px; margin-top: 26px; flex-wrap: wrap; }',
    '  .article-byline img { width: 52px; height: 52px; border-radius: 50%; object-fit: cover; flex-shrink: 0; border: 2px solid #fff; box-shadow: 0 4px 14px rgba(59,13,58,0.12); }',
    '  .article-who { font-size: 14.5px; font-weight: 600; color: var(--plum); line-height: 1.35; }',
    '  .article-who small { display: block; font-weight: 400; color: var(--muted); font-size: 13.5px; }',
    '  .article-who a { color: var(--pink-deep); font-weight: 600; text-decoration: none; }',
    '  .article-who a:hover { text-decoration: underline; }',
    '  .article-meta { margin-left: auto; font-size: 12.5px; color: var(--muted); letter-spacing: 0.02em; }',
    '  /* cover */',
    '  .article-cover { max-width: 940px; margin: 0 auto 46px; border-radius: 26px; overflow: hidden; border: 1px solid var(--line); background: var(--soft); }',
    '  .article-cover img { width: 100%; height: auto; aspect-ratio: 16/9; object-fit: cover; object-position: center top; display: block; }',
    '  /* body */',
    '  .article-body { max-width: 720px; margin: 0 auto; }',
    '  .article-lede { font-size: 20px; line-height: 1.6; color: var(--plum); font-weight: 500; margin: 0 0 34px; padding-bottom: 30px; border-bottom: 1px solid var(--line); text-wrap: pretty; }',
    '  .article-body p { font-size: 17.5px; line-height: 1.75; color: var(--fg); margin: 0 0 22px; }',
    '  .article-body a { color: var(--pink-deep); }',
    '  .article-body h2 { font-family: var(--font-display); font-weight: 500; font-size: clamp(24px, 3vw, 30px); line-height: 1.18; letter-spacing: -0.02em; color: var(--plum); margin: 44px 0 18px; text-wrap: balance; }',
    '  .article-list { margin: 0 0 24px; padding-left: 22px; }',
    '  .article-list li { font-size: 17.5px; line-height: 1.7; color: var(--fg); margin-bottom: 10px; }',
    '  .article-list li::marker { color: var(--pink); }',
    '  /* Q&A */',
    '  .qa { margin: 0 0 32px; padding-left: 20px; border-left: 3px solid var(--pink); }',
    '  .qa-q { font-family: var(--font-display); font-weight: 600; font-size: 19.5px; line-height: 1.35; color: var(--plum); margin: 0 0 12px; text-wrap: pretty; }',
    '  .qa-a p { margin: 0 0 16px; }',
    '  .qa-a p:last-child { margin-bottom: 0; }',
    '  /* pull quote */',
    '  .pullquote { margin: 40px 0; padding: 4px 0 4px 26px; border-left: 4px solid var(--accent); }',
    '  .pullquote p { font-family: var(--font-display); font-style: italic; font-weight: 400; font-size: clamp(21px, 2.6vw, 25px); line-height: 1.4; color: var(--pink-deep); margin: 0; text-wrap: balance; }',
    '  .pullquote cite { display: block; margin-top: 14px; font-family: var(--font-sans); font-style: normal; font-size: 13px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); }',
    '  /* inline figure */',
    '  .article-figure { margin: 36px 0; }',
    '  .article-figure img { width: 100%; height: auto; display: block; border-radius: 18px; border: 1px solid var(--line); }',
    '  .article-figure figcaption { margin-top: 12px; font-size: 13.5px; color: var(--muted); line-height: 1.5; }',
    '  /* foot */',
    '  .article-foot { max-width: 720px; margin: 52px auto 0; padding-top: 34px; border-top: 1px solid var(--line); display: flex; gap: 16px; align-items: center; justify-content: space-between; flex-wrap: wrap; }',
    '  .back-link { color: var(--pink-deep); font-weight: 600; font-size: 15px; text-decoration: none; }',
    '  .back-link:hover { text-decoration: underline; }',
    '  @media (max-width: 720px) {',
    '    .article-meta { margin-left: 0; width: 100%; }',
    '    .article-cover { border-radius: 18px; margin-bottom: 32px; }',
    '    .article-lede { font-size: 18px; }',
    '    .article-body p, .article-list li { font-size: 16.5px; }',
    '    .qa { padding-left: 16px; }',
    '    .pullquote { margin: 30px 0; padding-left: 18px; }',
    '    .article-foot { flex-direction: column-reverse; align-items: stretch; }',
    '  }'
  ].join('\n');

  /* ------------------------------------------------------------- utilities */

  function slugify(name) {
    return String(name == null ? '' : name)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/['’]/g, '')          // D'aundra -> daundra
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  /* First ~240 chars on a word boundary. No trailing ellipsis: the existing
     cards on fintech-female-fridays.html end mid-thought without one. */
  function makeExcerpt(text, max) {
    var limit = max || 240;
    var flat = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
    if (flat.length <= limit) return flat;
    var cut = flat.slice(0, limit);
    var lastSpace = cut.lastIndexOf(' ');
    return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).replace(/[,;:]$/, '');
  }

  function coverPath(model) {
    return model.coverPath || ('images/fff-' + (model.slug || 'post') + '.jpg');
  }

  function postFilename(model) {
    return 'fff-' + (model.slug || 'post') + '.html';
  }

  function absoluteUrl(path) {
    if (/^https?:\/\//i.test(path)) return path;
    return SITE_ORIGIN + '/' + String(path).replace(/^\//, '');
  }

  /* Meta line shared by the post byline and the listing cards. */
  function metaLine(model) {
    return [model.author, model.date, model.readTime]
      .map(function (part) { return String(part == null ? '' : part).trim(); })
      .filter(Boolean)
      .join(' · ');
  }

  /* --------------------------------------------------------- block render */

  var BLOCK_RENDERERS = {
    qa: function (b) {
      if (!String(b.q || '').trim() && !String(b.a || '').trim()) return '';
      return [
        '<div class="qa">',
        '      <p class="qa-q">' + renderInline(b.q) + '</p>',
        '      <div class="qa-a">' + paragraphs(b.a) + '</div>',
        '    </div>'
      ].join('\n      ');
    },
    heading: function (b) {
      if (!String(b.text || '').trim()) return '';
      return '<h2>' + renderInline(b.text) + '</h2>';
    },
    paragraph: function (b) {
      return paragraphs(b.text);
    },
    quote: function (b) {
      if (!String(b.text || '').trim()) return '';
      var cite = String(b.attrib || '').trim()
        ? '\n        <cite>' + escText(b.attrib) + '</cite>'
        : '';
      return [
        '<blockquote class="pullquote">',
        '        <p>' + renderInline(b.text) + '</p>' + cite,
        '      </blockquote>'
      ].join('\n      ');
    },
    image: function (b) {
      var src = safeUrl(b.src);
      if (!src || src === '#') return '';
      var caption = String(b.caption || '').trim()
        ? '\n        <figcaption>' + escText(b.caption) + '</figcaption>'
        : '';
      return [
        '<figure class="article-figure">',
        '        <img src="' + escAttr(src) + '" alt="' + escAttr(b.alt || '') + '" loading="lazy">' + caption,
        '      </figure>'
      ].join('\n      ');
    },
    list: function (b) {
      var items = (b.items || [])
        .map(function (item) { return String(item).trim(); })
        .filter(Boolean);
      if (!items.length) return '';
      var tag = b.ordered ? 'ol' : 'ul';
      return [
        '<' + tag + ' class="article-list">',
        items.map(function (item) {
          return '        <li>' + renderInline(item) + '</li>';
        }).join('\n'),
        '      </' + tag + '>'
      ].join('\n      ');
    }
  };

  function renderBlocks(blocks) {
    return (blocks || [])
      .map(function (b) {
        var fn = BLOCK_RENDERERS[b.type];
        return fn ? fn(b) : '';
      })
      .filter(Boolean)
      .join('\n\n      ');
  }

  /* ------------------------------------------------------------ page build */

  function buildPostPage(model) {
    var title = String(model.title || '').trim() ||
      ('FinTech Female Fridays: Meet ' + (model.name || ''));
    var cover = coverPath(model);
    var desc = String(model.metaDescription || '').trim() || makeExcerpt(model.intro, 155);
    var ogTitle = String(model.ogTitle || '').trim() || title;
    var ogImage = absoluteUrl(safeUrl(model.ogImage) === '#' ? cover : (model.ogImage || cover));
    var canonical = absoluteUrl(postFilename(model));
    var linkedin = safeUrl(model.linkedin);
    var roleLine = [model.role, model.company]
      .map(function (p) { return String(p == null ? '' : p).trim(); })
      .filter(Boolean)
      .join(' · ');

    var jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: title,
      description: desc,
      image: ogImage,
      datePublished: model.isoDate || undefined,
      author: { '@type': 'Person', name: model.author || 'NYC Fintech Women' },
      publisher: {
        '@type': 'Organization',
        name: 'NYC Fintech Women',
        logo: {
          '@type': 'ImageObject',
          url: SITE_ORIGIN + '/images/nyc-fintech-women-logo.png'
        }
      },
      mainEntityOfPage: canonical
    };

    var headshot = safeUrl(model.headshot) && safeUrl(model.headshot) !== '#'
      ? safeUrl(model.headshot)
      : cover;

    var out = [];
    out.push('<!doctype html>');
    out.push('<html lang="en">');
    out.push('<head>');
    out.push('<meta charset="utf-8" />');
    out.push('<meta name="viewport" content="width=device-width, initial-scale=1" />');
    out.push('<title>' + escText(title) + ' — NYC Fintech Women</title>');
    out.push('<meta name="description" content="' + escAttr(desc) + '" />');
    out.push('<link rel="canonical" href="' + escAttr(canonical) + '" />');
    out.push('<meta property="og:type" content="article" />');
    out.push('<meta property="og:site_name" content="NYC Fintech Women" />');
    out.push('<meta property="og:title" content="' + escAttr(ogTitle) + '" />');
    out.push('<meta property="og:description" content="' + escAttr(desc) + '" />');
    out.push('<meta property="og:image" content="' + escAttr(ogImage) + '" />');
    out.push('<meta property="og:url" content="' + escAttr(canonical) + '" />');
    out.push('<meta name="twitter:card" content="summary_large_image" />');
    out.push('<meta name="twitter:title" content="' + escAttr(ogTitle) + '" />');
    out.push('<meta name="twitter:description" content="' + escAttr(desc) + '" />');
    out.push('<meta name="twitter:image" content="' + escAttr(ogImage) + '" />');
    out.push('<link rel="stylesheet" href="site.css" />');
    out.push('<style>');
    out.push(POST_PAGE_CSS);
    out.push('</style>');
    out.push('<script type="application/ld+json">' + escJson(jsonLd) + '</script>');
    out.push('</head>');
    out.push('<body>');
    out.push('');
    out.push('<!-- NAV -->');
    out.push(NAV_HTML);
    out.push('');
    out.push(MOBILE_NAV_HTML);
    out.push('');
    out.push('<!-- ARTICLE HERO -->');
    out.push('<section class="page-hero article-hero">');
    out.push('  <div class="wrap inner">');
    out.push('    <div class="article-tag">' + escText(model.tag || 'Fintech Female Fridays') + '</div>');
    out.push('    <h1>' + escText(title) + '</h1>');
    out.push('    <div class="article-byline">');
    out.push('      <img src="' + escAttr(headshot) + '" alt="' + escAttr(model.name || '') + '" width="52" height="52">');
    out.push('      <div class="article-who">' + escText(model.name || ''));
    if (roleLine) out.push('        <small>' + escText(roleLine) + '</small>');
    if (linkedin && linkedin !== '#') {
      out.push('        <a href="' + escAttr(linkedin) + '" target="_blank" rel="noopener">LinkedIn &rarr;</a>');
    }
    out.push('      </div>');
    out.push('      <div class="article-meta">' + escText(metaLine(model)) + '</div>');
    out.push('    </div>');
    out.push('  </div>');
    out.push('</section>');
    out.push('');
    out.push('<!-- ARTICLE -->');
    out.push('<section class="section" style="padding-top: 8px;">');
    out.push('  <div class="wrap">');
    out.push('    <figure class="article-cover">');
    out.push('      <img src="' + escAttr(cover) + '" alt="' + escAttr(model.name || '') + '">');
    out.push('    </figure>');
    out.push('    <div class="article-body">');
    if (String(model.intro || '').trim()) {
      out.push('      <p class="article-lede">' + renderInline(model.intro) + '</p>');
      out.push('');
    }
    var body = renderBlocks(model.blocks);
    if (body) {
      out.push('      ' + body);
    }
    out.push('    </div>');
    out.push('    <div class="article-foot">');
    out.push('      <a href="fintech-female-fridays.html" class="back-link">&larr; All Fintech Female Fridays</a>');
    if (linkedin && linkedin !== '#') {
      out.push('      <a href="' + escAttr(linkedin) + '" class="btn btn-ghost" target="_blank" rel="noopener">Connect with ' + escText(String(model.name || '').split(' ')[0]) + ' &rarr;</a>');
    }
    out.push('    </div>');
    out.push('  </div>');
    out.push('</section>');
    out.push('');
    out.push('<!-- FOOTER -->');
    out.push(FOOTER_HTML);
    out.push('');
    out.push('<script src="nav-mobile.js"></script>');
    out.push('</body>');
    out.push('</html>');
    out.push('');
    return out.join('\n');
  }

  /* --------------------------------------------------------- card snippets */

  /* "Jul 10 · 4 min read" — never a dangling "read" when a field is blank. */
  function dateReadLine(model) {
    var date = String(model.date == null ? '' : model.date).trim();
    var read = String(model.readTime == null ? '' : model.readTime).trim();
    if (date && read) return date + ' \u00b7 ' + read + ' read';
    if (read) return read + ' read';
    return date;
  }

  /* The listing page gives each grid card one of six duotone gradients via
     .g1-.g6 on .post-img. Derive it from the slug so a given post always gets
     the same one. */
  function gradientClass(model) {
    var slug = String(model.slug || '');
    var sum = 0;
    for (var i = 0; i < slug.length; i++) sum += slug.charCodeAt(i);
    return 'g' + ((sum % 6) + 1);
  }

  function cardTitle(model) {
    return String(model.title || '').trim() ||
      ('FinTech Female Fridays: Meet ' + (model.name || ''));
  }

  function cardExcerpt(model) {
    return String(model.excerpt || '').trim() || makeExcerpt(model.intro);
  }

  /* NOTE: covers are a child <img>, not a background-image. The listing page
     styles .feature-img img / .post-img img with object-fit + grayscale and
     lifts a ::after duotone overlay on hover; a background-image renders
     nothing and stays permanently tinted. */
  function featuredCard(model) {
    return [
      '<a class="feature" href="' + escAttr(postFilename(model)) + '">',
      '  <div class="feature-img"><span class="star">&#9733; Latest</span><img src="' +
        escAttr(coverPath(model)) + '" alt="' + escAttr(model.name || '') + '"></div>',
      '  <div class="feature-body">',
      '    <div class="post-tag">' + escText(model.tag || 'Fintech Female Fridays') + '</div>',
      '    <h2>' + escText(cardTitle(model)) + '</h2>',
      '    <p>' + escText(cardExcerpt(model)) + '</p>',
      '    <div class="byline"><div class="av"></div><div class="who">' +
        escText(model.author || '') + '<small>' + escText(dateReadLine(model)) +
        '</small></div></div>',
      '  </div>',
      '</a>'
    ].join('\n');
  }

  function gridCard(model) {
    return '<a class="post" href="' + escAttr(postFilename(model)) + '">' +
      '<div class="post-img ' + gradientClass(model) + '">' +
      '<span class="num">FFF</span>' +
      '<img src="' + escAttr(coverPath(model)) + '" alt="' + escAttr(model.name || '') + '"></div>' +
      '<div class="post-body">' +
      '<div class="post-tag">' + escText(model.tag || 'Fintech Female Fridays') + '</div>' +
      '<h3>' + escText(cardTitle(model)) + '</h3>' +
      '<p class="ex">' + escText(cardExcerpt(model)) + '</p>' +
      '<div class="post-foot"><span>' + escText(metaLine(model)) + '</span>' +
      '<span class="read">Read &rarr;</span></div></div></a>';
  }

  /* index.html carries its own copy of the design system and does NOT link
     site.css, so this card must stay fully inline-styled. */
  function homeCard(model) {
    var headshot = safeUrl(model.headshot) && safeUrl(model.headshot) !== '#'
      ? safeUrl(model.headshot)
      : coverPath(model);
    return [
      '<a href="' + escAttr(postFilename(model)) + '" style="background: #fff; border: 1px solid var(--line); border-radius: 20px; padding: 24px 28px; display: flex; gap: 18px; align-items: flex-start; text-decoration: none; color: inherit; transition: box-shadow .2s;">',
      '  <img src="' + escAttr(headshot) + '" alt="' + escAttr(model.name || '') + '" width="48" height="48" style="width: 48px; height: 48px; border-radius: 50%; object-fit: cover; flex-shrink: 0;">',
      '  <div>',
      '    <div style="font-size: 11px; font-weight: 700; color: var(--pink-deep); letter-spacing: 0.12em; text-transform: uppercase; margin-bottom: 6px;">' + escText(dateReadLine(model)) + '</div>',
      '    <div style="font-family: var(--font-display); font-weight: 600; font-size: 17px; color: var(--plum); line-height: 1.3; margin-bottom: 4px;">' + escText(cardTitle(model)) + '</div>',
      '  </div>',
      '</a>'
    ].join('\n');
  }

  /* ------------------------------------------------------------- preview */

  /* The canonical page, patched for display inside the admin iframe:
     - an ABSOLUTE <base> pointing at the site root. srcdoc documents have the
       URL "about:srcdoc", and a *relative* base href cannot be resolved against
       that — Chromium discards it and falls back to the parent URL (/admin/),
       which 404s site.css and images/. So the base must be fully resolved here.
     - the not-yet-saved cover swapped for its in-memory blob URL. */
  function previewHtml(model, blobUrl, baseHref) {
    var base = baseHref;
    if (!base && typeof location !== 'undefined') {
      base = new URL('../', location.href).href;
    }
    var html = buildPostPage(model);
    if (base) html = html.replace('<head>', '<head>\n<base href="' + escAttr(base) + '">');
    if (blobUrl) {
      var cover = coverPath(model);
      html = html.split('"' + cover + '"').join('"' + blobUrl + '"');
      html = html.split("'" + cover + "'").join("'" + blobUrl + "'");
    }
    return html;
  }

  window.WIF_TEMPLATES = {
    SITE_ORIGIN: SITE_ORIGIN,
    POST_PAGE_CSS: POST_PAGE_CSS,
    escText: escText,
    escPlain: escPlain,
    escAttr: escAttr,
    escJson: escJson,
    safeUrl: safeUrl,
    isUrlSafe: isUrlSafe,
    typo: typo,
    renderInline: renderInline,
    paragraphs: paragraphs,
    slugify: slugify,
    makeExcerpt: makeExcerpt,
    coverPath: coverPath,
    postFilename: postFilename,
    metaLine: metaLine,
    dateReadLine: dateReadLine,
    BLOCK_RENDERERS: BLOCK_RENDERERS,
    renderBlocks: renderBlocks,
    buildPostPage: buildPostPage,
    previewHtml: previewHtml,
    featuredCard: featuredCard,
    gridCard: gridCard,
    homeCard: homeCard
  };
})();
