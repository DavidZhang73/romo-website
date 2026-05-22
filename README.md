# RoMo — Project Page

Project page for **RoMo: A Large-Scale, Richly Organized Dataset and Semantic Taxonomy for Human Motion Generation** (CVPR 2026).

🔗 Live: https://davidzhang73.github.io/romo-website/

## What it is

A single static page — **no build step**. Everything loads from CDNs and a few local data files. Drop the folder on any static host (GitHub Pages, etc.).

Features:
- **Anton** display logo + **Inter** body, soft light theme (no dark mode).
- **Motion Gallery** — real GLB clips played with [`<model-viewer>`](https://modelviewer.dev/), category filter + pagination, lazy-loaded.
- **Semantic Taxonomy** — interactive [markmap](https://markmap.js.org/) mind-map + [Plotly](https://plotly.com/javascript/) sunburst (toggle).
- **Filtering Pipeline** — scroll-driven funnel (scrollytelling) with animated counts.
- **Dataset Statistics** — Plotly charts (scale comparison, data sources, per-category).
- Sticky nav with scroll-spy, animated stat counters, scroll-reveal.

## Stack (all via CDN — see `<head>` of `index.html`)

| Lib | Use |
|-----|-----|
| Tailwind CSS (Play CDN) | layout/utilities + theme in inline `tailwind.config` |
| model-viewer | GLB playback |
| Plotly.js | charts + sunburst |
| markmap-view + d3 | taxonomy mind-map |
| Font Awesome, Academicons | icons |

> Tailwind runs from the Play CDN (zero build). It prints a console warning and ships unpurged — fine for a project page. For production, swap to the Tailwind CLI/PostCSS build.

## Layout

```
index.html              # the whole page: sections + CDN includes + SEO/meta + INLINE DATA
index.original.html     # pre-redesign backup (Bulma template)
static/
  css/romo.css          # custom design system: palette, funnel, cards, reveal
  js/app.js             # nav, counters, gallery, taxonomy, charts, pipeline, dropdown
  models/*.glb          # 159 motion clips (3 per category × 53)
  images/teaser.svg     # hero teaser figure
  videos/RoMo-teaser.jpg# og/twitter share image
.claude/launch.json     # local preview server config
```

Data is embedded directly in `index.html` as three inline JSON blocks (no separate
files, works over `file://` too):

- `<script type="application/json" id="motions-data">` — gallery manifest
- `<script type="application/json" id="taxonomy-data">` — `{totals, categories:[{name,count,subcategories:[...]}]}`
- `<script type="application/json" id="stats-data">` — headline numbers + dataSources + comparison (Table 1)

`app.js`'s `load()` reads these by id, falling back to `fetch()` if absent.

## Run locally

```bash
python3 -m http.server 8777
# open http://localhost:8777
```

Any static server works (`npx serve`, etc.). Just open `index.html` over HTTP (not `file://`) so `fetch()` of the JSON works.

## Develop / edit

- **Page content & sections** → `index.html`. Sections are plain HTML blocks; section ids feed the nav scroll-spy.
- **Styling** → Tailwind classes inline; anything custom lives in `static/css/romo.css`. Theme colors are in the `tailwind.config` block in `index.html`.
- **Behavior** → `static/js/app.js`, one IIFE with `init*()` functions wired in the `DOMContentLoaded` handler at the bottom. Each feature is self-contained (`initGallery`, `initTaxonomy`, `initCharts`, `initPipeline`, `initNav`, `initReveal`, `initDropdown`).

### Editing the data

Edit the inline JSON blocks in `index.html` (search for `id="..."-data`):

- **Gallery**: add a `.glb` to `static/models/` and append an entry to `motions-data`.
- **Taxonomy** (mind-map + sunburst): `taxonomy-data`.
- **Stat counters / comparison chart / source pie**: `stats-data`.
- **Filtering pipeline** steps: the `<article class="pstep">` blocks in the `#pipeline` section (`data-hours`, `data-drop`, `data-name` drive the funnel).

> Note: gallery + per-category counts derive from a representative subset; headline numbers (813,938 sequences, 54 categories, 2,065 subcategories, 28,874 atomic actions, 1,238 h) come from the paper. The comparison/source numbers are from Table 1 & Fig. 4 of the paper.

## Deploy

Push to the `romo-website` repo and enable GitHub Pages on the default branch (root). No CI needed.
