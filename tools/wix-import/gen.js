// Generate Eleventy source from converted Wix blocks + gallery data, and download media.
// Usage: node gen.js <scratchDir> <repoDir> [--no-download]
const fs = require('fs');
const path = require('path');
const [, , S, REPO, flag] = process.argv;
const DOWNLOAD = flag !== '--no-download';
const SRC = path.join(REPO, 'src');
const MEDIA = path.join(SRC, 'assets', 'media');
fs.mkdirSync(MEDIA, { recursive: true });

// ---------- page plan ----------
// wix slug -> { slug (new URL), kind, title override }
const ART = ['your-gaze', 'rage-box', 'jbb'];
const RENAME = { 'copy-of-oil': 'dry', 'copy-of-shattered': 'foxtrail', 'copy-of-fox-trail-1': 'voyage' };
const SKIP = ['blog', 'post', 'fullscreen-page', 'contact', 'home', 'work', 'motion', 'archive', 'info', 'art', 'resume'];
const WIXID_TO_SLUG = {}; // filled from pagemap.tsv
for (const line of fs.readFileSync(path.join(S, 'pagemap.tsv'), 'utf8').trim().split('\n')) {
  const [id, uri] = line.split('\t');
  WIXID_TO_SLUG['#' + id] = RENAME[uri] || uri;
}

// ---------- media ----------
const queue = new Map(); // local file -> remote candidates
const short = id => id.replace(/^(3adf94|a3c153)_/, '').slice(0, 12);
function img(uri, w) {
  const ext = (/\.(png|jpe?g|gif|webp)$/i.exec(uri) || [, 'jpg'])[1].toLowerCase().replace('jpeg', 'jpg');
  const id = uri.replace(/~mv2.*$/, '').replace(/\.\w+$/, '');
  let file = `${short(id)}.${ext}`;
  // shrink.js may already have turned this PNG into a JPG
  if (ext === 'png' && !fs.existsSync(path.join(MEDIA, file)) && fs.existsSync(path.join(MEDIA, `${short(id)}.jpg`))) file = `${short(id)}.jpg`;
  const width = Math.min(w || 2000, 2000);
  queue.set(file, [`https://static.wixstatic.com/media/${uri}/v1/fit/w_${width},h_${width * 2},q_90/${uri}`, `https://static.wixstatic.com/media/${uri}`]);
  return `/assets/media/${file}`;
}
function vid(id) {
  const file = `${short(id)}.mp4`;
  queue.set(file, ['720p', '480p', '360p'].map(q => `https://video.wixstatic.com/video/${id}/${q}/mp4/file.mp4`));
  return `/assets/media/${file}`;
}
function poster(id) {
  const file = `${short(id)}-poster.jpg`;
  queue.set(file, [`https://static.wixstatic.com/media/${id}f003.jpg/v1/fit/w_1280,h_1280,q_85/${id}f003.jpg`, `https://static.wixstatic.com/media/${id}f003.jpg`]);
  return `/assets/media/${file}`;
}

// ---------- block rendering ----------
const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
function fixLinks(html) {
  return html
    .replace(/href="https?:\/\/(?:www\.)?astrolee\.com\/?([^"#?]*)([^"]*)"/g, (m, p, rest) => `href="/${RENAME[p] || p}${p ? '/' : ''}${rest}"`)
    .replace(/href="\/\/"/g, 'href="/"');
}
function renderBlock(b) {
  if (b.type === 'text') return `<div class="text">\n${fixLinks(b.html).replace(/<\/p>\s*<p>/g, '</p>\n<p>')}\n</div>`;
  if (b.type === 'image') {
    const src = img(b.uri, b.w);
    const tag = `<img src="${src}" alt="${esc(b.alt)}" loading="lazy"${b.w && b.h ? ` width="${b.w}" height="${b.h}"` : ''}>`;
    return b.link ? `<a href="${esc(fixLinks(`href="${b.link}"`).slice(6, -1))}">${tag}</a>` : `<figure>${tag}</figure>`;
  }
  if (b.type === 'video') {
    if (b.kind === 'youtube') return `<div class="embed"><iframe src="https://www.youtube-nocookie.com/embed/${b.id}" title="YouTube video" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>`;
    if (b.kind === 'vimeo') return `<div class="embed"><iframe src="https://player.vimeo.com/video/${b.id}?dnt=1" title="Vimeo video" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>`;
    const src = vid(b.id);
    const ambient = b.autoplay || !b.controls;
    return `<video src="${src}" poster="${poster(b.id)}" playsinline preload="metadata"${ambient ? ' autoplay muted loop' : ' controls'}${b.loop && !ambient ? ' loop' : ''}></video>`;
  }
  if (b.type === 'embed') return `<div class="embed"><iframe src="${esc(b.url)}" title="Embedded sketch" loading="lazy"></iframe></div>`;
  return '';
}
// Group consecutive blocks that sat side by side on Wix (their widths fit within ~1000px) into rows.
function layout(blocks) {
  const out = [];
  let row = [];
  const flush = () => {
    if (row.length === 1) out.push(renderBlock(row[0]));
    else if (row.length) out.push(`<div class="row">\n${row.map(b => `<div class="col" style="--w:${Math.round(b.dw)}">\n${renderBlock(b)}\n</div>`).join('\n')}\n</div>`);
    row = [];
  };
  for (const b of blocks) {
    const media = b.type === 'image' || b.type === 'video';
    const w = b.dw || 980;
    const sum = row.reduce((a, x) => a + (x.dw || 980), 0);
    const sameKind = row.length && ((row[0].type === 'text') === (b.type === 'text'));
    if (row.length && sameKind && sum + w <= 1010 && w < 900 && (media || w < 700)) row.push(b);
    else { flush(); row = [b]; }
  }
  flush();
  return out.join('\n\n');
}

// ---------- project pages ----------
const fm = o => '---\n' + Object.entries(o).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join('\n') + '\n---\n';
const titleOf = t => t.replace(/\s*\|\s*Astro Lee.*$/i, '').trim();
fs.mkdirSync(path.join(SRC, 'projects'), { recursive: true });
const written = [];
for (const f of fs.readdirSync(path.join(S, 'converted')).filter(f => f.endsWith('.json') && !f.startsWith('_'))) {
  const c = JSON.parse(fs.readFileSync(path.join(S, 'converted', f), 'utf8'));
  if (SKIP.includes(c.slug)) continue;
  const slug = RENAME[c.slug] || c.slug;
  let blocks = c.blocks;
  const isArt = ART.includes(c.slug);
  if (isArt) blocks = blocks.filter(b => !(b.type === 'text' && /new media art/.test(b.html)));
  const title = titleOf(c.title);
  const front = { title, layout: isArt ? 'layouts/art.njk' : 'layouts/project.njk', permalink: `/${slug}/` };
  if (['show', 'reel'].includes(c.slug)) front.layout = 'layouts/page.njk';
  fs.writeFileSync(path.join(SRC, 'projects', `${slug}.html`), fm(front) + '\n' + layout(blocks) + '\n');
  written.push(slug);
}

// ---------- galleries (work / motion / archive) ----------
function galleryItems(page) {
  const h = fs.readFileSync(path.join(S, 'pages', page + '.html'), 'utf8');
  const BS = String.fromCharCode(92);
  const items = []; const seen = new Set();
  for (const m of h.matchAll(/\{"itemId":"([0-9a-f-]{36})"/g)) {
    let i = m.index, depth = 0, inStr = false, e = false;
    for (; i < h.length; i++) { const ch = h[i];
      if (inStr) { if (e) e = false; else if (ch === BS) e = true; else if (ch === '"') inStr = false; continue; }
      if (ch === '"') inStr = true; else if (ch === '{') depth++; else if (ch === '}' && --depth === 0) break; }
    let it; try { it = JSON.parse(h.slice(m.index, i + 1)); } catch { continue; }
    if (seen.has(it.itemId)) continue; seen.add(it.itemId);
    items.push({ ...it, html: h.slice(Math.max(0, m.index - 3000), m.index) });
  }
  return items;
}
function toCard(it) {
  const md = it.metaData || {};
  const l = md.link || {};
  let href = l.url || '';
  if (!href && l.data && l.data.pageId) href = WIXID_TO_SLUG[l.data.pageId] ? `/${WIXID_TO_SLUG[l.data.pageId]}/` : '';
  const card = { title: md.title || '', description: md.description || '', href, external: /^https?:/.test(href) };
  if (md.type === 'video' && md.source === 'youtube') { card.youtube = /(?:v=|youtu\.be\/)([\w-]+)/.exec(md.videoUrl)[1]; card.image = md.poster ? img(md.poster.url || it.mediaUrl, 1280) : `https://i.ytimg.com/vi/${card.youtube}/maxresdefault.jpg`; }
  else if (md.type === 'video' && md.source === 'vimeo') { card.vimeo = /vimeo\.com\/(\d+)/.exec(md.videoUrl)[1]; card.image = img(it.mediaUrl, 1280); }
  else if (md.type === 'video') { card.video = vid(it.mediaUrl); card.image = poster(it.mediaUrl); }
  else card.image = img(it.mediaUrl, 1280);
  if (card.image && card.image.includes('maxresdefault')) card.image = `https://i.ytimg.com/vi/${card.youtube}/hqdefault.jpg`;
  card.width = md.width; card.height = md.height;
  return card;
}
const DATA = path.join(SRC, '_data');
fs.mkdirSync(DATA, { recursive: true });
const sortOrder = arr => arr.sort((a, b) => a.orderIndex - b.orderIndex);
// Fox Trail and the second God Glasses tile had no link on Wix; Fox Trail now points at its project page.
const work = sortOrder(galleryItems('work')).map(toCard);
const motion = sortOrder(galleryItems('motion')).map(toCard);
for (const c of motion) if (c.title === 'Fox Trail' && !c.href) c.href = '/foxtrail/';
fs.writeFileSync(path.join(DATA, 'work.json'), JSON.stringify(work, null, 2));
fs.writeFileSync(path.join(DATA, 'motion.json'), JSON.stringify(motion, null, 2));
// Archive: three galleries in page order: time-based live action, animation, other mediums.
const arch = galleryItems('archive');
const groups = { live: [], animation: [], other: [] };
const LIVE = ['Sequence: In silence', 'Hand shot Videography', 'Roman: Series of Album Trailer', 'YSON Interview'];
const OTHER = ['Fabricated things', 'Model Photography', 'Performance', 'Mixed Media Painting', 'Oil', 'Dry', 'Installation: Objects'];
for (const it of arch) {
  const t = (it.metaData || {}).title;
  (LIVE.includes(t) ? groups.live : OTHER.includes(t) ? groups.other : groups.animation).push(it);
}
for (const k of Object.keys(groups)) groups[k] = sortOrder(groups[k]).map(toCard);
fs.writeFileSync(path.join(DATA, 'archive.json'), JSON.stringify(groups, null, 2));

// ---------- extra media referenced directly by hand-written pages ----------
const extras = {
  homeVideo: vid('3adf94_706993f668b74177b6e6825c0bd01d25'),
  portrait: img('3adf94_6d8e4fc241634801b398ec6e02451f69~mv2.jpg', 800),
  artCover: img('3adf94_34b19a3adb0047a68b69f5d9dbd254a3~mv2.jpg', 1600),
  archiveIconTime: img('a3c153_36a8697eda5343fb9c6f173f511cd22e~mv2.png', 160),
  archiveIconOther: img('a3c153_5de7d3dd2a174fc4b04166c8fec34b50~mv2.png', 160),
  favicon: img('3adf94_84d2a29f39fb4c978d5711bad84c100b~mv2.png', 192),
};
fs.writeFileSync(path.join(DATA, 'media.json'), JSON.stringify(extras, null, 2));

console.log('project pages:', written.length, written.join(' '));
console.log('media files queued:', queue.size);

// ---------- download ----------
(async () => {
  if (!DOWNLOAD) return;
  let ok = 0, bytes = 0; const failed = [];
  const entries = [...queue];
  const worker = async () => {
    while (entries.length) {
      const [file, urls] = entries.shift();
      const dest = path.join(MEDIA, file);
      if (fs.existsSync(dest) && fs.statSync(dest).size > 0) { ok++; continue; }
      let done = false;
      for (const u of urls) {
        try { const r = await fetch(u); if (!r.ok) continue; const buf = Buffer.from(await r.arrayBuffer()); fs.writeFileSync(dest, buf); bytes += buf.length; done = true; break; } catch { }
      }
      done ? ok++ : failed.push(file + ' <- ' + urls[0]);
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  console.log(`downloaded ${ok}/${queue.size} (${(bytes / 1e6).toFixed(0)} MB new)`);
  if (failed.length) console.log('FAILED:\n' + failed.join('\n'));
})();
