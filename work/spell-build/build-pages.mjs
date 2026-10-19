import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import './build-review-sheet.mjs';

// The only generated application build lives in docs/. Modular sources stay intact.
const root = new URL('../../', import.meta.url);
const project = new URL('outputs/typograf-prototype/', root);
const docs = new URL('docs/', root);
const modular = fs.readFileSync(new URL('index.html', project), 'utf8');
const dictionary = fs.readFileSync(new URL('spellcheck.js', project), 'utf8').trimEnd();
const license = name => fs.readFileSync(new URL('licenses/' + name, project), 'utf8').trimEnd();
const dictionaryMarker = '  <script src="./spellcheck.js"></script>';
if (modular.split(dictionaryMarker).length !== 2) throw new Error('Expected one dictionary script tag');
if (dictionary.toLowerCase().includes('</script')) throw new Error('Dictionary bundle would close its script tag');
const licenses = `<script type="text/plain" id="third-party-licenses">\n\n===== nspell =====\n${license('nspell.txt')}\n\n\n===== dictionary-ru =====\n${license('dictionary-ru.txt')}\n</script>`;
const html = modular.replace(dictionaryMarker, `  ${licenses}\n  <script>\n${dictionary}\n  </script>`);
const marker = "    const useLocalService = /^https?:$/.test(window.location.protocol || '');";
if (html.split(marker).length !== 2) {
  throw new Error('Expected exactly one runtime mode declaration in the standalone prototype');
}
const published = html
  .replace(marker, '    const useLocalService = false; // Static GitHub Pages hosting has no /api backend.')
  .replace('  <title>', '  <link rel="canonical" href="https://nomadmisha.github.io/Typograf/">\n  <title>');
fs.mkdirSync(docs, { recursive: true });
fs.writeFileSync(new URL('index.html', docs), published);
fs.writeFileSync(new URL('.nojekyll', docs), '');
console.log(`Built ${fileURLToPath(new URL('index.html', docs))} (${Buffer.byteLength(published)} bytes)`);
