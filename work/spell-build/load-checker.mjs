import fs from 'node:fs';
import vm from 'node:vm';

export function loadChecker(file = new URL('../../outputs/typograf-prototype/index.html', import.meta.url)) {
  const html = fs.readFileSync(file, 'utf8');
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]);
  const dictionary = scripts.length > 1 ? scripts[0] : fs.readFileSync(new URL('../../outputs/typograf-prototype/spellcheck.js', import.meta.url), 'utf8');
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) {
      const classes = new Set();
      elements.set(id, {value:'', textContent:'', innerHTML:'', disabled:false, style:{},
        classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x),toggle(x,on){if(on)classes.add(x);else classes.delete(x);}},
        addEventListener(){},setAttribute(){},focus(){}});
    }
    return elements.get(id);
  };
  const context = vm.createContext({atob,TextDecoder,TextEncoder,Uint8Array,URLSearchParams,AbortController,
    document:{getElementById:element,body:{style:{}},createElement:()=>element('helper')},
    navigator:{clipboard:{writeText:async()=>{}}},
    window:{location:{pathname:'/evaluation'},history:{state:null,replaceState(){}},sessionStorage:{getItem:()=>null},addEventListener(){},matchMedia:()=>({matches:true})},
    setTimeout:()=>1,clearTimeout(){}});
  vm.runInContext(dictionary, context);
  vm.runInContext(scripts.at(-1), context);
  return (input, remoteMatches = []) => vm.runInContext(`checkText(${JSON.stringify(input)}, {}, ${JSON.stringify(remoteMatches)})`, context);
}
