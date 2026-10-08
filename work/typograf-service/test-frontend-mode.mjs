import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync('../../outputs/typograf-prototype/index.html', 'utf8');
const app = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)[1];
const dictionary = fs.readFileSync('../../outputs/typograf-prototype/spellcheck.js', 'utf8');
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
  window:{location:{protocol:'http:',pathname:'/'},history:{state:null,replaceState(){}},
    sessionStorage:{getItem:()=>null},addEventListener(){},matchMedia:()=>({matches:true})},
  navigator:{clipboard:{writeText:async()=>{}}},
  fetch:async url=>{urls.push(url);return {ok:true,json:async()=>url.includes('grammar')?{matches:[]}:[]};},
  setTimeout:()=>1, clearTimeout(){}
});
vm.runInContext(dictionary, context);
vm.runInContext(app, context);
await vm.runInContext('getOnlineMatches("Тест")', context);
await vm.runInContext('getGrammarMatches("Тест")', context);
assert.deepEqual(urls, ['/api/spelling','/api/grammar']);
console.log('PASS served frontend uses only the same-origin checking service');
