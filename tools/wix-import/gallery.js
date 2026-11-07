// Usage: node gallery.js page.html -> gallery items (Wix Pro Gallery) as JSON lines
const fs = require('fs');
const h = fs.readFileSync(process.argv[2], 'utf8');
const BS = String.fromCharCode(92);
const seen = new Set();
const re = /\{"itemId":"([0-9a-f-]{36})"/g;
let m;
while ((m = re.exec(h))) {
  let i = m.index, depth = 0, inStr = false, esc = false;
  for (; i < h.length; i++) {
    const c = h[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === BS) esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}') { if (--depth === 0) break; }
  }
  let it;
  try { it = JSON.parse(h.slice(m.index, i + 1)); } catch { continue; }
  if (seen.has(it.itemId)) continue;
  seen.add(it.itemId);
  const md = it.metaData || it.metadata || {};
  const link = md.link || {};
  console.log(JSON.stringify({
    order: it.orderIndex, type: md.type, title: md.title, desc: md.description, alt: md.alt,
    media: it.mediaUrl, w: md.width, h: md.height,
    video: md.videoUrl || md.videoId || '', source: md.source,
    qualities: (md.qualities || []).map(q => q.quality + ':' + (q.url || '')).join(' '),
    link: link.url || (link.data && link.data.url) || (link.type && link.type !== 'none' ? JSON.stringify(link) : ''),
  }));
}
