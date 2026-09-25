/* Everything under src/posts/ is a Fintech Female Fridays post.
 *
 * A post file is front matter and nothing else: the body is the `blocks` list,
 * rendered by src/_includes/post.njk through lib/render-blocks.mjs.
 */
import { buildPostView, buildCardView } from '../../lib/render-blocks.mjs';

export default {
  layout: 'post.njk',

  /* A post keeps the listing page highlighted in the nav, not itself —
     matching what fff-shira-amrany.html did by hand. */
  active: 'fintech-female-fridays.html',

  eleventyComputed: {
    /* The view model does every derivation — title fallback, description from
       the intro, absolute OG URLs — so the template only prints.
       `date` is deliberately not an Eleventy front-matter key: Eleventy
       reserves it and would try to parse "Jul 10" as a timestamp. The display
       string is `displayDate`; `isoDate` is the sortable one. Collection
       membership and ordering for FFF posts are handled explicitly by the
       `fff` collection in eleventy.config.js, not by `tags` or Eleventy's
       default date sort -- see the comment there for why. */
    post: (data) => buildPostView({ ...data, date: data.displayDate }),

    /* The listing page and the homepage both print this, so it is derived once
       here rather than in two templates. */
    card: (data) => buildCardView(data),

    /* src/src.11tydata.js derives every URL from page.filePathStem, which is
       the *template's* path. Left alone that puts posts at /posts/<slug>.html,
       and once several posts share a generating template it would collide
       them all at one URL. Posts must stay at /fff-<slug>.html, where every
       inbound link already points.

       Two posts with one slug would write one file and lose the other.
       Nobody is watching this build after handoff to notice, so a collision
       fails the build instead of silently dropping a post. The registry is
       reset per build (see eleventy.config.js's eleventy.before handler) so a
       renamed or deleted post does not leave a stale entry that false-positives
       the next rebuild in the same `npm run dev` process. */
    permalink: (data) => {
      const seen = (globalThis.__postSlugs ||= new Map());
      const previous = seen.get(data.slug);
      const here = data.page.inputPath;
      if (previous && previous !== here) {
        throw new Error(`Two posts share the slug "${data.slug}": ${previous} and ${here}`);
      }
      seen.set(data.slug, here);
      return `fff-${data.slug}.html`;
    }
  }
};
