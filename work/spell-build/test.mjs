import fs from 'node:fs';
import vm from 'node:vm';
import {performance} from 'node:perf_hooks';

const sandbox = {atob, TextDecoder, Uint8Array};
const bundle = fs.readFileSync(new URL('../../outputs/typograf-prototype/spellcheck.js', import.meta.url), 'utf8');
const loadStart = performance.now();
vm.runInNewContext(bundle, sandbox);
const spell = sandbox.typografSpell.ready();
console.log('loadMs', Math.round(performance.now() - loadStart));
for (const word of ['подошол','подошёл','подошел','превет','привет','ошибычный','ошибочный','редактору','орфография','Хабр','JavaScript']) {
  const start = performance.now();
  console.log(word, spell.correct(word), spell.suggest(word).slice(0,5), Math.round(performance.now() - start) + 'ms');
}
