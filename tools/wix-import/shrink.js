// Shrink downloaded images: opaque PNGs over 300 KB become JPGs; JPGs over 600 KB are recompressed.
// Rewrites references in src/. Usage: node shrink.js <repoDir>
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const REPO = process.argv[2];
const MEDIA = path.join(REPO, 'src/assets/media');
const renames = {};
sharp.cache(false);
(async () => {
  let before = 0, after = 0;
  for (const f of fs.readdirSync(MEDIA)) {
    const p = path.join(MEDIA, f);
    const size = fs.statSync(p).size;
    if (/\.png$/.test(f) && size > 300e3) {
      const img = sharp(p);
      const st = await img.stats();
      if (!st.isOpaque) continue; // keep transparency
      const out = f.replace(/\.png$/, '.jpg');
      if (fs.existsSync(path.join(MEDIA, out))) continue;
      await sharp(p).flatten({ background: '#000' }).jpeg({ quality: 86, mozjpeg: true }).toFile(path.join(MEDIA, out));
      before += size; after += fs.statSync(path.join(MEDIA, out)).size;
      fs.unlinkSync(p); renames[f] = out;
    } else if (/\.jpg$/.test(f) && size > 600e3) {
      const buf = await sharp(fs.readFileSync(p)).jpeg({ quality: 84, mozjpeg: true }).toBuffer();
      if (buf.length < size) { fs.writeFileSync(p, buf); before += size; after += buf.length; }
    }
  }
  // rewrite references
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? (e.name === 'media' ? [] : walk(path.join(d, e.name))) : [path.join(d, e.name)]);
  let touched = 0;
  for (const file of walk(path.join(REPO, 'src')).filter(f => /\.(html|njk|md|json)$/.test(f))) {
    let s = fs.readFileSync(file, 'utf8'); const o = s;
    for (const [a, b] of Object.entries(renames)) s = s.split('/assets/media/' + a).join('/assets/media/' + b);
    if (s !== o) { fs.writeFileSync(file, s); touched++; }
  }
  console.log(`converted ${Object.keys(renames).length} PNG→JPG; ${(before / 1e6).toFixed(1)} MB → ${(after / 1e6).toFixed(1)} MB; updated ${touched} files`);
})();
