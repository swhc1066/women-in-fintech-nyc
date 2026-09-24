/* Everything under src/posts/ is a Fintech Female Fridays post.
 *
 * A post file is front matter and nothing else: the body is the `blocks` list,
 * rendered by src/_includes/post.njk through lib/render-blocks.mjs.
 */
import { buildPostView } from '../../lib/render-blocks.mjs';

export default {
  layout: 'post.njk',
  tags: 'fff',

  /* A post keeps the listing page highlighted in the nav, not itself —
     matching what fff-shira-amrany.html did by hand. */
  active: 'fintech-female-fridays.html',

  /* src/src.11tydata.js derives every URL from page.filePathStem, which is the
     *template's* path. Left alone that puts posts at /posts/<slug>.html, and
     once several posts share a generating template it would collide them all
     at one URL. Posts must stay at /fff-<slug>.html, where every inbound link
     already points. */
  permalink: (data) => `fff-${data.slug}.html`,

  eleventyComputed: {
    /* The view model does every derivation — title fallback, description from
       the intro, absolute OG URLs — so the template only prints.
       `date` is deliberately not an Eleventy front-matter key: Eleventy
       reserves it and would try to parse "Jul 10" as a timestamp. The display
       string is `displayDate`; `isoDate` is the sortable one. */
    post: (data) => buildPostView({ ...data, date: data.displayDate })
  }
};
