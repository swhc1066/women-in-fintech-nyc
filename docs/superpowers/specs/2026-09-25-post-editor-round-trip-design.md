# Phase 5 — the post editor reads and writes post data

*Design approved 2026-09-25. Revised the same day, before implementation,
after establishing who actually publishes a post. See "What changed and why".*

## Why

Posts became data in `0597d4d` and `fca87f4`: all seven Fintech Female Fridays
posts are front matter in `src/posts/`, rendered by `lib/render-blocks.mjs`.
The editor at `src/admin/` never moved. It still generates a finished HTML page
in the browser from its own copy of the renderer, which leaves three problems:

1. **A post cannot be reopened.** The editor writes a page and forgets it.
   Editing a published post means hand-editing front matter, which is exactly
   what the migration was meant to end.
2. **Two renderers.** `src/admin/templates.js` carries a port of
   `lib/render-blocks.mjs`. `tools/render-parity.mjs` exists only to prove they
   agree, and it could not catch the mangled-URL bug in `35e75f6` because both
   copies were wrong in the same way.
3. **Publishing is a paste job.** The editor emits three card snippets to paste
   into `fintech-female-fridays.html` and `index.html` by hand.

`templates.js` also holds the last copy of the site nav, drawer and footer —
the twelfth copy that `c344167` removed everywhere else.

## What changed and why

The first version of this design had the editor save straight into
`src/posts/` through the File System Access API, with a directory handle on the
repository. That assumed the person publishing has a checkout, a terminal and
git.

They don't. **A non-technical author publishes their own posts.** That makes
the directory-handle machinery work the real user would never touch, and it
moves publishing into its own phase, where it needs authentication and a way to
commit from a deployed page.

So this phase shrinks to what is needed either way — the format, one renderer,
generated cards — and the mechanism for getting a file into the repo is
designed separately. Round-trip editing survives the change: opening a file the
user picks and downloading the edited result needs no special browser API,
works on the deployed editor, and is the same hand-off the publishing phase
will replace.

A second content type also arrived with that answer: authors publish **general
blog posts as well as FFF interviews**. The file format is designed for both
here, because retrofitting a type field later means rewriting every post file.

## What success looks like

An author can open a published post in the editor, change it, and get back a
file that is exactly what the repository expects. One renderer exists. Adding a
post to the site does not involve pasting markup.

When this is done, `src/admin/templates.js` and `tools/render-parity.mjs` are
deleted.

## Decisions taken

| Question | Decision |
|---|---|
| Editor scope | Full round-trip: open an existing post, edit, write it back out |
| Open / save mechanism | File picker in, download out. No File System Access API |
| Cards | Rendered from the collection; snippet panel retired |
| Content types | Format carries a `type`; this phase builds `fff` only |
| Images | Unchanged in this phase; resizing belongs with publishing |
| `/admin` auth | Still none — and a hard prerequisite for the publishing phase |

## Operating assumption

**After handoff there is no developer.** The site is run by the people who
write for it. An author publishes and is done — no review step, no approval,
nobody to commit a file on their behalf, and nobody to fix a broken build.

Three things follow, and they outrank convenience everywhere they conflict:

- **Phase 7 is not optional.** Until it lands, publishing requires someone with
  a checkout, which is a person who will not exist. The download hand-off in
  this phase is a temporary state with a known end date, not a workflow.
- **The build must not break on bad input.** A malformed post cannot take the
  site down, because nobody will be there to debug it. Validation belongs
  where the author can see it — in the editor, before the file is written.
- **Errors must be readable by the person reading them.** "Unsupported block
  type at line 42" is for a developer. The audience is an author with no
  terminal and no repository.

## Roadmap this phase sits in

1. **Phase 5 (this spec)** — the post-file format, one renderer, generated
   cards.
2. **Phase 6** — the general blog post type: its listing page, URL pattern and
   nav entry. The format is ready for it here; the pages are not built here.
3. **Phase 7** — authenticated publishing. Sign-in from the site nav, and a
   signed-in author publishing a post or an FFF interview from the deployed
   editor, which commits to the repository and goes live. No review step and no
   approval queue: the author publishes and is done. Auth is a prerequisite of
   that phase, not an enhancement to it.

## Architecture

### Module loading

`lib/` stays at the repo root, where the Node tools already import it, and gets
a passthrough copy into the build:

```js
eleventyConfig.addPassthroughCopy({ lib: 'lib' });
```

The editor imports `/lib/render-blocks.mjs` by absolute path, which resolves
both on the deployed site and under `npm run dev`. `src/admin/*.js` become ES
modules, loaded with a single `<script type="module" src="main.js">`.

This does end opening the editor as a `file://` page, because ES module imports
are blocked over that scheme. The editor is a page on the site, served over
http, exactly as it is in production today.

No bundler and no new dependency. The renderer is already plain ESM.

### `lib/post-file.mjs` — the file format, both directions

New module owning the post file as a format, so reading and writing it cannot
drift:

```js
export function serializePost(post)   // post object -> file text
export function parsePost(text)       // file text -> post object
```

`serializePost` is the YAML emitter currently inside
`tools/import-wix-post.mjs` (`yamlValue`, `yamlBlocks`, the front-matter
assembly), moved here. The importer imports it rather than keeping its own.

`parsePost` reads **only the subset `serializePost` emits** — double-quoted
scalars, `|-` literal blocks, a `blocks:` list of maps, and `items:` sequences.
It is not a YAML implementation and must not pretend to be one: anything
outside that subset is an error naming the line, not a silent partial parse.
This is acceptable because every post file in `src/posts/` is generated by
`serializePost` and round-tripped through it on every save.

### Content types

Every post file carries a `type`, and this phase writes it into all seven
existing files:

| `type` | Meaning | Built |
|---|---|---|
| `fff` | A Fintech Female Fridays interview | This phase |
| `post` | A general blog post | Phase 6 |

`type` drives the layout, the permalink pattern and the collection a post joins.
`posts.11tydata.js` derives `tags` from it rather than hard-coding `'fff'`, so a
second type needs no change to the data file. The editor's existing type
registry in `src/admin/types.js` was built for exactly this and keeps its shape.

Nothing else about the `post` type is designed here. Its fields, listing page
and URL pattern are Phase 6's business; this phase only ensures the files do not
have to be rewritten when it arrives.

### Field mapping

The editor model and the file disagree on one key, and the spec fixes the
mapping rather than renaming either side:

| Editor model | Post file | Note |
|---|---|---|
| `date` | `displayDate` | Eleventy reserves `date` and would parse "Jul 10" as a timestamp |

Everything else matches by name: `name`, `slug`, `title`, `tag`, `role`,
`company`, `linkedin`, `author`, `isoDate`, `readTime`, `intro`, `blocks`, and
the optional `excerpt`, `metaDescription`, `ogTitle`, `ogImage`. `coverPath`
is derived as `images/fff-<slug>.jpg` and written explicitly.

Three fields are added to the format by this phase:

- `type` — as above.
- `excerpt` — optional. The card text. Defaults to `makeExcerpt(intro, 240)`.
  Needed because one existing card is not derivable: Samantha Lassoff's card
  reads "Samantha Lassoff works with founders, CEOs, and senior operators…"
  while her intro begins "Samantha Lassoff is an executive coach and leadership
  advisor who works with…". Her post file gets an explicit `excerpt` carrying
  today's copy.
- `gradient` — `g1`–`g7`, the grid card's colour. Explicit per post, following
  the precedent set by `team.json`: deriving it from position silently
  restyles every card when a post is added.

All three are also added to the `POSTS` manifest in
`tools/import-wix-post.mjs`, next to the `role` and `company` it already
carries for the same reason — none of them exists in the Wix archive. Without
that, rerunning the importer would strip them back out of all seven files.

### Blocks

The editor's block types must be exactly the renderer's: `qa`, `heading`,
`paragraph`, `quote`, `image`, `list`. `BLOCK_FIELDS` in `src/admin/types.js`
already matches `BLOCK_RENDERERS` in `lib/render-blocks.mjs`; this phase keeps
them in step by having the editor preview through the renderer itself, so an
unsupported block type is visible immediately rather than at build time.

### Cards from the collection

`src/_includes/post-card.njk` holds one macro per placement:

- `featured(post)` — the starred card at the top of `fintech-female-fridays.html`
- `grid(post)` — the cards below it, using `post.gradient`
- `home(post)` — the compact card in the homepage `#fff` section

Both pages loop the FFF collection sorted by `isoDate` descending:

- `fintech-female-fridays.html`: newest post as `featured`, **all** remaining
  posts as `grid`, newest first. Today that is 1 + 6, matching the page as it
  stands. The grid grows with the archive; pagination is a problem for when the
  page is long, not a thing to build now.
- `index.html`: the newest two as `home`

This also repairs the homepage by construction. Its second card is currently a
`<div>` rather than a link, and points at an un-migrated Wix filename
(`images/3b1c3b_c5700ebd78b84736bb77561e8c772375~mv2.avif`); generated cards
are links pointing at `coverPath`.

### Open and save

**Open** — a file input. The author picks a `.html` post file; `parsePost`
turns it into the model; the form and preview fill in. The same path accepts
the editor's own Export JSON, which stays as a draft-transfer format.

**Save** — a download of `serializePost(model)`, named `<slug>.html`, plus the
renamed cover image as today. Getting those two files into the repository is
someone else's job until Phase 7, and the editor says so plainly rather than
implying the post is live.

The editor therefore keeps working exactly where it works today: deployed at
`/admin`, and locally under `npm run dev`.

### Preview

The preview renders `renderBlocks(model.blocks)` plus the intro into an iframe
that loads `/site.css`, showing the article body only — no nav, drawer or
footer. That is what allows the chrome copy in `templates.js` to be deleted.
The full page, chrome included, is verified by the build, not by the editor.

## Error handling

- **Parse failure on open** — the editor reports the failing line and refuses
  to load, rather than opening a partially-parsed post that a later save would
  write back lossily.
- **Slug collision** — the editor cannot see the repository, so it cannot
  detect one. The build can: two posts with the same slug would collide on one
  permalink, so the build fails loudly on a duplicate slug rather than letting
  one post silently overwrite the other.
- **Unsupported block type in a file** — reported on open, not dropped.
- **A malformed post must not break the build.** Nobody will be on hand to
  debug one. The editor validates before it writes, and the build fails on a
  duplicate slug rather than silently dropping a post; both report in terms an
  author can act on.

## Security note

`/admin` is deployed, unlinked and unauthenticated, with `robots.txt` as the
only thing keeping it out of search results. That remains true in this phase and
is tolerable for the same reason it is tolerable today: the page can only
produce a file for whoever is looking at it. It has no access to the repository
and no secrets.

That stops being true in Phase 7. A page that can commit to the repository
must be authenticated first — auth is the prerequisite of that phase, and this
note is here so that ordering does not get lost.

## Testing

`npm test` runs `node --test tools/` — built in, no dependency added.

| Test | What it pins |
|---|---|
| `lib/post-file` round trip | `parsePost(serializePost(x))` deep-equals `x` for models covering every block type, empty fields, multi-paragraph answers, and text holding quotes, `#`, `:` and `---` |
| Real posts | All seven files in `src/posts/` parse, and re-serialize byte-identically |
| Cross-check | `parsePost` agrees with Eleventy's own front-matter read for all seven |
| Link integrity | The five URLs from `tools/render-parity.mjs` survive rendering intact |
| Escaping | The `escText` / `escAttr` / `safeUrl` cases from the parity harness, asserted against fixtures rather than against a second implementation |

`tools/render-parity.mjs` is deleted in the same commit that deletes
`templates.js`. Its assertions move; its reason for existing does not survive.

`tools/snapshot.mjs` stays as it is.

## Verification

- The seven post pages in `_site/` are **byte-identical** before and after.
- `fintech-female-fridays.html` and `index.html` change only in the intended
  ways: identical card markup, except the homepage's second card becomes a real
  link with a migrated image.
- `node tools/import-wix-post.mjs --all` still reproduces `src/posts/`
  byte-identically — after the emitter moves to `lib/post-file.mjs` and the
  manifest learns `type`, `gradient` and `excerpt`. This is the check that
  catches the emitter changing shape during the move.
- A post file is opened in the editor, edited, downloaded, and the result
  differs from the original only in the edit.

## Out of scope

- **Publishing.** Authentication, committing from the browser, and the sign-in
  entry in the nav are Phase 7.
- **The general post type's pages.** Phase 6.
- **Image resizing on upload.** It belongs with publishing, where an author
  uploads a phone photo over a commit API. Today the images come from the Wix
  importer, which already downscales.
- **A post management UI** beyond open and save — no list view, no delete, no
  reordering of the grid beyond `isoDate`.
- The signup page, which is its own piece of work and needs a decision about
  where submissions go.

## Risks

- **The hand-written parser is the sharp edge.** It is mitigated by keeping the
  subset narrow, failing loudly outside it, and cross-checking against
  Eleventy's own reader for every real post. If it starts needing YAML features
  to keep up, that is the signal to stop and reach for a real parser.
- **Card generation must match byte for byte** or the diff hides a real change
  inside reformatting. The snapshot harness compares against the build, so this
  is checkable rather than a matter of eyeballing.
- **The `type` field is a guess about Phase 6.** It is a cheap one — a single
  key per file, written while the files are being touched anyway — and the
  alternative is rewriting every post file later. But if the general post type
  turns out to need a different shape entirely, this does not save that work.
