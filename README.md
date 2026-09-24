# NYC Fintech Women

Static marketing website for NYC Fintech Women, a community for women building careers and companies in fintech.

## Pages

| Page | File |
|------|------|
| Home | `index.html` |
| Events | `events.html` |
| Fintech Female Fridays | `fintech-female-fridays.html` |
| Inspiring Fintech Females | `inspiring-fintech-females.html` |
| Co-Founder Matching | `co-founder-matching.html` |
| Meet the Team | `meet-the-team.html` |
| FFF post pages | `fff-<slug>.html` (generated — see below) |
| Post editor | `admin/index.html` |

## Tech stack

- Plain HTML and CSS, built with [Eleventy](https://www.11ty.dev/)
- Shared styles in `src/site.css`
- Mobile-first, responsive layout

## Local development

```bash
npm install
npm run dev      # builds and serves with live reload
```

Then visit [http://localhost:8080](http://localhost:8080).

`npm run build` writes the site to `_site/`, which is what Vercel deploys.
`_site/` is generated — never edit it, and never commit it.

### Verifying a change didn't break anything

```bash
npm run verify             # compare the build against the pre-eleventy baseline
npm run verify:self-test   # confirm the check can still detect a change
```

`npm run verify` canonicalizes HTML before comparing, so the whitespace a
template engine reflows is ignored while real changes are still caught.

## Project structure

```
.
├── src/                 # everything the site is built from
│   ├── index.html
│   ├── events.html
│   ├── fintech-female-fridays.html
│   ├── inspiring-fintech-females.html
│   ├── co-founder-matching.html
│   ├── meet-the-team.html
│   ├── fff-shira-amrany.html   # A generated Fintech Female Fridays post
│   ├── site.css
│   ├── nav-mobile.js
│   ├── robots.txt
│   ├── images/
│   └── admin/           # Post editor (not linked from the site)
├── api/                 # Vercel Functions — must stay at the repo root,
│   └── events.js        # NOT in src/, or Vercel won't detect them
├── tools/               # Dev-only regression harness (not deployed)
│   ├── htmlcanon.mjs
│   └── snapshot.mjs
├── eleventy.config.js
├── _site/               # Build output — generated, gitignored
└── design/              # Reference PDFs from the design process
```

> Files in `src/` are currently copied verbatim — no templating yet. That is
> deliberate: it let the build step be introduced and proven inert before any
> page was converted to a template.

## Luma events integration

The **Upcoming** section of `events.html` is populated from a Luma calendar.

The Luma API key is scoped to an entire calendar and grants **full access** to
it — creating and cancelling events, reading guest lists. It can never be sent
to the browser, so `api/events.js` (a Vercel Function) is the only thing that
holds it. The browser calls `/api/events`, which returns a narrow allowlist of
public display fields.

### Setup

1. Get a key at `luma.com/calendar/manage/api-keys` (Settings → Developer).
   Requires a **Luma Plus** subscription on that calendar.
2. Local: `cp .env.example .env` and paste the key into `.env`. It is
   gitignored — never commit it.
3. Production: add `LUMA_API_KEY` in the Vercel dashboard under
   Settings → Environment Variables, then redeploy.

### Local development

`npm run dev` serves static files only and cannot run `/api`, so the events
section will show its fallback. To run the function locally use `vercel dev`
(Vercel CLI), which reads `.env` automatically.

### Behaviour

- Events are fetched at page load, sorted soonest-first, capped at 24.
- Private events are excluded; members-only events are shown and labelled.
- `geo_address_json.city` maps onto the New York / San Francisco / Chicago
  filter chips. Anything else appears only under "All cities".
- Responses are CDN-cached for 5 minutes (`s-maxage=300`) so traffic never
  approaches Luma's rate limit of 200 requests/minute per calendar.
- **If Luma is unreachable, unconfigured, or empty, the hardcoded events in
  `events.html` stay on the page.** That fallback is deliberate — edit those
  cards if you want a different safety net. Check the browser console for a
  `[events]` warning explaining which case was hit.

## Post editor

`admin/index.html` is a client-side authoring tool for Fintech Female Fridays
posts. There is no backend and no database — it generates a finished HTML file
that you download and commit.

Open it at [http://localhost:8000/admin/](http://localhost:8000/admin/) (it also
works by opening the file directly). Fill in the form, watch the live preview,
then:

1. **Download HTML** → save `fff-<slug>.html` to the repo root.
2. **Download renamed image** → save it into `images/`.
3. Copy the **featured** and **grid** card snippets into `fintech-female-fridays.html`,
   and the **homepage** card into the `#fff` section of `index.html`.
4. Commit all the changed files together.

Drafts autosave to `localStorage`, so a reload won't lose work — but the image
file itself must be re-selected (only its path is stored). Use **Export JSON** to
move a draft between machines.

### Maintenance

`admin/templates.js` contains its own copy of the site nav, mobile drawer, and
footer, because this site has no templating — every page carries that markup
inline. **When you change the nav or footer, update `admin/templates.js` too**,
or newly generated posts will drift from the rest of the site.

`admin/` is deployed but unlinked and has no password. `robots.txt` keeps it out
of search results; it does not make it private.

## Design

The site follows the v6 "Refresh" brand direction: pink-magenta and deep plum palette, Fraunces display type, and soft radial background washes. Design reference files live in `design/`.
