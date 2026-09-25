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
