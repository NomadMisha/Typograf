import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const html=fs.readFileSync(process.env.TYPOGRAF_HTML || '../../outputs/typograf-prototype/index.html','utf8');
const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
const dictionary=scripts.length>1?scripts[0]:fs.readFileSync('../../outputs/typograf-prototype/spellcheck.js','utf8');
const elements=new Map();
const element=id=>{
  if(!elements.has(id)) {
    const classes=new Set(),events={};
    elements.set(id,{value:'',textContent:'',innerHTML:'',disabled:false,style:{},scrollTop:0,
      classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x),toggle(x,on){if(on)classes.add(x);else classes.delete(x);}},
      events,addEventListener:(type,fn)=>{events[type]=fn;},setAttribute(){},focus(){}});
  }
  return elements.get(id);
};
const calls=[];
let respond=async()=>({ok:true,json:async()=>({available:true,model:'qwen3:4b',local:true})});
const context=vm.createContext({atob,TextDecoder,TextEncoder,Uint8Array,URLSearchParams,AbortController,
  document:{getElementById:element,body:{style:{}},createElement:()=>element('helper')},
  window:{location:{protocol:'http:',hostname:'127.0.0.1',pathname:'/'},history:{state:null,replaceState(){}},
    sessionStorage:{getItem:()=>null,setItem(){},removeItem(){}},addEventListener(){},removeEventListener(){},scrollTo(){},matchMedia:()=>({matches:true})},
  navigator:{clipboard:{writeText:async()=>{}}},setTimeout:()=>1,clearTimeout(){},
  fetch:(url,options)=>{calls.push({url,options});return respond(url,options);}});
vm.runInContext(dictionary,context);vm.runInContext(scripts.at(-1),context);
await new Promise(resolve=>setImmediate(resolve));
if (!vm.runInContext('localNeuralMode',context)) {
  assert.deepEqual(calls,[]);
  assert.match(html.match(/<button[^>]*id="neural-check-button"[^>]*>/)[0],/disabled/);
  vm.runInContext('syncReviewUI()',context);
  assert.equal(element('neural-check-button').disabled,true);
  await vm.runInContext('checkWithNeural()',context);
  assert.deepEqual(calls,[]);
  console.log('PASS static Pages makes no neural API requests and explains local launch');
  process.exit(0);
}
assert.deepEqual(calls.map(c=>c.url),['/api/neural/status']);
console.log('PASS startup queries model status without sending any article');
const run=code=>vm.runInContext(code,context);
const reset=()=>run('hasResult=true; updateResult("Он пришол.",[],[]);');
const edit={start:3,end:9,before:'пришол',after:'пришёл',category:'Орфография',reason:'Правописание глагола.'};
respond=async()=>({ok:true,json:async()=>({edits:[edit],local:true,model:'qwen3:4b',rejected:0})});
reset();await run('checkWithNeural()');
assert.equal(run('preparedText'),'Он пришол.');
assert.equal(run('currentIssues[0].applied'),false);
assert.equal(run('currentIssues[0].start'),3);
assert.equal(calls.at(-1).options.body.get('text'),'Он пришол.');
assert.match(element('neural-status').textContent,/Текст пока не изменён/);
await run('checkWithNeural()');assert.equal(run('currentIssues.length'),1);
assert.ok(run('applyChosenSuggestion(currentIssues[0],currentIssues[0].suggestions[0])'));
assert.equal(run('preparedText'),'Он пришёл.');
console.log('PASS explicit local request, review-only proposals, deduplication and exact application');

reset();
context.bad={edits:[{...edit,start:0,end:2}, {...edit,before:'другое'}, {...edit,end:100}],local:true};
assert.equal(run('appendNeuralEdits({text:preparedText,issues:[],highlights:[]},bad).added'),0);
context.bad={edits:[{start:0,end:6,before:'`code`',after:'`kode`',category:'Грамматика',reason:'test'}],local:true};
assert.equal(run('appendNeuralEdits({text:"`code`",issues:[],highlights:[]},bad).added'),0);
console.log('PASS frontend rejects mismatched offsets and protected code');

let release;
respond=()=>new Promise(resolve=>{release=()=>resolve({ok:true,json:async()=>({edits:[edit],local:true})});});
const pending=run('checkWithNeural()');
run('preparedText="Другой текст.";');release();await pending;
assert.equal(run('preparedText'),'Другой текст.');
assert.equal(run('currentIssues.length'),0);
assert.match(element('neural-status').textContent,/Текст изменился/);
console.log('PASS outdated response is discarded after editing or navigation');

reset();
respond=async()=>({ok:false,json:async()=>({error:'Модель недоступна.'})});
await run('checkWithNeural()');
assert.equal(run('preparedText'),'Он пришол.');
assert.equal(element('neural-check-button').disabled,false);
assert.match(element('neural-status').textContent,/Модель недоступна/);
respond=(_url,options)=>new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new Error('abort'))));
const aborted=run('checkWithNeural()');await run('checkWithNeural()');await aborted;
assert.match(element('neural-status').textContent,/остановлена/);
assert.equal(run('preparedText'),'Он пришол.');
console.log('PASS failure and cancellation preserve text and allow retry');

calls.length=0;run('preparedText="я".repeat(8001)');await run('checkWithNeural()');
assert.equal(calls.length,0);assert.match(element('neural-status').textContent,/8 000/);
console.log('PASS long text is rejected before inference');
