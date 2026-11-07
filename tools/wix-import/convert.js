// Convert downloaded Wix pages into ordered content blocks.
// Usage: node convert.js <pagesDir> <featuresDir> <outDir>
// Output: <outDir>/<page>.json  { title, blocks: [...] }  and <outDir>/_media.json (all remote media referenced)
const fs = require('fs');
const path = require('path');
const [, , pagesDir, featDir, outDir] = process.argv;
fs.mkdirSync(outDir, { recursive: true });

const ZWSP = /[\u200B\u200C\u200D\uFEFF]/g;
const decode = s => s
  .replace(/&nbsp;|&#xa0;|&#160;/g, ' ').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'")
  .replace(/&mdash;/g, '—').replace(/&ndash;/g, '–').replace(/&rsquo;/g, '’').replace(/&lsquo;/g, '‘')
  .replace(/&ldquo;/g, '“').replace(/&rdquo;/g, '”').replace(/&times;/g, '×').replace(/&hellip;/g, '…')
  .replace(/&#x2F;/g, '/');

// Turn Wix rich-text HTML into clean semantic HTML (p/h*/strong/em/a/ul/ol/li/br only).
function cleanRichText(html) {
  const out = [];
  const stack = []; // for span → what we opened
  const re = /<(\/?)([a-zA-Z0-9]+)([^>]*)>|([^<]+)/g;
  let m;
  while ((m = re.exec(html))) {
    if (m[4] !== undefined) { out.push(m[4].replace(ZWSP, '')); continue; }
    const close = m[1] === '/', tag = m[2].toLowerCase(), attrs = m[3] || '';
    if (tag === 'span') {
      if (close) { const opened = stack.pop() || []; out.push(opened.slice().reverse().map(t => `</${t}>`).join('')); continue; }
      const st = (/style="([^"]*)"/.exec(attrs) || [])[1] || '';
      const opened = [];
      const fw = /font-weight:\s*(\w+)/.exec(st);
      if (fw && (fw[1] === 'bold' || +fw[1] >= 500)) opened.push('strong');
      else if (fw && (fw[1] === 'normal' || fw[1] === '400')) opened.push('b'); // heavier than the 300 body text
      if (/font-style:\s*italic/.test(st)) opened.push('em');
      if (/text-decoration:\s*underline/.test(st) && false) opened.push('u');
      stack.push(opened);
      out.push(opened.map(t => `<${t}>`).join(''));
      continue;
    }
    if (['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag) && !close) {
      // keep the visual size Wix gave the paragraph as a class: lg (≥18px), md (16–17px), sm (≤12px)
      const st = (/style="([^"]*)"/.exec(attrs) || [])[1] || '';
      const fs_ = +((/font-size:\s*(\d+)px/.exec(st) || [])[1] || 0);
      const deep = +(((/font-size:(\d+)px/.exec(html.slice(m.index, m.index + 600))) || [])[1] || 0);
      const size = fs_ || deep;
      const cls = size >= 18 ? 'lg' : size >= 16 ? 'md' : size && size <= 12 ? 'sm' : '';
      out.push(`<${tag}${cls ? ` class="${cls}"` : ''}>`);
    } else if (['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'strong', 'em', 'b', 'i'].includes(tag)) {
      const t = { i: 'em' }[tag] || tag;
      out.push(close ? `</${t}>` : `<${t}>`);
    } else if (tag === 'br') out.push('<br>');
    else if (tag === 'a') {
      if (close) out.push('</a>');
      else {
        let href = decode((/href="([^"]*)"/.exec(attrs) || [])[1] || '');
        const dataAnchor = (/data-anchor="([^"]*)"/.exec(attrs) || [])[1];
        if (!href && dataAnchor) href = '#' + dataAnchor;
        out.push(`<a href="${href}">`);
      }
    }
  }
  let s = decode(out.join(''));
  // tidy: merge adjacent identical inline tags, drop empty inline tags
  for (let i = 0; i < 4; i++) s = s.replace(/<\/(strong|em|b)><\1>/g, '').replace(/<(strong|em|b)>(\s*)<\/\1>/g, '$2');
  s = s.replace(/<p( class="\w+")?>\s*<\/p>/g, '<p class="gap"></p>'); // Wix spacer paragraphs
  s = s.replace(/\n+/g, '\n').trim();
  return s;
}

const blockText = html => html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

function bestWixVideo(props) {
  const s = JSON.stringify(props);
  const direct = s.match(/https:\/\/video\.wixstatic\.com\/video\/[^"\\]+\/(\d+p)\/mp4\/file\.mp4/);
  if (direct) return { kind: 'wixvideo', id: /video\/([^/]+)\//.exec(direct[0])[1], src: direct[0] };
  const yt = s.match(/https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
  if (yt) return { kind: 'youtube', id: yt[1] };
  const vm = s.match(/https?:\/\/(?:www\.)?vimeo\.com\/(?:reviews\/[^/]+\/videos\/)?(\d{6,})/);
  if (vm) return { kind: 'vimeo', id: vm[1] };
  const vid = s.match(/"videoId":"(3adf94_[0-9a-f]{32})"/);
  if (vid) {
    const q = (s.match(/"quality":"(\d+p)"/g) || []).map(x => /(\d+)p/.exec(x)[1] * 1).sort((a, b) => b - a)[0] || 720;
    return { kind: 'wixvideo', id: vid[1], src: `https://video.wixstatic.com/video/${vid[1]}/${q}p/mp4/file.mp4` };
  }
  return null;
}

const media = new Map(); // remote url -> {type}
const report = [];

for (const f of fs.readdirSync(pagesDir).filter(f => f.endsWith('.html'))) {
  const slug = f.replace('.html', '');
  const html = fs.readFileSync(path.join(pagesDir, f), 'utf8');
  const title = decode((/<title>([^<]*)<\/title>/.exec(html) || [])[1] || slug);
  let feat;
  try { feat = JSON.parse(fs.readFileSync(path.join(featDir, slug + '.json'), 'utf8')); } catch { continue; }
  const page = feat[feat.length - 1];
  const comps = page.structure.components;
  const props = page.props.render.compProps;

  // Order = order of first appearance of id="comp-xxx" inside the page container of the SSR HTML.
  const start = html.indexOf('id="PAGES_CONTAINER"');
  const body = html.slice(start, html.indexOf('id="SITE_FOOTER"') > start ? html.indexOf('id="SITE_FOOTER"') : undefined);
  const order = [];
  const seen = new Set();
  for (const m of body.matchAll(/id="(comp-[a-z0-9]+)"/g)) if (!seen.has(m[1])) { seen.add(m[1]); order.push(m[1]); }
  // include comps present in structure but missing from SSR (rendered client-side) at the end
  for (const id of Object.keys(comps)) if (id.startsWith('comp-') && !seen.has(id)) order.push(id);

  // Displayed (desktop) sizes from the SSR stylesheet: #comp-xxx{width:NNNpx;height:NNNpx}
  const size = {};
  for (const m of html.matchAll(/#(comp-[a-z0-9]+)\{([^}]*)\}/g)) {
    const w = /(?:^|;)\s*width:\s*(\d+(?:\.\d+)?)px/.exec(m[2]);
    const hh = /(?:^|;)\s*height:\s*(\d+(?:\.\d+)?)px/.exec(m[2]);
    if (w && !size[m[1]]) size[m[1]] = { w: +w[1], h: hh ? +hh[1] : 0 };
  }
  const blocks = [];
  const skippedTypes = {};
  const push = blocks.push.bind(blocks);
  blocks.push = (b) => push(Object.assign(b, size[b.id] ? { dw: size[b.id].w, dh: size[b.id].h } : {}));
  const handledVideo = new Set();
  for (const id of order) {
    const c = comps[id]; if (!c) continue;
    const p = props[id] || {};
    const t = c.componentType;
    if (t === 'WRichText') {
      const h = cleanRichText(p.html || '');
      if (blockText(h)) blocks.push({ type: 'text', id, html: h });
    } else if (t === 'WPhoto' || t === 'ImageX' || t === 'ImageButton') {
      const uri = p.uri || (p.image && p.image.uri) || ((JSON.stringify(p).match(/"uri":"([^"]+\.(?:png|jpe?g|gif|webp))"/i) || [])[1]);
      if (!uri) { skippedTypes[t + '(no-uri)'] = (skippedTypes[t + '(no-uri)'] || 0) + 1; continue; }
      const link = p.link && (p.link.href || p.link.url) || '';
      blocks.push({ type: 'image', id, uri, w: p.width, h: p.height, alt: (p.alt || '').replace(/\.(png|jpe?g|PNG|JPG)$/,'').match(/^(image|IMG_|Screenshot|KakaoTalk)/) ? '' : (p.alt || '').replace(/\.(png|jpe?g)$/i, ''), link });
      media.set(uri, { type: 'image', w: p.width, h: p.height });
    } else if (t === 'VideoPlayer' || t === 'MediaPlayer' || t === 'VideoBox') {
      // MediaPlayer wraps VideoBox; take whichever carries the video, once per media player tree
      const v = bestWixVideo(p);
      if (!v || handledVideo.has(v.id)) continue;
      handledVideo.add(v.id);
      const autoplay = !!p.autoplay || (JSON.stringify(p).includes('"autoplay":true'));
      blocks.push({ type: 'video', id, ...v, loop: !!p.loop, controls: p.controls !== false, autoplay });
      if (v.kind === 'wixvideo') media.set(v.src, { type: 'video', id: v.id });
    } else if (t === 'HtmlComponent') {
      blocks.push({ type: 'embed', id, url: p.url || '', note: 'Wix HTML embed' });
    } else if (t === 'tpaWidgetNative') {
      blocks.push({ type: 'gallery', id });
    } else if (!['Page', 'PageBackground', 'Group', 'ClassicSection', 'Container', 'MediaOverlayControls', 'MediaControls', 'Anchor', 'StripColumnsContainer', 'Column', 'FormContainer'].includes(t)) {
      skippedTypes[t] = (skippedTypes[t] || 0) + 1;
    }
  }
  fs.writeFileSync(path.join(outDir, slug + '.json'), JSON.stringify({ slug, title, blocks }, null, 1));
  report.push(`${slug.padEnd(22)} ${String(blocks.length).padStart(3)} blocks  ${Object.entries(blocks.reduce((a, b) => (a[b.type] = (a[b.type] || 0) + 1, a), {})).map(([k, v]) => k + ':' + v).join(' ')}${Object.keys(skippedTypes).length ? '   SKIPPED ' + JSON.stringify(skippedTypes) : ''}`);
}
fs.writeFileSync(path.join(outDir, '_media.json'), JSON.stringify([...media].map(([url, v]) => ({ url, ...v })), null, 1));
console.log(report.join('\n'));
console.log('media items:', media.size);
