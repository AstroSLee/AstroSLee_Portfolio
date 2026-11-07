// For each downloaded Wix page, fetch its thunderbolt "features" JSON (component props, incl. video players)
// and save to features/<page>.json. Usage: node features.js pagesDir outDir
const fs = require('fs');
const path = require('path');
const [, , pagesDir, outDir] = process.argv;
fs.mkdirSync(outDir, { recursive: true });
const dec = s => s.replace(/&amp;/g, '&');
(async () => {
  for (const f of fs.readdirSync(pagesDir).filter(f => f.endsWith('.html'))) {
    const h = fs.readFileSync(path.join(pagesDir, f), 'utf8');
    const urls = [...new Set((h.match(/https:\/\/siteassets\.parastorage\.com\/pages\/pages\/thunderbolt\?[^"]+/g) || []).map(dec))]
      .filter(u => u.includes('module=thunderbolt-features'));
    const parts = [];
    for (const u of urls) {
      try { const r = await fetch(u); parts.push(await r.text()); } catch (e) { parts.push(''); }
    }
    fs.writeFileSync(path.join(outDir, f.replace('.html', '.json')), '[' + parts.filter(Boolean).join(',') + ']');
    console.log(f, urls.length, parts.map(p => p.length).join('/'));
  }
})();
