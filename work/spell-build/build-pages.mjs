import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

// Publish the current standalone prototype, preserving its original files.
const root = new URL('../../', import.meta.url);
const source = new URL('outputs/typograf-single-file-v20/index.html', root);
const docs = new URL('docs/', root);
const marker = "    const useLocalService = /^https?:$/.test(window.location.protocol || '');";
const html = fs.readFileSync(source, 'utf8');
if (html.split(marker).length !== 2) {
  throw new Error('Expected exactly one runtime mode declaration in the standalone prototype');
}
const published = html
  .replace(marker, '    const useLocalService = false; // Static GitHub Pages hosting has no /api backend.')
  .replace('  <title>', '  <link rel="canonical" href="https://nomadmisha.github.io/Typograf/">\n  <title>');
fs.mkdirSync(docs, { recursive: true });
fs.writeFileSync(new URL('index.html', docs), published);
fs.writeFileSync(new URL('.nojekyll', docs), '');
fs.copyFileSync(new URL('outputs/typograf-prototype/editorial-review.html',root),new URL('editorial-review.html',docs));
console.log(`Built ${fileURLToPath(new URL('index.html', docs))} (${Buffer.byteLength(published)} bytes)`);
