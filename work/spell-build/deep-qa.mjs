import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const html = fs.readFileSync('../../outputs/typograf-prototype/index.html', 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]);
const dictionary = fs.readFileSync('../../outputs/typograf-prototype/spellcheck.js', 'utf8');
const inline = scripts.at(-1);
const ids = ['source','input-screen','loading-screen','result-screen','check-button','issue-list','result-text','result-editor','result-title','result-status-title','pending-badge','review-status','edit-result-button','recheck-button','finish-button','toast','char-count','toast-message','issue-count','result-count','success-summary','page-title','intro-description','demo-button','edit-button','copy-button','home-link','leave-overlay','leave-description','cancel-leave','confirm-leave','online-toggle','online-info','online-info-button','online-tooltip','online-credit','grammar-credit','loading-detail'];
const elements = {};
const document = {activeElement:null, body:{style:{overflow:''},appendChild(){}}, getElementById:id=>elements[id], createElement:id=>new Element(id), execCommand:()=>true};
function Element(id) {
  this.id=id; this.value=''; this.textContent=''; this.innerHTML=''; this.disabled=false; this.scrollTop=0; this.style={}; this.attributes={}; this.events={};
  const classes=new Set(['loading-screen','result-screen','toast','leave-overlay','online-credit'].includes(id)?['hidden']:[]);
  this.classList={add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x),toggle:(x,force)=>{if(force===undefined?!classes.has(x):force)classes.add(x);else classes.delete(x);}};
  this.addEventListener=(type,fn)=>{this.events[type]=fn;}; this.fire=(type,event={})=>this.events[type]?.(event); this.focus=()=>{document.activeElement=this;};
  this.setAttribute=(name,value)=>{this.attributes[name]=value;}; this.querySelectorAll=()=>[]; this.scrollIntoView=()=>{}; this.select=()=>{}; this.remove=()=>{};
}
for (const id of ids) elements[id]=new Element(id);
const timers=[]; let nextTimer=1; const storage=new Map();
const window={scrollX:0,scrollY:0,location:{pathname:'/typograf-prototype/index.html'},history:{state:null,replaceState(value){this.state=value;}},sessionStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},addEventListener(){},removeEventListener(){},scrollTo(){},matchMedia:()=>({matches:true})};
const context=vm.createContext({atob,TextDecoder,TextEncoder,Uint8Array,URLSearchParams,AbortController,document,navigator:{clipboard:{writeText:async()=>{}}},window,setTimeout(fn,ms){const id=nextTimer++;timers.push({id,fn,ms});return id;},clearTimeout(){}});
vm.runInContext(dictionary,context);
vm.runInContext(inline,context);

const tortureText = `Вообщем, вчера редактор Таня подошол к автору и сказала что в статье много ошибок.

«Мы раскажем как работает наш веб-продукт» — написал автор. Но редактор ответила что это не так: орфаграфия храмает, пунктуацыя тоже а некоторые запетые вообще потерялись.

В течении недели команда проверяла тексты не покладая рук. Лучше поздно чем никогда, подумал автор и ушол домой. Сьюзен Мейер и Бри Ван де Камп как ни в чём не бывало обсуждали статью на улице Вистерия Лейн.

Редактор открыл файл проверил его и отправил автору. Алкоголик пропил глобус упал и улыбался.

Код не трогать: \`const t = "ошибычный";\` Ссылка: https://example.com/ошибычный`;

let spellingMatches=[], grammarData=null, serviceErrors=[];
for (const route of ['spelling','grammar']) {
  try {
    const grammarText = route==='grammar' ? vm.runInContext(`checkText(${JSON.stringify(tortureText)}, {}, ${JSON.stringify(spellingMatches)}).text`,context) : tortureText;
    const response=await fetch(`http://127.0.0.1:4173/api/${route}`,{method:'POST',body:new URLSearchParams(route==='spelling'?{text:tortureText,lang:'ru'}:{text:grammarText,language:'ru'})});
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data=await response.json();
    if (route==='spelling') spellingMatches=data;
    else grammarData={matches:data.matches,masked:grammarText};
  } catch(error) {serviceErrors.push(`${route}: ${error.message}`);}
}
let result=vm.runInContext(`checkText(${JSON.stringify(tortureText)}, {}, ${JSON.stringify(spellingMatches)})`,context);
if (grammarData) {
  context.qaBaseResult=result;
  context.qaGrammarData=grammarData;
  result=vm.runInContext('applyGrammarMatches(qaBaseResult, qaGrammarData)',context);
}
const expectedPhrases=['В общем,','Таня подошла к автору','сказала, что','ответила, что','орфография хромает','пунктуация тоже, а некоторые запятые','В течение недели','Лучше поздно, чем никогда','открыл файл, проверил'];
const plainText=result.text.replace(/\u00a0/g,' ');
for(const phrase of expectedPhrases) assert.ok(plainText.includes(phrase.replace(/\u00a0/g,' ')),`Expected corrected text to include: ${phrase}`);
assert.ok(plainText.includes('Алкоголик пропил глобус упал и улыбался.'),'Ambiguous wording must stay unchanged');
assert.ok(plainText.includes('`const t = "ошибычный";`'),'Code must stay protected');
assert.ok(plainText.includes('https://example.com/ошибычный'),'URL must stay protected');
assert.ok(!result.issues.some(item=>item.category==='Орфография' && !item.applied),'All clear spelling errors in this sample should be fixed');
assert.ok(result.issues.some(item=>!item.applied && item.before==='пропил глобус упал'),'Ambiguous clause boundary must remain for review');
assert.ok(grammarData,`Local spelling/grammar services unavailable: ${serviceErrors.join('; ')}`);
console.log(JSON.stringify({onlineServices:'local Yandex Speller + LanguageTool',input:tortureText,output:result.text,applied:result.issues.filter(({applied})=>applied).map(({category,before,after})=>({category,before,after})),forEditor:result.issues.filter(({applied})=>!applied).map(({category,before,after,suggestions})=>({category,before,after,suggestions}))},null,2));
console.log('PASS deep synthetic copy: fixed clear errors; protected code/URL; ambiguous spans left for editor');
