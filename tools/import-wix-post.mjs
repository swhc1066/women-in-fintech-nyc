/* Turn an archived Wix post into a src/posts/<slug>.html data file.
 *
 * The seven Fintech Female Fridays posts were written in Wix and exist here
 * only as links off-site. Their text lives in the HTML archive at
 * ~/Desktop/Projects/wix-archive-nycfintechwomen/, which is a full render of
 * the old site: the post body is Ricos viewer markup, not a JSON payload.
 *
 *   node tools/import-wix-post.mjs --all
 *   node tools/import-wix-post.mjs --post shira-amrany --dry-run
 *
 * This is a one-shot migration aid, not part of the build. It is committed so
 * the import is reproducible and reviewable: rerunning it must produce the
 * same file, so nothing here invents, summarises or rewrites copy. Every
 * string it writes came out of the archive verbatim, except the fields in
 * POSTS below, which were read off the existing cards on
 * fintech-female-fridays.html.
 *
 * Ricos mostly marks structure by inline style rather than by element, so the
 * shape is recovered from how a paragraph is styled:
 *
 *   strong + font-size:24px   a section heading ("More about Shira"). One post
 *                             uses a real <h2>; both are read.
 *   strong throughout         an interview question; the paragraphs that
 *                             follow, until the next one, are its answer
 *   #1155CC throughout        a question too. Adina's post sets its questions
 *                             in the link blue and leaves the answers black.
 *   a run of clock times      the daily diary every post ends on, which is a
 *                             list however the author typed it
 *
 * Bold that covers only part of a paragraph ("**Hometown:** Pound Ridge") is
 * prose, and stays prose.
 *
 * Body images are copied out of the archive's media/ directory, which holds
 * the originals under their Wix asset id (see tools/archive-media.mjs), then
 * resized to match the covers already in src/images/.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { serializePost } from '../lib/post-file.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ARCHIVE = flag('archive', path.join(os.homedir(), 'Desktop/Projects/wix-archive-nycfintechwomen'));
const DRY_RUN = process.argv.includes('--dry-run');

/* The role and company shown under the name, and the cover already committed
   to src/images/. Both come from the existing cards on the listing page --
   the archive does not carry them as fields. `file` is the archived page. */
const POSTS = [
  {
    slug: 'shira-amrany',
    file: 'fintech-female-fridays-meet-shira-amrany.html',
    role: 'Data & Analytics',
    company: 'Indagari'
  },
  {
    slug: 'daundra-lewis',
    file: 'fintech-female-fridays-meet-d-aundra-lewis.html',
    role: 'Compliance',
    company: 'Financial Crime'
  },
  {
    slug: 'adina-fischer',
    file: 'fintech-female-fridays-meet-adina-fischer-fractional-coo-cfo-at-182-west.html',
    role: 'Fractional COO & CFO',
    company: '182 West'
  },
  {
    slug: 'alessia-russo',
    file: 'fintech-female-fridays-meet-alessia-russo-technology-investor-at-insight-partners.html',
    role: 'Investor',
    company: 'Insight Partners'
  },
  {
    slug: 'meitar-landau',
    file: 'fintech-female-fridays-meet-meitar-landau-head-of-gtm-at-cymphony.html',
    role: 'Head of GTM',
    company: 'Cymphony'
  },
  {
    slug: 'samantha-lassoff',
    file: 'fintech-female-fridays-meet-samantha-lassoff-executive-coach-leadership-advisor.html',
    role: 'Executive Coach',
    company: 'Leadership'
  },
  {
    slug: 'mor-grisariu',
    file: 'fintech-female-fridays-meet-mor-grisariu-vp-payments-at-fijoya.html',
    role: 'VP Payments',
    company: 'Fijoya'
  }
];

function flag(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

/* ------------------------------------------------------------------- parsing */

export function decodeEntities(s) {
  return String(s)
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;|&#34;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x2F;/g, '/')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/* Ricos writes curly quotes and true dashes. lib/render-blocks.mjs applies its
   own typography to straight characters, and that pass is lossy and one-way,
   so the stored text has to be plain source: fold the rendered characters back
   down and let the renderer produce the entities. */
export function toSourceText(s) {
  return String(s)
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/—/g, ' -- ')
    .replace(/–/g, '-')
    .replace(/…/g, '...')
    .replace(/ /g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function meta(html, re) {
  const m = html.match(re);
  return m ? decodeEntities(m[1]) : '';
}

/* The body runs from the first Ricos block to the one marked type="last". */
export function bodyRegion(html) {
  const start = html.indexOf('data-hook="rcv-block1"');
  const end = html.indexOf('type="last"');
  if (start === -1 || end === -1) throw new Error('no Ricos body found');
  return html.slice(html.lastIndexOf('<div data-breakout', start), end);
}

/* Inline markup, reduced to what lib/render-blocks.mjs understands:
   **bold**, *italic*, [text](url). Everything else is dropped to text.
   The markers wrap the trimmed text, never its surrounding space, or
   "**Hometown: **value" would leave the space inside the <strong>. */
export function inlineText(fragment) {
  let out = fragment;
  out = out.replace(
    /<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi,
    (_m, href, label) => {
      const raw = label.replace(/<[^>]+>/g, '');
      const text = toSourceText(decodeEntities(raw));
      if (!text) return '';
      /* Wix puts the space after a link inside the anchor as often as outside
         it. Trimming the label without putting that space back gives
         "[Alessia Russo](...)is a technology investor". */
      const lead = /^\s/.test(raw) ? ' ' : '';
      const tail = /\s$/.test(raw) ? ' ' : '';
      const url = decodeEntities(href).trim();
      return `${lead}[${text}](${url})${tail}`;
    }
  );
  out = out.replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_m, _tag, inner) => mark(inner, '**'));
  out = out.replace(/<(em|i)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_m, _tag, inner) => mark(inner, '*'));
  out = out.replace(/<br\s*\/?>/gi, '\n');
  out = out.replace(/<[^>]+>/g, '');
  return toSourceText(decodeEntities(out));
}

/* Wrap the text in a marker, keeping any surrounding whitespace outside it.
   A marker around nothing but punctuation or space is dropped: Wix leaves
   stray bold on a trailing "." often enough to matter. */
function mark(inner, marker) {
  const text = inner.replace(/<[^>]+>/g, '');
  const body = text.trim();
  if (!body || !/[\w]/.test(decodeEntities(body))) return text;
  const lead = text.slice(0, text.length - text.trimStart().length);
  const tail = text.slice(text.trimEnd().length);
  return lead + marker + body + marker + tail;
}

/* The contents of the element opening at `open`, found by counting tags of the
   same name rather than by stopping at the first closing one. Ricos nests divs
   inside a div-backed paragraph, and a non-greedy match ends at the first
   </div>, which cuts a paragraph in half mid-word. */
function innerHtml(region, open, tag) {
  const start = region.indexOf('>', open) + 1;
  const scan = new RegExp(`<${tag}\\b|</${tag}>`, 'gi');
  scan.lastIndex = start;
  let depth = 1;
  let m;
  while ((m = scan.exec(region))) {
    depth += m[0][1] === '/' ? -1 : 1;
    if (depth === 0) return { inner: region.slice(start, m.index), end: scan.lastIndex };
  }
  return { inner: region.slice(start), end: region.length };
}

/* One entry per body element, in document order. */
export function readElements(region) {
  const elements = [];
  /* Four shapes carry body content. A heading is usually a bold, oversized
     paragraph, but Alessia's post uses a real <h2> -- both appear. */
  const re = /<(ol|ul)\b[^>]*>|<(h[1-6])\b[^>]*data-ricos-heading="[^"]*"[^>]*>|<(p|div)\b[^>]*data-ricos-paragraph="[^"]*"[^>]*>|<figure\b[^>]*data-hook="figure-IMAGE"[^>]*>/g;
  let m;
  while ((m = re.exec(region))) {
    const tag = m[1] || m[2] || (m[0].startsWith('<figure') ? 'figure' : m[3]);
    const { inner, end } = innerHtml(region, m.index, tag);
    /* A list's own paragraphs sit inside it, and consuming the whole element
       is what stops them being read a second time as loose prose. */
    re.lastIndex = end;
    if (tag === 'figure') {
      const id = inner.match(/<wow-image[^>]*\bid="([^"]+)"/);
      if (id) elements.push({ kind: 'image', assetId: decodeEntities(id[1]) });
      continue;
    }
    if (/^h[1-6]$/.test(tag)) {
      const text = inlineText(inner).replace(/\*\*/g, '').trim();
      if (text) elements.push({ kind: 'heading', text, plain: text });
      continue;
    }
    if (tag === 'ol' || tag === 'ul') {
      const items = [];
      const li = /<li\b[^>]*>/g;
      let item;
      while ((item = li.exec(inner))) {
        const got = innerHtml(inner, item.index, 'li');
        li.lastIndex = got.end;
        const text = inlineText(got.inner);
        if (text) items.push(text);
      }
      if (items.length) elements.push({ kind: 'list', ordered: tag === 'ol', items });
      continue;
    }
    const text = inlineText(inner);
    if (!text) continue; // spacer paragraphs: a lone <br>
    /* The same text without link syntax, for matching against og:description,
       which Wix writes as plain prose. */
    const plain = toSourceText(decodeEntities(inner.replace(/<[^>]+>/g, '')));
    /* A heading and a question are both *entirely* bold; only the heading is
       oversized. "**Hometown:** Ocean Township" is bold at both ends with
       prose in between, so testing for a leading and trailing <strong> would
       read it as a question -- what settles it is whether any text survives
       once the bold runs are removed. */
    const outsideBold = inner
      .replace(/<(strong|b)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
      .replace(/<[^>]+>/g, '');
    const bold = /<strong\b/i.test(inner) && !toSourceText(decodeEntities(outsideBold));
    /* Not every post marks its questions in bold. Adina's are set in the
       link blue Wix uses for interview prompts, with the answers left black,
       so a paragraph coloured throughout and holding no black text is a
       question too. Her "Hometown:" lines stay black and stay prose. */
    const blue = /#1155CC/i.test(inner) && !/color:\s*rgb\(0, 0, 0\)/i.test(inner);
    const big = bold && /font-size:\s*2[0-9]px/i.test(inner);
    /* A heading and a question are bold by definition, and the template
       already styles them that way, so the markers come back off. */
    const kind = big ? 'heading' : bold || blue ? 'question' : 'paragraph';
    elements.push({
      kind,
      text: kind === 'paragraph' ? text : text.replace(/\*\*/g, '').trim(),
      plain,
      /* Whether the source left a space at the end of this run. A sentence
         Wix broke in two is rejoined below, and only this says whether the
         break fell between words or inside one. */
      openEnded: /[\s ]$/.test(decodeEntities(inner.replace(/<[^>]+>/g, '')))
    });
  }
  return mergeSplitSentences(elements);
}

/* Wix stores a paragraph as several Ricos paragraphs when the author's text
   was pasted or wrapped around a link, so one sentence arrives in pieces:
   "...and the opportunity to build" + "analytics and processes from the
   ground up." Reading them as separate paragraphs would put a paragraph break
   mid-sentence, and in one post mid-word ("and glob" + "al topics"). A piece
   that stops without closing punctuation, followed by one that starts
   lowercase, is the same sentence. */
/* "**Hometown:** Turin, Italy" and "Where you currently live: New York City":
   the short labelled lines every post runs through before its questions. One
   of them ending without a full stop must not swallow the next. */
function isLabelLine(text) {
  return /^\*\*/.test(text) || /^[A-Z][^.!?]{0,40}:/.test(text);
}

function mergeSplitSentences(elements) {
  const merged = [];
  for (const el of elements) {
    const prev = merged[merged.length - 1];
    const continues =
      prev &&
      prev.kind === 'paragraph' &&
      el.kind === 'paragraph' &&
      !/[.!?:;"')\]”]$/.test(prev.text) &&
      !isLabelLine(el.text) &&
      /* A diary line rarely ends in a full stop and the next one opens with a
         digit, which is the exact shape this merge looks for. Left alone it
         runs a whole schedule together into three bullets, and glues the
         sign-off onto the last entry ("11pm bed, hopefully Weekends are
         mostly off"). Neither side of a diary line joins to anything. */
      !isDiaryEntry(el.text) &&
      !isDiaryEntry(prev.text);
    if (!continues) {
      merged.push({ ...el });
      continue;
    }
    /* Always a space. The break Wix stored was a paragraph break, which reads
       as one on the page whether or not either side kept a space character --
       joining "responsibility early" to "and keep learning" without one gives
       "earlyand". A split inside a word ("glob" + "al topics") only ever
       happens within a single list item, which is assembled whole elsewhere
       and never reaches this. */
    prev.text += ' ' + el.text;
    prev.plain += ' ' + el.plain;
  }
  return merged;
}

/* The lead paragraphs are the intro, which the template prints above the body.
   og:description is that same lead, truncated by Wix at ~300 characters, so it
   says exactly how many paragraphs to lift. */
export function splitIntro(elements, ogDescription) {
  /* Compared without any spaces at all. Wix builds og:description by running
     the lead paragraphs together, and it drops the space at every join it
     makes -- "one of the largest globalsoftware investment firms" -- so the
     two strings agree on their letters and nowhere else. */
  const squash = (s) => toSourceText(s).replace(/\s+/g, '');
  const target = squash(ogDescription);
  /* Several posts open with a photo above the first line of copy. The
     template prints the cover itself, so that image cannot stay ahead of the
     intro -- it becomes the first block instead. */
  let start = 0;
  while (start < elements.length && elements[start].kind === 'image') start++;
  const leadingImages = elements.slice(0, start);
  elements = elements.slice(start);

  const lead = [];
  let joined = '';
  let plain = '';
  for (const el of elements) {
    if (el.kind !== 'paragraph') break;
    const nextPlain = plain + squash(el.plain);
    const probe = nextPlain.slice(0, Math.min(nextPlain.length, target.length));
    if (!target.startsWith(probe.slice(0, Math.max(20, probe.length - 2)))) break;
    lead.push(el);
    joined = (joined ? joined + ' ' : '') + el.text;
    plain = nextPlain;
    if (plain.length >= target.length) break;
  }
  if (!lead.length) throw new Error('intro did not match og:description');
  return { intro: joined, rest: [...leadingImages, ...elements.slice(lead.length)] };
}

/* Every post ends with a daily diary: a run of lines that each open with a
   clock time. Wix has no list for them -- some authors typed them as loose
   paragraphs, others as the answer to a bold "Daily Diary" label -- but they
   are a schedule either way, and a schedule is a list. Requiring the clock
   keeps prose out: three consecutive paragraphs are common, three that all
   start with a time are not. */
const CLOCK = /^\**\d{1,2}(:\d{2})?\s*(am|pm)?\b/i;

/* An entry in the diary. Most are clocked, but authors write the vaguer parts
   of the day in words -- Meitar's runs "12:00 pm", "Afternoon", "8:00-9:00 pm",
   "Evening" -- and those belong in the list with the rest. */
function isDiaryEntry(line) {
  return CLOCK.test(line) || /^\**(morning|afternoon|evening|night)\b/i.test(line);
}

function splitSchedule(lines) {
  let n = 0;
  while (n < lines.length && isDiaryEntry(lines[n])) n++;
  const items = lines.slice(0, n);
  /* Three clocked lines is what makes this a schedule rather than three short
     paragraphs that happen to open with a number. */
  if (items.filter((line) => CLOCK.test(line)).length < 3) return null;
  /* A diary often signs off in prose -- "Weekends are mostly off, which I'm
     grateful for." That line is not an entry, so it stays a paragraph after
     the list rather than dragging the whole run back into one answer. */
  return { items, trailing: lines.slice(n) };
}

/* A label, not a question: no question mark and a few words at most. */
function isListLabel(label) {
  return !/\?/.test(label) && label.length <= 40;
}

/* Bold question, then everything up to the next bold or heading is its answer.
   A run of short lines under a heading (the daily diary) is a list. */
export function toBlocks(rest, images, name) {
  const blocks = [];
  let imageIndex = 0;
  for (let i = 0; i < rest.length; i++) {
    const el = rest[i];
    if (el.kind === 'heading') {
      blocks.push({ type: 'heading', text: el.text });
      /* A heading straight onto a schedule ("Daily Diary" set as a real
         heading, which is how half the posts write it). */
      const run = [];
      let j = i;
      while (j + 1 < rest.length && rest[j + 1].kind === 'paragraph') run.push(rest[++j].text);
      const schedule = splitSchedule(run);
      if (schedule) {
        blocks.push({ type: 'list', ordered: false, items: schedule.items });
        schedule.trailing.forEach((text) => blocks.push({ type: 'paragraph', text }));
        i = j;
      }
      continue;
    }
    if (el.kind === 'image') {
      const copied = images[imageIndex++];
      /* Wix left every one of these with an empty alt, which marks a
         photograph of the subject as decorative. The cover on the same page is
         labelled with her name, so these are too. */
      if (copied) blocks.push({ type: 'image', src: copied, alt: name });
      continue;
    }
    if (el.kind === 'list') {
      blocks.push({ type: 'list', ordered: el.ordered, items: el.items });
      continue;
    }
    if (el.kind === 'question') {
      const answer = [];
      while (i + 1 < rest.length && rest[i + 1].kind === 'paragraph') {
        answer.push(rest[++i].text);
      }
      /* "Daily Diary" is bold like a question, but what follows is a timetable
         rather than an answer. That is a heading over a list. */
      const schedule = isListLabel(el.text) ? splitSchedule(answer) : null;
      if (schedule) {
        blocks.push({ type: 'heading', text: el.text });
        blocks.push({ type: 'list', ordered: false, items: schedule.items });
        schedule.trailing.forEach((text) => blocks.push({ type: 'paragraph', text }));
        continue;
      }
      blocks.push({ type: 'qa', q: el.text, a: answer.join('\n\n') });
      continue;
    }
    blocks.push({ type: 'paragraph', text: el.text });
  }
  return blocks;
}

/* --------------------------------------------------------------------- media */

/* The archive holds Wix originals: one of Mor's in-body photos is 5.6MB, and
   the body renders at 720px wide. Match the covers already in src/images/ --
   1200px, which is generous for a 720px column and lands around 150KB.
   sips is macOS-only; this is a one-shot local import, so a machine without
   it keeps the original rather than failing the run. */
function shrink(file, max = 1200) {
  try {
    /* Several of these are PNGs that Wix serves under a .jpg id -- a 1200x1800
       photograph stored as PNG is 3MB and as JPEG is 200KB -- so the format is
       set every time, not only when the file is resized. Resampling is applied
       only to an image larger than the target: sips would happily blow a
       768px photo up to 1200 and make the file bigger. */
    const read = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', file], {
      encoding: 'utf8'
    });
    const [w, h] = ['pixelWidth', 'pixelHeight'].map(
      (key) => Number((read.match(new RegExp(`${key}:\\s*(\\d+)`)) || [])[1]) || 0
    );
    const resample = Math.max(w, h) > max ? ['--resampleHeightWidthMax', String(max)] : [];
    execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '80', ...resample, file], {
      stdio: 'ignore'
    });
  } catch {
    console.warn(`  ! could not resize ${path.basename(file)}; left as downloaded`);
  }
}

function copyImages(region, slug) {
  const ids = [...region.matchAll(/<figure\b[^>]*data-hook="figure-IMAGE"[^>]*>[\s\S]*?<wow-image[^>]*\bid="([^"]+)"/g)]
    .map((m) => decodeEntities(m[1]));
  const out = [];
  ids.forEach((id, n) => {
    const source = path.join(ARCHIVE, 'media', id);
    if (!fs.existsSync(source)) {
      console.warn(`  ! missing asset ${id}`);
      out.push(null);
      return;
    }
    const ext = path.extname(id.split('~mv2')[1] || id) || '.jpg';
    const name = `fff-${slug}-${n + 1}${ext}`;
    const dest = path.join(ROOT, 'src/images', name);
    if (!DRY_RUN) {
      fs.copyFileSync(source, dest);
      shrink(dest);
    }
    out.push(`images/${name}`);
  });
  return out;
}

/* ---------------------------------------------------------------- yaml output */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function importPost(entry) {
  const source = path.join(ARCHIVE, 'html/post', entry.file);
  const html = fs.readFileSync(source, 'utf8');
  const region = bodyRegion(html);

  const title = meta(html, /<title>([^<]*)<\/title>/);
  const author = meta(html, /"author":\{[^}]*"name":"([^"]+)"/);
  const published = meta(html, /"datePublished":"([^"]+)"/);
  const readTime = (html.match(/(\d+\s*min)\s*read/i) || [])[1] || '';
  const ogDescription = meta(html, /property="og:description" content="([^"]*)"/);
  /* Searched in the body, not the whole page: a post that never links its
     subject would otherwise pick up the first /in/ URL in the chrome. Both
     the scheme and the www are optional -- Meitar's profile is stored as
     "http://linkedin.com/in/meitar-landau?originalSubdomain=il" -- and the
     query string is dropped, since it only names the domain Wix saw it on. */
  const linkedin = (region.match(/https?:\/\/(?:[\w-]+\.)?linkedin\.com\/in\/[\w%-]+\/?/i) || [])[0] || '';

  /* datePublished is UTC, and the posts go out in the evening New York time:
     Adina's stamp reads 2026-05-22T03:12Z, which is May 21 to every reader the
     site has. Wix rendered the New York date, so that is the date, and the
     rendered string is checked against it rather than trusted blindly -- the
     card on the listing page has one of these a day out. */
  const when = new Date(published);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(when).reduce((acc, p) => ({ ...acc, [p.type]: p.value }), {});
  const isoDate = `${parts.year}-${parts.month}-${parts.day}`;
  const displayDate = `${MONTHS[Number(parts.month) - 1]} ${Number(parts.day)}`;
  const shown = meta(html, /data-hook="time-ago"[^>]*>([^<]+)</);
  if (shown && shown !== displayDate) {
    console.warn(`  ! ${entry.slug}: page shows "${shown}", stamp gives "${displayDate}"`);
  }

  const name = title.replace(/^FinTech Female Fridays:\s*Meet\s*/i, '').split(/,| - /)[0].trim();

  const images = copyImages(region, entry.slug);
  const elements = readElements(region);
  const { intro, rest } = splitIntro(elements, ogDescription);
  const blocks = toBlocks(rest, images, name);

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

  const dest = path.join(ROOT, 'src/posts', `${entry.slug}.html`);
  console.log(
    `${entry.slug}: ${blocks.length} blocks ` +
    `(${blocks.filter((b) => b.type === 'qa').length} qa, ${images.length} images), ` +
    `${author} · ${displayDate} · ${readTime}`
  );
  if (DRY_RUN) return;
  fs.writeFileSync(dest, frontMatter);
}

/* Importing this file (a test, a debug session) must not run the import. */
if (process.argv[1] === fileURLToPath(import.meta.url)) main();

function main() {
const only = flag('post', null);
const targets = only ? POSTS.filter((p) => p.slug === only) : POSTS;
if (!targets.length) {
  console.error(`No post named "${only}". Known: ${POSTS.map((p) => p.slug).join(', ')}`);
  process.exit(1);
}
for (const entry of targets) {
  try {
    importPost(entry);
  } catch (err) {
    console.error(`${entry.slug}: ${err.message}`);
    process.exitCode = 1;
  }
}
}
