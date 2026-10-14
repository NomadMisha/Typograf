import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createLocalNeural,splitSegments,validateEdits} from './local-neural.mjs';
import {createTypografServer} from './server.mjs';

const source = 'Он пришол домой. Он упол на пол. Сумма 100 рублей. Он не пришёл. `code` https://example.com';
const edit = (before,after,more={}) => ({segment:0,before,after,category:'Орфография',reason:'Опечатка.',...more});
const segments = splitSegments(source);
const verified = validateEdits({edits:[
  edit('пришол','пришёл'), edit('пришол','прошёл'), // overlap
  edit('нет такого','верно'), edit('Он','Она'), // invented or ambiguous anchor
  edit('100 рублей','200 рублей'), edit('не пришёл','пришёл'),
  edit('`code`','`kode`'),edit('https://example.com','https://evil.test'),
  edit('упол','упал')
]},segments,source);
assert.equal(verified.edits.length,2);
assert.equal(verified.rejected,7);
assert.equal(verified.edits[0].start,3);
assert.throws(()=>validateEdits({},segments,source));
assert.throws(()=>createLocalNeural({model:'qwen3:cloud'}));
const nbsp='Упал на\u00a0пол.';
const normalized=validateEdits({edits:[edit('Упал на пол','Упал, на пол',{category:'Пунктуация'})]},splitSegments(nbsp),nbsp);
assert.equal(normalized.edits[0].before,'Упал на\u00a0пол');
assert.equal(normalized.edits[0].after,'Упал, на\u00a0пол');
const long = ('Первая строка.\n😀 ' + 'текст '.repeat(190)).repeat(7);
assert.equal(splitSegments(long).map(s=>s.text).join(''),long);
assert.ok(splitSegments(long).every(s=>s.text.length<=1000));
console.log('PASS exact anchors, ambiguity, overlaps, numbers, negations, protected spans, splitting');
for (const [before,after] of [
  ['Где эта тварь которая засрала мне газон?','Где эта тварь, которая засорила мне газон?'],
  ['Он сказал как есть.','Он сказал, как есть.'],
  ['Делай что угодно.','Делай, что угодно.']
]) {
  const result=validateEdits({edits:[edit(before,after,{category:'Пунктуация'})]},splitSegments(before),before);
  assert.equal(result.edits.length,0);assert.equal(result.rejected,1);
}
console.log('PASS punctuation cannot rewrite words or break protected fixed expressions');

const calls = [];
const ai = createLocalNeural({request:async (url,options) => {
  calls.push({url,options});
  return {ok:true,json:async()=>url.endsWith('/tags') ? {models:[{name:'qwen3:4b'}]} :
    {done:true,done_reason:'stop',message:{content:JSON.stringify({edits:[edit('пришол','пришёл')]})}}};
}});
assert.equal((await ai.status()).available,true);
assert.equal((await ai.check(source)).edits.length,1);
assert.ok(calls.every(c=>c.url.startsWith('http://127.0.0.1:11434/')));
const body = JSON.parse(calls.at(-1).options.body);
assert.equal(body.stream,false);
assert.equal(body.think,false);
assert.equal(body.options.temperature,0);
assert.equal(body.format.type,'object');
await assert.rejects(ai.check('x'.repeat(8001)),{status:413});
console.log('PASS local-only adapter, structured output, size limits and availability');
const backends=[];
const fallback=createLocalNeural({request:async(_url,options)=>{
  const params=JSON.parse(options.body);backends.push(params.options.num_gpu);
  return backends.length===1?{ok:false,json:async()=>({error:'failed to create command queue; Metal buffer unavailable'})}:
    {ok:true,json:async()=>({done:true,message:{content:'{"edits":[]}'}})};
}});
assert.equal((await fallback.check('Текст.')).cpuMode,true);
assert.deepEqual(backends,[undefined,0]);
console.log('PASS unavailable GPU falls back once to local CPU inference');
for (const succeeds of [true,false]) {
  let attempts=0;
  const repair=createLocalNeural({request:async(_url,options)=>{
    attempts++;
    if(attempts===2)assert.equal(JSON.parse(options.body).messages.length,4);
    const suggestion=attempts===2 && succeeds?edit('упол','упал'):
      edit('упол','упал',{category:'Пунктуация'});
    return {ok:true,json:async()=>({done:true,message:{content:JSON.stringify({edits:[suggestion]})}})};
  }});
  const repaired=await repair.check('Он упол.');
  assert.equal(attempts,2);
  assert.equal(repaired.edits.length,succeeds?1:0);
}
console.log('PASS one bounded repair attempt is revalidated and never bypasses guards');

let release;
const held = createLocalNeural({request:()=>new Promise(resolve=>{release=()=>resolve({ok:true,json:async()=>({done:true,message:{content:'{"edits":[]}'}})});})});
const first=held.check('Текст.');
await assert.rejects(held.check('Ещё текст.'),{status:429});
release(); await first;
const broken=createLocalNeural({request:async()=>{throw new Error('offline');}});
assert.equal((await broken.status()).available,false);
await assert.rejects(broken.check('Текст.'));
await assert.rejects(broken.check('Текст.'),error=>error.status!==429);
console.log('PASS concurrency bound and retry after failures');
for (const payload of [
  {done:false,message:{content:'{"edits":[]}'}},
  {done:true,done_reason:'length',message:{content:'{"edits":[]}'}},
  {done:true,message:{content:'not-json'}},
  {done:true,message:{content:'{"edits":{}}'}}
]) {
  const malformed=createLocalNeural({request:async()=>({ok:true,json:async()=>payload})});
  await assert.rejects(malformed.check('Текст.'));
}
const canceled=new AbortController();canceled.abort();
const cancelAdapter=createLocalNeural({request:async (_url,options)=>{options.signal.throwIfAborted();}});
await assert.rejects(cancelAdapter.check('Текст.',canceled.signal));
console.log('PASS incomplete, truncated and malformed responses fail; cancellation reaches inference');

let checks=0;
const server=createTypografServer({neural:{status:()=>ai.status(),check:async text=>{checks++;return ai.check(text);}}});
server.listen(0,'127.0.0.1'); await once(server,'listening');
const base=`http://127.0.0.1:${server.address().port}`;
try {
  assert.equal((await (await fetch(base+'/api/neural/status')).json()).available,true);
  const denied=await fetch(base+'/api/neural',{method:'POST',headers:{Origin:'https://evil.test'},body:new URLSearchParams({text:source})});
  assert.equal(denied.status,403); assert.equal(checks,0);
  const invalid=await fetch(base+'/api/neural',{method:'POST',headers:{'Content-Type':'text/plain'},body:source});
  assert.equal(invalid.status,415);
  const result=await fetch(base+'/api/neural',{method:'POST',body:new URLSearchParams({text:source})});
  assert.equal(result.status,200); assert.equal((await result.json()).edits[0].after,'пришёл');
  console.log('PASS HTTP routes, cross-origin rejection, content-type checks and result contract');
} finally {server.close(); await once(server,'close');}
