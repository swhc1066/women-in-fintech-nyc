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
   get wrong -- but only if every line is indented and none trails a space.
   A `|-` block strip-chomps trailing newlines, so a value ending in one
   (trailing blank lines) would come back truncated -- and gray-matter, the
   reader Eleventy actually builds the site with, chomps the same way. Such a
   value goes out as a JSON string instead, which both our parser and
   gray-matter read back losslessly. */
export function yamlValue(value, indent) {
  const s = String(value == null ? '' : value);
  if (!s.includes('\n') || s.endsWith('\n')) return JSON.stringify(s);
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

  // `allowBool` is true only for block fields: `ordered: false` is the only
  // boolean serializePost ever writes, and it is always a block field. A
  // top-level or list-item value must stay a string even if its text happens
  // to be "true" or "false" -- coercing by guessing from the text would wrongly
  // turn an author's literal string into a boolean.
  const readScalar = (rest, indent, lineNo, allowBool = false) => {
    if (rest === '|-') return readLiteral(indent);
    if (allowBool && rest === 'true') return true;
    if (allowBool && rest === 'false') return false;
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
    // Body line i (0-based) is raw line i+2: the opening `---` is raw line 1.
    const lineNo = i + 2;
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
          block.items.push(readScalar(entry[1], 6, i + 2));
          i++;
        }
        continue;
      }
      block[key] = readScalar(rest, 4, lineNo, true);
      continue;
    }

    throw new Error(`Could not read line ${lineNo}: ${line.trim().slice(0, 60)}`);
  }

  post.blocks = blocks || [];
  return post;
}
