import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const staticHosting = process.env.TYPOGRAF_STATIC === '1';
const html = fs.readFileSync(process.env.TYPOGRAF_HTML || '../../outputs/typograf-prototype/index.html', 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]);
const app = scripts.at(-1);
const dictionary = scripts.length > 1 ? scripts[0] : fs.readFileSync('../../outputs/typograf-prototype/spellcheck.js', 'utf8');
const elements = new Map();
function element(id) {
  if (!elements.has(id)) {
    const classes = new Set();
    elements.set(id, {value:'', textContent:'', innerHTML:'', disabled:false, style:{},
      classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x),toggle(x,enabled){if(enabled)classes.add(x);else classes.delete(x);}},
      addEventListener(){},setAttribute(){},focus(){}});
  }
  return elements.get(id);
}
const urls = [];
const context = vm.createContext({
  atob, TextDecoder, TextEncoder, Uint8Array, URLSearchParams, AbortController,
  document:{getElementById:element,body:{style:{}},createElement:()=>element('helper')},
  window:{location:staticHosting ? {protocol:'https:',hostname:'nomadmisha.github.io',pathname:'/Typograf/'} : {protocol:'http:',hostname:'127.0.0.1',pathname:'/'},history:{state:null,replaceState(){}},
    sessionStorage:{getItem:()=>null},addEventListener(){},matchMedia:()=>({matches:true})},
  navigator:{clipboard:{writeText:async()=>{}}},
  fetch:async url=>{urls.push(url);return {ok:true,json:async()=>/grammar|languagetool/.test(url)?{matches:[]}:[]};},
  setTimeout:()=>1, clearTimeout(){}
});
vm.runInContext(dictionary, context);
vm.runInContext(app, context);
await vm.runInContext('getOnlineMatches("Тест")', context);
await vm.runInContext('getGrammarMatches("Тест")', context);
assert.deepEqual(urls, staticHosting ? [
  'https://speller.yandex.net/services/spellservice.json/checkText',
  'https://api.languagetool.org/v2/check'
] : ['/api/spelling','/api/grammar']);
console.log(staticHosting ? 'PASS GitHub Pages uses external checking APIs, without nonexistent /api routes' : 'PASS served frontend uses only the same-origin checking service');
