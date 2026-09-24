/* Canonicalize HTML so two documents can be compared for *meaningful* difference.
 *
 * Templating normalizes whitespace between tags, so a byte diff reports
 * hundreds of changes that render identically. This strips exactly that class
 * of noise and nothing else:
 *
 *   - whitespace-only text nodes BETWEEN block-level elements are dropped
 *   - runs of whitespace inside text are collapsed to one space
 *   - attributes are sorted (order is not semantic in HTML)
 *
 * Everything else is preserved: attribute values, comments, element order,
 * inline formatting, and whitespace inside <pre>, <textarea>, <script> and
 * <style>, where it IS semantic.
 */
import { parse, serialize } from 'parse5';

/* Elements where inner whitespace changes meaning or output. */
const PRESERVE_WS = new Set(['pre', 'textarea', 'script', 'style']);

/* Whitespace between these is layout-irrelevant. Inline elements are excluded
   because " <em>x</em>" and "<em>x</em>" genuinely differ on screen. */
const BLOCK = new Set([
  'html', 'head', 'body', 'div', 'section', 'article', 'aside', 'nav', 'header',
  'footer', 'main', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li',
  'dl', 'dt', 'dd', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th',
  'form', 'fieldset', 'figure', 'figcaption', 'blockquote', 'hr', 'br',
  'script', 'style', 'link', 'meta', 'title', 'iframe', 'picture', 'source'
]);

const isText = (n) => n.nodeName === '#text';
const isElement = (n) => !!n.tagName;

function canonicalizeNode(node, inPreserve = false) {
  if (node.attrs && node.attrs.length > 1) {
    node.attrs.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  }

  const children = node.childNodes;
  if (!children || !children.length) return;

  const preserveHere = inPreserve || (isElement(node) && PRESERVE_WS.has(node.tagName));

  if (!preserveHere) {
    const kept = [];
    for (let i = 0; i < children.length; i++) {
      const child = children[i];

      if (isText(child) && /^\s*$/.test(child.value)) {
        // Drop the node only when both neighbours are block-level (or absent),
        // so inter-word spacing around inline elements survives.
        const prev = children[i - 1];
        const next = children[i + 1];
        const blockish = (n) => !n || (isElement(n) && BLOCK.has(n.tagName));
        if (blockish(prev) && blockish(next)) continue;
        child.value = ' ';
        kept.push(child);
        continue;
      }

      if (isText(child)) child.value = child.value.replace(/\s+/g, ' ');
      kept.push(child);
    }
    node.childNodes = kept;
  }

  for (const child of node.childNodes) canonicalizeNode(child, preserveHere);
}

export function canonicalize(html) {
  const doc = parse(html);
  canonicalizeNode(doc);
  return serialize(doc);
}

export default canonicalize;
