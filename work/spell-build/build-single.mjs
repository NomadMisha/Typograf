import fs from 'node:fs';
import path from 'node:path';

const base = path.resolve('../../outputs');
const project = path.join(base, 'typograf-prototype');
const modular = fs.readFileSync(path.join(project, 'index.html'), 'utf8');
const dictionary = fs.readFileSync(path.join(project, 'spellcheck.js'), 'utf8').trimEnd();
const license = name => fs.readFileSync(path.join(project, 'licenses', name), 'utf8').trimEnd();
const marker = '  <script src="./spellcheck.js"></script>';
if (modular.split(marker).length !== 2) throw new Error('Expected one dictionary script tag');
if (dictionary.toLowerCase().includes('</script')) throw new Error('Dictionary bundle would close its script tag');

const licenses = `<script type="text/plain" id="third-party-licenses">\n\n===== nspell =====\n${license('nspell.txt')}\n\n\n===== dictionary-ru =====\n${license('dictionary-ru.txt')}\n</script>`;
const standalone = modular.replace(marker, `  ${licenses}\n  <script>\n${dictionary}\n  </script>`);
for (const folder of ['typograf-single-file-v20']) {
  const target = path.join(base, folder, 'index.html');
  fs.writeFileSync(target, standalone);
  console.log(target, Buffer.byteLength(standalone), 'bytes');
}
