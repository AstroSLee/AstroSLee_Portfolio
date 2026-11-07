# Astro S. Lee — Portfolio

Personal portfolio site, rebuilt from the Wix site at astrolee.com as hand-editable code.
Built with [Eleventy](https://www.11ty.dev/) (plain HTML/CSS, no framework) and deployed to GitHub Pages.

## Run it locally

```bash
npm install
npm start          # http://localhost:8080, reloads on save
npm run build      # writes the finished site to _site/
```

## Where things live

| What | File |
|---|---|
| Name, tagline, menu, contact links, art sidebar list | `src/_data/site.json` |
| Creative Tech grid tiles | `src/_data/work.json` |
| Motion grid tiles | `src/_data/motion.json` |
| Archive tiles (hidden page) | `src/_data/archive.json` |
| Home, Info, Art, Archive, Resume pages | `src/index.njk`, `src/info.njk`, `src/art.njk`, `src/archive.njk`, `src/resume.njk` |
| Project pages (one per project) | `src/projects/*.html` |
| All styling (colours, fonts, spacing tokens at the top) | `src/assets/css/main.css` |
| Header, footer, page shells | `src/_includes/layouts/*.njk` |
| Images, videos, resume PDF | `src/assets/media/` |
| Old Wix URLs that now redirect | `src/_data/redirects.json` |

**Hidden pages** (`/show/`, `/resume/`, `/archive/`) exist but are not in the menu — same as on Wix.

### Add a project

1. Put media in `src/assets/media/`.
2. Create `src/projects/my-project.html` (or `.md`):

   ```html
   ---
   title: "My Project"
   layout: "layouts/project.njk"     # or layouts/art.njk for the Art section sidebar
   permalink: "/my-project/"
   ---
   <div class="text">
   <p class="lg"><b><em>My Project</em></b></p>
   <p>Description…</p>
   </div>

   <figure><img src="/assets/media/cover.jpg" alt="…"></figure>

   <div class="row">
   <div class="col" style="--w:2"><img src="/assets/media/a.jpg" alt=""></div>
   <div class="col" style="--w:1"><img src="/assets/media/b.jpg" alt=""></div>
   </div>
   ```

   `--w` sets each column's relative width. Text classes: `lg`, `md`, `sm`, `gap` (spacer).
3. Add a tile to `src/_data/work.json` or `motion.json`:

   ```json
   { "title": "My Project", "href": "/my-project/", "image": "/assets/media/cover.jpg", "video": "/assets/media/loop.mp4" }
   ```

   `video` is optional (a muted looping preview). For an external link set `"external": true`.

Videos: autoplaying tiles use small MP4s in the repo. For long films, embed Vimeo/YouTube instead:
`<div class="embed"><iframe src="https://player.vimeo.com/video/ID" allowfullscreen></iframe></div>`.
GitHub rejects single files over 100 MB.

## Deploying

Every push to `main` runs `.github/workflows/deploy.yml`, which builds the site and publishes it to GitHub Pages
(repo **Settings → Pages → Source: GitHub Actions**).

- Project URL: `https://astroslee.github.io/AstroSLee_Portfolio/` (built with `npm run build:pages`, which adds the path prefix).
- Custom domain: add `astrolee.com` under Settings → Pages, point DNS at GitHub, then switch the workflow's build step to `npm run build`.

## Wix import tools

`tools/wix-import/` holds the scripts that pulled text, layout and media out of the Wix site. They are kept for reference;
the site no longer depends on Wix.
