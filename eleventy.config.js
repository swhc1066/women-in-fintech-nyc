/* Eleventy build.
 *
 * PHASE 1 DELIBERATELY DOES NOTHING. Every file in src/ is copied to _site/
 * byte-for-byte with no templating, so this change can be proven inert:
 * `diff -r` between the build output and the pre-eleventy baseline must be
 * empty. Templating arrives in the next phase, once the build step itself is
 * known to be safe.
 *
 * Not in src/, and not seen by Eleventy:
 *   api/    — Vercel reads functions from the repo root regardless of output dir
 *   tools/  — dev-only regression harness
 */
export default function (eleventyConfig) {
  // Copy src/ to the output root, preserving structure exactly.
  eleventyConfig.addPassthroughCopy({ src: '.' });

  // Static assets shouldn't trigger a rebuild loop while serving.
  eleventyConfig.setServerOptions({ domDiff: false });

  return {
    dir: {
      input: 'src',
      output: '_site',
      includes: '_includes',
      data: '_data'
    },
    // Nothing is treated as a template in this phase.
    templateFormats: []
  };
}
