# Wix import (one-time)

How the site was migrated from astrolee.com (Wix), November 2026:

1. Download each page's HTML (`curl https://www.astrolee.com/<slug>`) into `pages/`. `pagemap.tsv` lists every Wix page id → URL.
2. `node features.js pages features` — fetches each page's Wix component data (text, image and video sources).
3. `node convert.js pages features converted` — turns each page into ordered content blocks.
4. `node gen.js <workdir> <repo>` — writes `src/projects/*.html`, the grid data files, and downloads media.
5. `node shrink.js <repo>` — converts heavy opaque PNGs to JPG (needs `npm i sharp`).

Re-running `gen.js` overwrites `src/projects/` and the grid JSON files — don't run it after hand-editing those.
