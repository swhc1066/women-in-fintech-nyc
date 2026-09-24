/* Keep the site's existing URLs.
 *
 * Eleventy would otherwise turn src/events.html into /events/index.html,
 * serving it at /events/. Every inbound link, bookmark and search result points
 * at /events.html, and the Wix migration is already going to break enough URLs
 * without this one moving too. filePathStem is the path minus the extension,
 * so /events becomes /events.html — exactly where the file is today.
 */
export default {
  permalink: (data) => `${data.page.filePathStem}.html`
};
