/* Eleventy build.
 *
 * The 11 pages are processed as Nunjucks templates so the nav, mobile drawer
 * and footer can live in one place instead of twelve. Output paths are
 * unchanged: src/events.html still becomes /events.html, not /events/.
 *
 * Not templated:
 *   src/admin/  — the post editor is its own app; copied verbatim
 *   api/        — Vercel reads functions from the repo root, outside src/
 *   tools/      — dev-only regression harness
 */
export default function (eleventyConfig) {
  // The editor is a standalone app. Keep Eleventy out of it entirely, or its
  // markup would be parsed as a template and its output path rewritten.
  eleventyConfig.ignores.add('src/admin/**');

  eleventyConfig.addPassthroughCopy({ 'src/admin': 'admin' });
  eleventyConfig.addPassthroughCopy({ 'src/images': 'images' });
  eleventyConfig.addPassthroughCopy({ 'src/site.css': 'site.css' });
  eleventyConfig.addPassthroughCopy({ 'src/nav-mobile.js': 'nav-mobile.js' });
  eleventyConfig.addPassthroughCopy({ 'src/robots.txt': 'robots.txt' });

  /* A page is "current" if the link is its own, and a dropdown parent is
     current if any of its children is. Kept as a filter because Nunjucks
     cannot assign to an outer variable from inside a loop. */
  eleventyConfig.addFilter('isCurrent', (item, active) => {
    if (!active) return false;
    if (item.href === active) return true;
    if (item.match === active) return true;
    return (item.children || []).some((child) => child.href === active);
  });

  /* On the page a link points at, the site links to an anchor rather than
     reloading itself: events.html#past becomes #past on events.html. */
  eleventyConfig.addFilter('selfLink', (href, selfPage) =>
    selfPage && href.startsWith(selfPage + '#') ? href.slice(selfPage.length) : href
  );

  eleventyConfig.setServerOptions({ domDiff: false });

  return {
    dir: {
      input: 'src',
      output: '_site',
      includes: '_includes',
      data: '_data'
    },
    templateFormats: ['html'],
    htmlTemplateEngine: 'njk'
  };
}
