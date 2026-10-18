# studfing — Meridian study workspace (static build)

A fully client-side study environment: course articles, a concept graph,
question bank, practice activities, and a 3-panel PDF reader
(browser | viewer | study tools). **No server required** — deploy the folder
as-is to any static host (Vercel, GitHub Pages, Netlify) or preview locally
with any static file server, e.g. `python -m http.server` or `npx serve`.

## What's inside

- `index.html` + `static/` — the app (vanilla JS, no build step, no CDN).
- `api/` — precomputed JSON: articles, questions, graph, sources, library,
  per-article pages, per-document related links, activities, text extracts,
  slide-preview metadata.
- `static/img/` — pre-rendered document pages (320px thumbnails + 1600px
  reading size) so the reader works with zero backend rendering.
- `static/previews/` — unmodified slide renders cited by articles.
- `Learning material/`, `pastypaper/` — the original course PDFs.
- `data/` — source knowledge-base JSON.

## Differences from the live Flask version

This is a frozen, shareable snapshot. Removed on purpose:

- Upload / rename / re-title / reprocess / remove actions (no writable disk).
- AI features (Ask, Explain, Generate — they need a server-side API key).
  Practice uses the precomputed activity bank instead.
- Server-side progress sync. Reading progress, bookmarks, and notes are
  stored per-browser in `localStorage`, so every visitor starts fresh and
  keeps their own state.

Everything else — articles, questions, visuals, activities, search (global
palette + in-document), page navigation, zoom/fit, thumbnails, selectable
text view, related links, notes, mobile layout — works offline of any backend.

## Deploy

Vercel: import this repo, framework preset “Other”, no build command, no
output directory. Deep links are hash routes (`#/read/…`), so no rewrites
needed.
