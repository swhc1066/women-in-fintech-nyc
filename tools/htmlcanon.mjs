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

/* Containers this site declares display:flex or display:grid. A whitespace-only
   text node between flex or grid items generates no anonymous item, so it never
   renders — regardless of whether the children are inline elements. Derived from
   the `display: flex|grid` rules in site.css and index.html's inline <style>;
   re-derive it if those change. This is what lets pretty-printed markup and
   single-line markup compare equal inside the nav, dropdowns and card grids. */
const FLEX_CONTAINERS = new Set([
  'btn', 'dropdown', 'event', 'event-body', 'event-img', 'event-meta',
  'events-grid', 'date-chip', 'floating-stat', 'foot-bot', 'foot-brand',
  'foot-grid', 'hero-ctas', 'hero-grid', 'iff-card', 'iff-row', 'logo',
  'marquee-track', 'mobile-nav-brand', 'mobile-nav-close', 'mobile-nav-foot',
  'mobile-nav-head', 'mobile-nav-panel', 'mobile-nav-trigger', 'nav-cta',
  'nav-inner', 'nav-links', 'nav-toggle', 'partner-inner', 'partner-stats',
  'pill', 'sec-head', 'tile', 'why-card', 'why-grid', 'num',
  'mobile-nav-sub', 'mobile-nav-body', 'foot-col',
  // .has-menu is not itself flex, but its only block child (.dropdown) is
  // position:absolute and therefore out of flow, which leaves any whitespace
  // around it as trailing whitespace in an inline context — also not rendered.
  'has-menu'
]);

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

function isFlexContainer(node) {
  if (!isElement(node) || !node.attrs) return false;
  const cls = node.attrs.find((a) => a.name === 'class');
  if (!cls) return false;
  return cls.value.split(/\s+/).some((c) => FLEX_CONTAINERS.has(c));
}

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
        const prev = children[i - 1];
        const next = children[i + 1];
        const blockish = (n) => !n || (isElement(n) && BLOCK.has(n.tagName));

        // Between two block-level elements, whitespace never renders.
        if (blockish(prev) && blockish(next)) continue;

        // Inside a flex or grid container, whitespace-only nodes never render.
        if (isFlexContainer(node)) continue;

        // Leading or trailing whitespace inside a block container is stripped
        // by CSS white-space processing, so it cannot render either. This is
        // what separates one-line markup from the same markup pretty-printed:
        //   <div class="has-menu"><a>  vs  <div class="has-menu">\n  <a>
        if (isElement(node) && BLOCK.has(node.tagName) && (!prev || !next)) continue;

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
