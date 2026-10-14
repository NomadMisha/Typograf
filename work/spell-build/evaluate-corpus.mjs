import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const html = fs.readFileSync(process.env.TYPOGRAF_HTML || '../../outputs/typograf-prototype/index.html', 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]);
const dictionary = scripts.length > 1 ? scripts[0] : fs.readFileSync('../../outputs/typograf-prototype/spellcheck.js', 'utf8');
const app = scripts.at(-1);
const corpus = JSON.parse(fs.readFileSync('public-corpus.json', 'utf8'));

const elements = new Map();
function element(id) {
  if (!elements.has(id)) {
    const classes = new Set(['loading-screen', 'result-screen', 'toast', 'leave-overlay', 'online-credit'].includes(id) ? ['hidden'] : []);
    elements.set(id, {
      value: '', textContent: '', innerHTML: '', disabled: false, style: {},
      classList: {
        add: name => classes.add(name), remove: name => classes.delete(name),
        contains: name => classes.has(name),
        toggle(name, forced) { if (forced === undefined ? !classes.has(name) : forced) classes.add(name); else classes.delete(name); }
      },
      addEventListener() {}, setAttribute() {}, focus() {}
    });
  }
  return elements.get(id);
}
const context = vm.createContext({
  atob, TextDecoder, TextEncoder, Uint8Array, URLSearchParams, AbortController,
  document: {getElementById: element, body: {style: {}}, createElement: () => element('helper')},
  navigator: {clipboard: {writeText: async () => {}}},
  window: {
    location: {pathname: '/corpus'}, history: {state: null, replaceState() {}},
    sessionStorage: {getItem: () => null}, addEventListener() {}, matchMedia: () => ({matches: true})
  },
  setTimeout: () => 1, clearTimeout() {}
});
vm.runInContext(dictionary, context);
vm.runInContext(app, context);

const normalized = value => value.replace(/\u00a0/g, ' ').replace(/\r\n?/g, '\n');
export const check = input => vm.runInContext(`checkText(${JSON.stringify(input)})`, context);
const evaluateClean = samples => samples.map(({source, text}) => {
  const result = check(text);
  return {source, unchanged: normalized(result.text) === normalized(text), output: normalized(result.text), pending: result.issues.filter(issue => !issue.applied).map(issue => issue.before)};
});
const clean = evaluateClean(corpus.samples);
const review = evaluateClean(corpus.reviewSet);
const mutated = [
  [1, ', но', ' но', 'punctuation'],
  [0, 'конечно,', 'конечно', 'punctuation'],
  [3, 'Возможно,', 'Возможно', 'punctuation'],
  [2, 'данные', 'даные', 'spelling'],
  [4, 'настройки,', 'настройки', 'punctuation'],
  [10, 'ФП,', 'ФП', 'punctuation'],
  [12, 'который', 'которыи', 'spelling'],
  [18, 'что-то', 'чтото', 'spelling']
].map(([index, correct, error, category]) => {
  const item = corpus.samples[index];
  if (!item.text.includes(correct)) throw new Error(`Missing mutation target: ${item.source} ${correct}`);
  const input = item.text.replace(correct, error);
  const result = check(input);
  const targetDetected = result.issues.some(issue => issue.category === (category === 'spelling' ? 'Орфография' : 'Пунктуация') &&
    normalized(issue.before).toLowerCase().includes(error.trim().toLowerCase()));
  return {source: item.source, category, input, targetDetected, restored: normalized(result.text) === normalized(item.text), output: normalized(result.text), pending: result.issues.filter(issue => !issue.applied).length};
});

export const summary = {
  corpusSize: corpus.samples.length,
  cleanUnchanged: clean.filter(item => item.unchanged).length,
  cleanWithWarnings: clean.filter(item => item.pending.length > 0).length,
  reviewSize: review.length,
  reviewUnchanged: review.filter(item => item.unchanged).length,
  reviewWithWarnings: review.filter(item => item.pending.length > 0).length,
  injectedCases: mutated.length,
  injectedRestored: mutated.filter(item => item.restored).length,
  injectedDetectedOrRestored: mutated.filter(item => item.restored || item.targetDetected).length,
  injectedSilentMisses: mutated.filter(item => !item.restored && !item.targetDetected).length,
  byCategory:Object.fromEntries(['spelling','punctuation'].map(category => {
    const cases = mutated.filter(item => item.category === category);
    return [category,{cases:cases.length,restored:cases.filter(item => item.restored).length,detectedOrRestored:cases.filter(item => item.restored || item.targetDetected).length}];
  })),
  cleanChanges: clean.filter(item => !item.unchanged),
  cleanWarnings: clean.filter(item => item.pending.length > 0).map(({source,pending}) => ({source,pending})),
  reviewChanges: review.filter(item => !item.unchanged),
  reviewWarnings: review.filter(item => item.pending.length > 0).map(({source,pending}) => ({source,pending})),
  unrestoredInjections: mutated.filter(item => !item.restored),
  silentMisses: mutated.filter(item => !item.restored && !item.targetDetected)
};
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(JSON.stringify(summary, null, 2));
