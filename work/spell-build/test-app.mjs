import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const html = fs.readFileSync(process.env.TYPOGRAF_HTML || '../../outputs/typograf-prototype/index.html', 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match=>match[1]);
const inline = scripts.at(-1);
const dictionary = scripts.length > 1 ? scripts[0] : fs.readFileSync('../../outputs/typograf-prototype/spellcheck.js', 'utf8');
const ids = ['source','input-screen','loading-screen','result-screen','check-button','issue-list','result-text','result-editor','result-title','result-status-title','pending-badge','review-status','edit-result-button','recheck-button','finish-button','toast','char-count','toast-message','issue-count','result-count','success-summary','page-title','intro-description','demo-button','edit-button','copy-button','home-link','leave-overlay','leave-description','cancel-leave','confirm-leave','online-toggle','online-info','online-info-button','online-tooltip','online-credit','grammar-credit','loading-detail'];
const elements = {};
ids.push('history-panel','history-count','dictionary-count','history-storage-status','history-list','dictionary-words','save-history-button','export-history','import-history','history-file','dictionary-form','dictionary-word');
const document = {activeElement:null, body:{style:{overflow:''},appendChild(){}}, getElementById:id=>elements[id], createElement:id=>new Element(id), execCommand:()=>true};

function Element(id) {
  this.id = id;
  this.value = '';
  this.textContent = '';
  this.innerHTML = '';
  this.disabled = false;
  this.scrollTop = 0;
  this.style = {};
  this.attributes = {};
  this.events = {};
  const classes = new Set(['loading-screen','result-screen','toast','leave-overlay','online-credit'].includes(id) ? ['hidden'] : []);
  this.classList = {add:x=>classes.add(x), remove:x=>classes.delete(x), contains:x=>classes.has(x), toggle:(x,force)=>{if(force===undefined? !classes.has(x):force) classes.add(x);else classes.delete(x);}};
  this.addEventListener = (type, fn) => {this.events[type] = fn;};
  this.fire = (type, event = {}) => this.events[type]?.(event);
  this.focus = () => {document.activeElement = this;};
  this.setAttribute = (name,value) => {this.attributes[name] = value;};
  this.querySelectorAll = () => [];
  this.scrollIntoView = () => {};
  this.select = () => {};
  this.remove = () => {};
}
for (const id of ids) elements[id] = new Element(id);

let timers = [];
let nextTimer = 1;
const storedResults = new Map();
const storedHistory = new Map();
const windowEvents = new Map();
const mockWindow = {
  scrollX:0,
  scrollY:0,
  location:{pathname:'/typograf-prototype/index.html'},
  localStorage:{getItem:key=>storedHistory.get(key) ?? null,setItem:(key,value)=>storedHistory.set(key,value),removeItem:key=>storedHistory.delete(key)},
  history:{state:null,replaceState(value){this.state=value;}},
  sessionStorage:{
    getItem:key=>storedResults.get(key) ?? null,
    setItem:(key,value)=>storedResults.set(key,value),
    removeItem:key=>storedResults.delete(key)
  },
  addEventListener(type, fn) {if(!windowEvents.has(type)) windowEvents.set(type,new Set());windowEvents.get(type).add(fn);},
  removeEventListener(type, fn) {windowEvents.get(type)?.delete(fn);},
  scrollTo(x,y){if(typeof x==='object'){this.scrollX=x.left ?? this.scrollX;this.scrollY=x.top ?? this.scrollY;}else{this.scrollX=x;this.scrollY=y;}},
  matchMedia:()=>({matches:true})
};
const context = vm.createContext({
  atob,
  TextDecoder,
  TextEncoder,
  Uint8Array,
  URLSearchParams,
  AbortController,
  document,
  navigator:{clipboard:{writeText:async()=>{}}},
  window:mockWindow,
  setTimeout(fn, ms) {const id=nextTimer++;timers.push({id,fn,ms,canceled:false});return id;},
  clearTimeout(id) {const timer=timers.find(item=>item.id===id);if(timer)timer.canceled=true;},
});
vm.runInContext(dictionary, context);
vm.runInContext(inline, context);

function check(input) {
  return vm.runInContext(`checkText(${JSON.stringify(input)})`, context);
}
// Simulate an editor explicitly accepting context-rule suggestions. Legacy
// language examples verify selected corrections; automatic behavior is tested separately.
function acceptContext(result) {
  context.selectedResult=result;
  vm.runInContext('updateResult(selectedResult.text,selectedResult.issues,selectedResult.highlights)',context);
  for(let count=0;count<30;count++) {
    const index=vm.runInContext('currentIssues.findIndex(i=>!i.applied && !i.resolved && i.note.startsWith("Возможная правка по контексту.") && i.suggestions.length && Number.isInteger(i.start))',context);
    if(index<0)break;
    assert.ok(vm.runInContext('applyChosenSuggestion(currentIssues['+index+'],currentIssues['+index+'].suggestions[0])',context));
  }
  return vm.runInContext('({text:preparedText,issues:currentIssues,highlights:currentHighlights})',context);
}
function checkAndAccept(input) { return acceptContext(check(input)); }
function shownResult() {
  return elements['result-text'].innerHTML.replace(/<[^>]*>/g, '').replace(/&amp;|&lt;|&gt;|&quot;|&#39;/g, entity => ({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&#39;':"'"}[entity]));
}
function test(name, fn) {
  fn();
  console.log('PASS', name);
}
test('Russian quotation marks, prose dash and measured numbers are formatted idempotently',()=>{
  const input='Сервис - это "новый продукт" на 10-20 минут и 50%.';
  const expected='Сервис — это «новый продукт» на\u00a010–20\u00a0минут и 50\u00a0%.';
  const result=check(input);
  assert.equal(result.text,expected);
  assert.equal(check(result.text).text,expected);
  assert.equal(check('Он написал: «Название “новый сервис” готово».').text,'Он написал: «Название „новый сервис“ готово».');
});
test('code, JSON, filenames, HTML attributes, mathematical minus and identifiers survive typography',()=>{
  for(const input of ['Код: `"текст" - 50%`.','Данные: {"текст": "значение"}.','<code>вообщем - 50%</code>',
    '<pre>подошол  и  упол</pre>','Файл server.mjs и .env.local.',
    'Версия 1.2.3, адрес 127.0.0.1, дата 2026-10-14, телефон +7-999-123-45-67.',
    'x - y = -10.','Число 1234567890.','Он сказал: "один" и "другой".']) {
    assert.equal(check(input).text,input,input);
  }
  assert.equal(check('Объём 1,5 ГБ, масса -10 кг.').text,'Объём 1,5\u00a0ГБ, масса -10\u00a0кг.');
});
test('mixed alphabets are warned about and never silently transliterated',()=>{
  const result=check('ВОOБЩЕМ, мoдуль готов.');
  assert.equal(result.text,'ВОOБЩЕМ, мoдуль готов.');
  assert.ok(result.issues.some(i=>i.before==='ВОOБЩЕМ' && !i.applied && i.suggestions.includes('В ОБЩЕМ')));
  assert.ok(result.issues.some(i=>i.before==='мoдуль' && !i.applied && i.suggestions.includes('модуль')));
});
test('cached dictionary suggestions preserve the case of every occurrence',()=>{
  const issues=check('Машна машна МАШНА.').issues.filter(i=>i.category==='Орфография');
  assert.equal(issues.length,3);
  assert.ok(issues[0].suggestions.every(s=>s[0]===s[0].toUpperCase()));
  assert.ok(issues[1].suggestions.every(s=>s===s.toLowerCase()));
  assert.ok(issues[2].suggestions.every(s=>s===s.toUpperCase()));
});
test('context punctuation remains pending and adjacent suggestions can be selected in either order',()=>{
  for(const reverse of [false,true]) {
    const result=check('Подошёл увидел как она присела на лавочку.');
    assert.equal(result.text,'Подошёл увидел как она присела на\u00a0лавочку.');
    assert.equal(result.issues.filter(i=>i.category==='Пунктуация' && !i.applied).length,2);
    context.pendingContext=result;
    vm.runInContext('updateResult(pendingContext.text,pendingContext.issues,pendingContext.highlights)',context);
    for(let n=0;n<2;n++) {
      const index=vm.runInContext(`currentIssues.findIndex(i=>!i.applied && i.category===punctuationLabel && i.before.startsWith(${JSON.stringify(n===0?!reverse?'Подошёл':'увидел':!reverse?'увидел':'Подошёл')}))`,context);
      assert.ok(index>=0);
      assert.ok(vm.runInContext(`applyChosenSuggestion(currentIssues[${index}],currentIssues[${index}].suggestions[0])`,context));
    }
    assert.equal(vm.runInContext('preparedText',context),'Подошёл, увидел, как она присела на\u00a0лавочку.');
  }
});
test('introductory and relative proposals are deduplicated and participles are review-only',()=>{
  assert.equal(check('Конечно всё готово.').issues.filter(i=>i.category==='Пунктуация').length,1);
  assert.equal(check('Он сказал как есть. Потом ушёл.').issues.filter(i=>i.category==='Пунктуация').length,0);
  assert.equal(check('Это работает только если сервис доступен.').issues.filter(i=>i.category==='Пунктуация').length,0);
  const result=check('Значение представляющее число.');
  assert.equal(result.text,'Значение представляющее число.');
  assert.ok(result.issues.some(i=>i.before==='Значение представляющее' && !i.applied && i.suggestions.includes('Значение, представляющее')));
});
test('final-point position follows restored protected text',()=>{
  const result=check('Код `const veryLongIdentifier = "значение";` готов');
  const issue=result.issues.find(i=>i.before==='' && i.suggestions.includes('.'));
  assert.equal(issue.start,result.text.length);assert.equal(issue.end,result.text.length);
});
test('spelling and punctuation proposals sharing context remain selectable in either order',()=>{
  for(const spellingFirst of [true,false]) {
    context.sharedContext=check('Машна которая приехала.');
    vm.runInContext('updateResult(sharedContext.text,sharedContext.issues,sharedContext.highlights)',context);
    for(const category of spellingFirst?['Орфография','Пунктуация']:['Пунктуация','Орфография']) {
      context.chosenCategory=category;
      const ok=vm.runInContext('(()=>{const issue=currentIssues.find(i=>!i.applied&&i.category===chosenCategory);return issue&&applyChosenSuggestion(issue,chosenCategory==="Орфография"?issue.suggestions.find(s=>s==="Машина"):issue.suggestions[0]);})()',context);
      assert.ok(ok);
    }
    assert.equal(vm.runInContext('preparedText',context),'Машина, которая приехала.');
  }
});
test('remote zero-length punctuation insertion is manual and protected spans stay untouched',()=>{
  const text='Он пришёл но ушёл.';
  context.remoteInsertion={masked:text,matches:[{offset:9,length:0,rule:{category:{id:'PUNCTUATION'}},replacements:[{value:','}]}]};
  const result=vm.runInContext('applyGrammarMatches({text:"Он пришёл но ушёл.",issues:[],highlights:[]},remoteInsertion)',context);
  assert.equal(result.text,text);assert.equal(result.issues.length,1);assert.equal(result.issues[0].applied,false);
  context.protectedInsertion={masked:'      ',matches:[{offset:3,length:0,rule:{category:{id:'PUNCTUATION'}},replacements:[{value:','}]}]};
  assert.equal(vm.runInContext('applyGrammarMatches({text:"`code`",issues:[],highlights:[]},protectedInsertion).issues.length',context),0);
});
test('known typo', () => {
  const result=check('Он подошол к дому.');
  assert.equal(result.text,'Он подошёл к\u00a0дому.');
  assert.ok(result.issues.some(item=>item.category==='Орфография' && item.before==='подошол'));
});
test('online check requires an explicit switch action', () => {
  const toggle=html.match(/<input id="online-toggle"[^>]*>/)?.[0];
  assert.ok(toggle);
  assert.ok(!/\bchecked\b/.test(toggle));
  assert.ok(elements['online-info'].classList.contains('hidden'));
});
test('user sample fixes clear grammar and leaves the ambiguous word for review', () => {
  const result=check('Крипис это скора закончиться');
  assert.equal(result.text, 'Крипис это скоро закончится');
  assert.ok(result.issues.some(item=>item.before==='Крипис' && !item.applied && item.suggestions.includes('Крепись') && item.suggestions.includes('Кризис')));
  assert.equal(result.issues.filter(item=>item.category==='Орфография').length,2);
  assert.ok(result.issues.some(item=>item.category==='Грамматика' && item.after==='закончится'));
});
test('valid colloquial verb form засрала is not flagged as a spelling error', () => {
  const input='Где эта тварь, которая засрала мне газон?';
  const result=check(input);
  assert.equal(result.text,input);
  assert.equal(result.issues.filter(item=>item.category==='Орфография').length,0);
  for (const word of ['засрал','засрала','засрали','засрёт']) {
    assert.equal(check(word).issues.some(item=>item.category==='Орфография'),false,word+' is a valid form');
  }
  assert.ok(check('Он закрала кошелёк.').issues.some(item=>item.category==='Орфография'));
  const languageToolTypo=vm.runInContext(`applyGrammarMatches(checkText(${JSON.stringify(input)}), {masked:${JSON.stringify(input)}, matches:[{offset:23,length:7,rule:{category:{id:'TYPOS'}},replacements:[{value:'забрала'}]}]})`,context);
  assert.equal(languageToolTypo.text,input);
  assert.equal(languageToolTypo.issues.filter(item=>item.category==='Орфография').length,0);
});
test('new user example is corrected in the final text', () => {
  const result=check('Прешол и упол на пал.');
  assert.equal(result.text,'Пришёл и упал на\u00a0пол.');
  assert.equal(result.issues.filter(item=>!item.applied).length,0);
  assert.ok(result.highlights.some(item=>item.kind==='error'));
});
test('vocative and relative clause commas are fixed in the user example', () => {
  const result=checkAndAccept('приведи мой дорогой друг которой маячит.');
  assert.equal(result.text,'приведи, мой дорогой друг, который маячит.');
  assert.equal(result.issues.filter(item=>item.applied).length,2);
  assert.ok(result.issues.some(item=>item.category==='Пунктуация' && item.after==='приведи, мой дорогой друг'));
  assert.ok(result.issues.some(item=>item.after==='друг, который'));
  assert.ok(result.highlights.some(mark=>mark.kind==='format' && result.text.slice(mark.start,mark.end)===','));
  assert.equal(checkAndAccept('приведи мой дорогой друг который маячит.').text,'приведи, мой дорогой друг, который маячит.');
  assert.equal(checkAndAccept('приведи, мой дорогой друг, который маячит.').text,'приведи, мой дорогой друг, который маячит.');
});
test('comma separates adjacent actions and the subordinate clause with как', () => {
  const result=checkAndAccept('Подошёл увидел как она присела на\u00a0лавочку.');
  assert.equal(result.text,'Подошёл, увидел, как она присела на\u00a0лавочку.');
  assert.equal(result.issues.filter(item=>item.category==='Пунктуация').length,2);
  assert.ok(result.highlights.filter(item=>item.kind==='format').length>=2);
  assert.equal(checkAndAccept('Она подошла заметила как он присел.').text,'Она подошла, заметила, как он присел.');
});
test('comma rules do not add duplicates or alter unrelated как', () => {
  assert.equal(check('Подошёл, увидел, как она присела.').text,'Подошёл, увидел, как она присела.');
  assert.equal(check('Подошёл к двери и увидел, как она присела.').text,'Подошёл к\u00a0двери и увидел, как она присела.');
  assert.equal(check('Он увидел как бы знакомый силуэт.').text,'Он увидел как бы знакомый силуэт.');
  assert.equal(check('А если таких баз нужны десятки?').text,'А если таких баз нужны десятки?');
});
test('action chain with an object pronoun exposes the missing comma for review', () => {
  const input='Редактор открыл файл проверил его и отправил автору.';
  const result=check(input);
  assert.equal(result.text,input);
  assert.ok(result.issues.some(item=>item.category==='Пунктуация' && !item.applied && item.reviewOnly && item.after==='открыл файл, проверил'));
});
test('comma is added before clear как subordinate clauses in reported and imperative phrases', () => {
  const result=checkAndAccept('В статье мы рассказали как устроена проверка. «Посмотрите как это работает».');
  assert.equal(result.text,'В\u00a0статье мы рассказали, как устроена проверка. «Посмотрите, как это работает».');
  assert.equal(result.issues.filter(item=>item.category==='Пунктуация' && item.applied).length,2);
  assert.equal(checkAndAccept('Мы рассказали как эксперты о проекте.').text,'Мы рассказали как эксперты о\u00a0проекте.');
  assert.equal(checkAndAccept('Я рассказал как эксперт об этом.').text,'Я рассказал как эксперт об\u00a0этом.');
  assert.equal(checkAndAccept('Мы расскажем как эксперты о проекте.').text,'Мы расскажем как эксперты о\u00a0проекте.');
  assert.equal(checkAndAccept('Покажем как образец для команды.').text,'Покажем как образец для\u00a0команды.');
  assert.equal(checkAndAccept('В статье расскажем как работает проверка.').text,'В\u00a0статье расскажем, как работает проверка.');
  assert.equal(checkAndAccept('Объясним почему процесс замедлился.').text,'Объясним, почему процесс замедлился.');
  assert.equal(checkAndAccept('Посмотрите как специалист на этот экран.').text,'Посмотрите как специалист на\u00a0этот экран.');
});
test('deep Russian grammar: как means manner, comparison, or subordinate clause', () => {
  const expected = [
    ['Он сказал как эксперт.','Он сказал как эксперт.'],
    ['Редактор объяснил как специалист.','Редактор объяснил как специалист.'],
    ['Покажем как образец для команды.','Покажем как образец для команды.'],
    ['Он сказал как это работает.','Он сказал, как это работает.'],
    ['Мы проверили как это работает.','Мы проверили, как это работает.'],
    ['Мы проверили как автор оформил цитату.','Мы проверили, как автор оформил цитату.'],
    ['Она сказала как будто всё уже закончено.','Она сказала, как будто всё уже закончено.'],
    ['Автор написал: «Посмотрите как это работает», — и добавил ссылку.','Автор написал: «Посмотрите, как это работает», — и добавил ссылку.'],
    ['Он сказал, как это работает.','Он сказал, как это работает.'],
    ['Он, как редактор, проверил текст.','Он, как редактор, проверил текст.'],
    ['Как только редактор закончил, статья ушла автору.','Как только редактор закончил, статья ушла автору.'],
    ['Казнить нельзя помиловать.','Казнить нельзя помиловать.']
  ];
  for (const [input, output] of expected) assert.equal(checkAndAccept(input).text.replace(/\u00a0/g,' '),output,input);
});
test('deep Russian text: particles, homophones, abbreviations, and protected spans survive', () => {
  const expected = [
    ['Чтобы проверить текст, Таня открыла типограф.','Чтобы проверить текст, Таня открыла типограф.'],
    ['Что бы ни случилось, текст нужно сохранить.','Что бы ни случилось, текст нужно сохранить.'],
    ['Он знает что-то важное.','Он знает что-то важное.'],
    ['Не только редактор проверил текст, но и автор.','Не только редактор проверил текст, но и автор.'],
    ['В статье написано: «Если что, позвони мне».','В статье написано: «Если что, позвони мне».'],
    ['В 2025 г. редактор проверил версию 2.0 и отправил её на Хабр.','В 2025 г. редактор проверил версию 2.0 и отправил её на Хабр.'],
    ['`Он сказал как эксперт.` https://habr.com — это пример.','`Он сказал как эксперт.` https://habr.com — это пример.'],
    ['🚀 Он сказал как эксперт, а потом показал, как это работает.','🚀 Он сказал как эксперт, а потом показал, как это работает.']
  ];
  for (const [input, output] of expected) assert.equal(check(input).text.replace(/\u00a0/g,' '),output,input);
});
test('common stable expressions are preserved and their safe comma rule is applied', () => {
  const expected = [
    ['Он сделал из мухи слона.','Он сделал из мухи слона.'],
    ['Она вошла как ни в чём не бывало.','Она вошла как ни в чём не бывало.'],
    ['Редактор трудился не покладая рук.','Редактор трудился не покладая рук.'],
    ['Автор работал спустя рукава.','Автор работал спустя рукава.'],
    ['Они живут душа в душу.','Они живут душа в душу.'],
    ['Не ударить в грязь лицом было важно.','Не ударить в грязь лицом было важно.'],
    ['Яблоку негде упасть.','Яблоку негде упасть.'],
    ['Дело в шляпе.','Дело в шляпе.'],
    ['Это проще простого.','Это проще простого.'],
    ['Ни свет ни заря редактор открыл статью.','Ни свет ни заря редактор открыл статью.'],
    ['Лучше поздно чем никогда.','Лучше поздно, чем никогда.'],
    ['Лучше поздно, чем никогда.','Лучше поздно, чем никогда.']
  ];
  for (const [input, output] of expected) assert.equal(checkAndAccept(input).text.replace(/\u00a0/g,' '),output,input);
  const fixed=checkAndAccept('Лучше поздно чем никогда.');
  assert.ok(fixed.issues.some(item=>item.category==='Пунктуация' && item.applied && item.after==='Лучше поздно, чем'));
  assert.equal(checkAndAccept('Лучше поздно, чем никогда.').issues.filter(item=>item.category==='Пунктуация' && item.applied).length,0);
});
test('deeply flawed draft fixes multiple common typo, agreement, comma, and duration errors', () => {
  const input='Вообщем, редактор подошол к автору, а Таня ответила что орфаграфия храмает, пунктуацыя тоже а запетые потерялись. В течении недели команда проверяла тексты. В этой статье раскажем как работает проверка.';
  const result=checkAndAccept(input);
  assert.equal(result.text.replace(/\u00a0/g,' '),'В общем, редактор подошёл к автору, а Таня ответила, что орфография храмает, пунктуацыя тоже а запятые потерялись. В течение недели команда проверяла тексты. В этой статье расскажем, как работает проверка.');
  assert.ok(result.issues.some(item=>item.category==='Грамматика' && item.before.replace(/\u00a0/g,' ')==='В течении' && item.applied));
  assert.ok(result.issues.some(item=>item.category==='Орфография' && item.before==='запетые' && item.applied));
  assert.equal(checkAndAccept('Лодка плыла в течении реки.').text.replace(/\u00a0/g,' '),'Лодка плыла в течении реки.');
});
test('past-tense corrections respect an explicit feminine subject', () => {
  const result=check('Таня подошол к автору. Она ушол домой.');
  assert.equal(result.text.replace(/\u00a0/g,' '),'Таня подошла к автору. Она ушла домой.');
  assert.equal(result.issues.filter(item=>item.category==='Грамматика' && item.applied).length,2);
  assert.equal(check('Таня подошла к автору.').text.replace(/\u00a0/g,' '),'Таня подошла к автору.');
});
test('Desperate Housewives dub name variants are accepted without normalization', () => {
  const examples = [
    'Бри Ван де Камп и Сьюзан Майер живут на Вистерия Лейн.',
    'Бри Ван де Камп и Сьюзен Мейер живут на Вистерия Лейн.',
    'Линетт Скаво встретила Габриэль Солис.',
    'Мэри Элис Янг рассказала Иди Бритт и Эдди Бритт.',
    'Таня проверила черновик для Хабра.'
  ];
  for (const input of examples) {
    const result=check(input);
    assert.equal(result.text.replace(/\u00a0/g,' '),input,input);
    assert.equal(result.issues.filter(item=>item.category==='Орфография').length,0,input);
  }
  assert.ok(check('На Вистерия Лейн появилась новая статья.').text.includes('Вистерия'));
});
test('deep Russian syntax: nested clauses, direct speech, ellipsis, and coordination stay stable', () => {
  const expected = [
    'Редактор предложил проверить, насколько текст понятен, и спросил, где поставить запятую.',
    'Проверив текст, Таня сказала: «Теперь всё готово!»',
    'Редактор прочитал статью — и, хотя текст был длинным, быстро нашёл ошибку.',
    'То, что редактор исправил, уже согласовано.',
    'Она не знала, что бы редактор изменил, если бы мог.',
    'Я спросил: «Ты проверил текст?» — и закрыл окно.',
    'Хабр — сайт, где публикуют статьи, которые читают разработчики.',
    'Текст, написанный автором, который работает ночью, оказался сложным.',
    'Часть правок нужно проверить вручную: например, «как эксперт» — без запятой, а «как это работает» — с запятой.',
    'Он не заметил, что в предложении «Он сказал как эксперт» запятая лишняя.',
    'Он не заметил, что в примере «Он сказал, как это работает» запятая пропущена.',
    'Редактор, как опытный специалист, объяснил, почему здесь нужна запятая.',
    'Если редактор, как специалист, проверит текст, который прислал автор, Тане не придётся перепроверять его.',
    'Редактор не только проверил орфографию, но и объяснил, почему запятая нужна.',
    'Она спросила, проверил ли редактор статью, и попросила ответить до вечера.',
    'Таня сказала, что текст, который прислал автор, уже вычитан, но попросила проверить цитату.',
    '«Он сказал как эксперт», — эта фраза не требует запятой перед «как».',
    '«Он сказал, как это работает» — в этом примере перед «как» нужна запятая.',
    'Кто бы мог подумать, что редактор, который проверил текст, заметит такую ошибку?',
    'Редактор посмотрел на текст как на черновик, а автор — как на готовую статью.'
  ];
  for (const input of expected) assert.equal(check(input).text.replace(/\u00a0/g,' '),input,input);
  assert.equal(
    check('Он не заметил, что в примере «Он сказал как это работает» запятая пропущена.').text,
    'Он не заметил, что в примере «Он сказал как это работает» запятая пропущена.'
  );
  assert.equal(
    check('«Он сказал как это работает» — в этом примере перед «как» нужна запятая.').text.replace(/\u00a0/g,' '),
    '«Он сказал как это работает» — в этом примере перед «как» нужна запятая.'
  );
});
test('ambiguous action chain waits for editor review', () => {
  const result=check('Алкоголик пропил глобус упал и улыбался.');
  assert.equal(result.text,'Алкоголик пропил глобус упал и улыбался.');
  assert.ok(result.issues.some(item=>item.category==='Пунктуация' && !item.applied && item.after.includes('глобус, упал')));
  assert.equal(check('Редактор открыл файл проверил и отправил.').text,'Редактор открыл файл проверил и отправил.');
  assert.equal(check('Она открыла файл проверила и отправила.').text,'Она открыла файл проверила и отправила.');
  assert.equal(check('Алкоголик пропил глобус, упал и улыбался.').text,'Алкоголик пропил глобус, упал и улыбался.');
  assert.equal(check('Редактор открыл файл и проверил.').text,'Редактор открыл файл и проверил.');
});
test('punctuation corpus: representative edits and sentences left intact', () => {
  const cases=[
    ['Алкоголик пропил глобус упал и улыбался.','Алкоголик пропил глобус упал и улыбался.'],
    ['Редактор открыл файл проверил и отправил.','Редактор открыл файл проверил и отправил.'],
    ['Она прочитала файл проверила и отправила.','Она прочитала файл проверила и отправила.'],
    ['Он купил глобус упал и улыбался.','Он купил глобус упал и улыбался.'],
    ['Подошёл увидел как она присела.','Подошёл, увидел, как она присела.'],
    ['Она подошла заметила как он присел.','Она подошла, заметила, как он присел.'],
    ['Мы сделали сервис который помогает редактору.','Мы сделали сервис который помогает редактору.'],
    ['В статье расскажем как работает проверка.','В статье расскажем, как работает проверка.'],
    ['Автор проверил текст но пропустил ошибку.','Автор проверил текст но пропустил ошибку.'],
    ['Редактор изменил фразу потому что она неверна.','Редактор изменил фразу потому что она неверна.'],
    ['Она сказала что текст готов.','Она сказала, что текст готов.'],
    ['Мы знаем как работает модуль.','Мы знаем, как работает модуль.'],
    ['Он понял почему проверка остановилась.','Он понял, почему проверка остановилась.'],
    ['Пожалуйста проверьте статью.','Пожалуйста, проверьте статью.'],
    ['Например редактор может проверить текст.','Например, редактор может проверить текст.'],
    ['Конечно текст готов.','Конечно, текст готов.'],
    ['Итак проверка завершена.','Итак, проверка завершена.'],
    ['Мы исправили текст а затем отправили.','Мы исправили текст а затем отправили.'],
    ['Мы хотим чтобы текст был чистым.','Мы хотим чтобы текст был чистым.'],
    ['Покажем почему это важно.','Покажем, почему это важно.'],
    ['Редактор открыл файл и проверил его.','Редактор открыл файл и проверил его.'],
    ['Он увидел как бы знакомую картину.','Он увидел как бы знакомую картину.'],
    ['Она сказала, что текст готов.','Она сказала, что текст готов.'],
    ['Пожалуйста, проверьте статью.','Пожалуйста, проверьте статью.'],
    ['Например, редактор может проверить текст.','Например, редактор может проверить текст.'],
    ['Алкоголик пропил глобус, упал и улыбался.','Алкоголик пропил глобус, упал и улыбался.'],
    ['Он знает что-то важное.','Он знает что-то важное.'],
    ['Мы проверили текст без ошибок.','Мы проверили текст без ошибок.'],
    ['После проверки мы исправили текст.','После проверки мы исправили текст.'],
    ['Он подошёл к двери и увидел результат.','Он подошёл к двери и увидел результат.']
  ];
  for(const [input,expected] of cases) assert.equal(checkAndAccept(input).text.replace(/\u00a0/g,' '),expected,input);
  console.log('  Corpus:',cases.length,'representative fragments');
});
test('uncertain introductory comma is flagged without changing the text', () => {
  const result=check('Возможно немного другой формат покажется удобным.');
  assert.equal(result.text,'Возможно немного другой формат покажется удобным.');
  assert.ok(result.issues.some(item=>item.reviewOnly && !item.applied && item.before==='Возможно'));
  assert.ok(result.highlights.some(item=>item.kind==='context'));
  assert.ok(!check('Возможно, другой формат покажется удобным.').issues.some(item=>item.reviewOnly));
});
test('list and detached adverb comma risks are flagged for review', () => {
  for (const input of [
    'Вокруг этого — настройки тесты, сообщения об ошибках и документация.',
    'Ежедневно мы пользуемся подходами из мира ФП зачастую даже не подозревая об этом.'
  ]) {
    const result=check(input);
    assert.equal(result.text.replace(/\u00a0/g,' '),input);
    assert.ok(result.issues.some(item=>item.category==='Пунктуация' && item.reviewOnly && !item.applied));
  }
});
test('context grammar advice cannot silently rewrite a verb', () => {
  const base=check('Когда загрузка закончится появится результат.');
  const phrase='закончится появится';
  const start=base.text.indexOf(phrase);
  context.contextBase=base;
  context.contextRemote={masked:base.text,matches:[{offset:start,length:phrase.length,rule:{category:{id:'GRAMMAR'}},replacements:[{value:'закончится появиться'}]}]};
  const result=vm.runInContext('applyGrammarMatches(contextBase,contextRemote)',context);
  assert.equal(result.text,base.text);
  assert.ok(result.issues.some(item=>item.category==='Грамматика' && item.reviewOnly && !item.applied));
  assert.ok(result.highlights.some(item=>item.kind==='context' && result.text.slice(item.start,item.end)===phrase));
  vm.runInContext('renderIssues(contextBase.issues)',context);
  context.contextIssues=result.issues;
  vm.runInContext('renderIssues(contextIssues)',context);
  assert.ok(elements['issue-list'].innerHTML.includes('Проверьте и выберите вариант:'));
  assert.ok(elements['issue-list'].innerHTML.includes('data-choice-index'));
});
test('punctuation change beyond one inserted comma waits for review', () => {
  const base=check('Он подошёл к окну посмотрел.');
  const phrase='окну посмотрел';
  context.unsafeBase=base;
  context.unsafeRemote={masked:base.text,matches:[{offset:base.text.indexOf(phrase),length:phrase.length,rule:{category:{id:'PUNCTUATION'}},replacements:[{value:'окну; посмотрел'}]}]};
  const result=vm.runInContext('applyGrammarMatches(unsafeBase,unsafeRemote)',context);
  assert.equal(result.text,base.text);
  assert.ok(result.issues.some(item=>item.category==='Пунктуация' && item.reviewOnly && !item.applied));
});
test('LanguageTool proposal is deduplicated against the same local insertion', () => {
  const base=check('Пунктуация тоже а некоторые слова потерялись.');
  assert.ok(base.issues.some(item=>!item.applied && item.before==='тоже а'));
  const phrase='тоже а';
  context.duplicateBase=base;
  context.duplicateRemote={masked:base.text,matches:[{offset:base.text.indexOf(phrase),length:phrase.length,rule:{category:{id:'PUNCTUATION'}},replacements:[{value:'тоже, а'}]}]};
  const result=vm.runInContext('applyGrammarMatches(duplicateBase,duplicateRemote)',context);
  assert.equal(result.text,'Пунктуация тоже а некоторые слова потерялись.');
  assert.equal(result.issues.filter(item=>item.before==='тоже а').length,1);
  assert.ok(result.issues.some(item=>item.before==='тоже а' && !item.applied));
});
test('online close candidate requires approval and valid words stay untouched', () => {
  const result=vm.runInContext('checkText("Это машна. Он пал.", {}, [{code:1,pos:4,len:5,word:"машна",s:["машина"]},{code:1,pos:14,len:3,word:"пал",s:["пол"]}])',context);
  assert.ok(result.text.includes('Это машна.'));
  assert.ok(result.issues.some(item=>item.before==='машна' && !item.applied));
  assert.ok(result.text.includes('Он пал.'));
  assert.ok(result.issues.some(item=>item.before==='машна' && item.after==='машина'));
});
test('ambiguous online choices are shown without a forced replacement', () => {
  const result=vm.runInContext('checkText("Это машна.", {}, [{code:1,pos:4,len:5,word:"машна",s:["маша","машина","мошна"]}])',context);
  assert.ok(result.text.includes('машна'));
  assert.ok(result.issues.some(item=>item.before==='машна' && !item.applied && item.suggestions.includes('машина')));
});
test('online suggestion cannot force one meaning of an ambiguous word', () => {
  const result=vm.runInContext('checkText("Крипис это скоро закончится.", {}, [{code:1,pos:0,len:6,word:"Крипис",s:["Кризис"]}])',context);
  assert.equal(result.text,'Крипис это скоро закончится.');
  assert.ok(result.issues.some(item=>item.before==='Крипис' && !item.applied));
});
test('full sample applies safe fixes and flags ambiguous comma', () => {
  const input='Крипис это скора закончиться.\n\nВообщем, мы сделали новый интерфес который помогает редактору проверять статьи для Хабра . Он подошол к автору и нашол проблемму в тексте.\n\nВ этой статье раскажем как работает проверка в браузере. Она исправляет ошибычные слова  и убирает лишние пробелы';
  const result=check(input);
  assert.ok(result.text.startsWith('Крипис это скоро закончится.'));
  assert.ok(result.text.includes('нашёл проблему'));
  assert.ok(!result.text.includes('Кризис'));
  assert.ok(result.issues.some(item=>!item.applied && item.category==='Пунктуация' && item.after.includes(', который')));
});
test('ambiguous standalone Крипис offers both meanings without forcing one', () => {
  for(const input of ['Крипис!','крипис.']) {
    const result=check(input); assert.equal(result.text,input);
    assert.ok(result.issues.some(item=>!item.applied && item.suggestions.some(x=>x.toLowerCase()==='крепись') && item.suggestions.some(x=>x.toLowerCase()==='кризис')));
  }
});
test('valid phrases are not changed by the context rule', () => {
  assert.equal(check('Это скоро закончится.').text,'Это скоро закончится.');
  assert.equal(check('Дело должно скоро закончиться.').text,'Дело должно скоро закончиться.');
  assert.equal(check('Кризис это скоро закончится.').text,'Кризис это скоро закончится.');
});
test('verified typos are written into the final text', () => {
  const result=check('В статье есть тектс и пунктация. Эта програма работает.');
  assert.ok(result.text.includes('текст'));
  assert.ok(result.text.includes('пунктуация'));
  assert.ok(result.text.includes('программа'));
  assert.equal(result.issues.filter(item=>!item.applied).length,0);
});
test('unknown words remain suggestions rather than forced replacements', () => {
  const result=check('Это машна работает.');
  assert.ok(result.text.includes('машна'));
  assert.ok(result.issues.some(item=>item.before==='машна' && !item.applied));
  assert.ok(result.highlights.some(item=>item.kind==='suspect' && result.text.slice(item.start,item.end)==='машна'));
  context.pendingResult=result;
  assert.ok(vm.runInContext('renderHighlightedText(pendingResult.text,pendingResult.highlights)',context).includes('<span class="result-mark suspect">машна</span>'));
});
test('a unique dictionary candidate still requires editor approval', () => {
  const result=check('Редкактор открыл приложнеие.');
  assert.equal(result.text,'Редкактор открыл приложнеие.');
  assert.equal(result.issues.filter(item=>!item.applied).length,2);
  assert.ok(result.highlights.filter(item=>item.kind==='suspect').length>=2);
  assert.equal(check('Пашол домой.').text,'Пашол домой.');
});
test('suspect underline stays on the pending word after other corrections', () => {
  const result=check('Вообщем машна работает.');
  assert.ok(result.highlights.some(item=>item.kind==='suspect' && result.text.slice(item.start,item.end)==='машна'));
  assert.ok(!check('Тут тектс.').highlights.some(item=>item.kind==='suspect'));
  const code=check('`машна` и машна.');
  assert.equal(code.highlights.filter(item=>item.kind==='suspect').length,1);
  assert.equal(code.text.slice(code.highlights.find(item=>item.kind==='suspect').start,code.highlights.find(item=>item.kind==='suspect').end),'машна');
  const accepted=vm.runInContext('checkText("Это машна.", {"машна":"машина"})',context);
  assert.equal(accepted.text,'Это машина.');
  assert.ok(accepted.highlights.some(item=>item.kind==='error'));
  assert.ok(!accepted.highlights.some(item=>item.kind==='suspect'));
});
test('numbered issue pins follow their corresponding words', () => {
  const result=check('Приложнеие и приложнеие.');
  const pins=result.highlights.filter(item=>item.kind==='issue-pin');
  assert.equal(result.issues.length,2);
  assert.equal(pins.length,2);
  for (const issue of result.issues) assert.equal(pins.filter(pin=>pin.issueId===issue.id).length,1);
  context.numberedResult=result;
  const rendered=vm.runInContext('renderHighlightedText(numberedResult.text,numberedResult.highlights,numberedResult.issues)',context);
  assert.ok(rendered.includes('data-number="1"'));
  assert.ok(rendered.includes('data-number="2"'));
  assert.ok(rendered.indexOf('data-number="1"')<rendered.indexOf('data-number="2"'));
  assert.equal(rendered.replace(/<[^>]*>/g,''),result.text);
  const corrected=check('Прешол и упол на пал.');
  assert.ok(corrected.issues.every(issue=>corrected.highlights.some(pin=>pin.kind==='issue-pin' && pin.issueId===issue.id)));
});
test('correct words and Habr name', () => {
  const result=check('Редактор проверил статью для Хабра.');
  assert.equal(result.issues.filter(item=>item.category==='Орфография').length,0);
});
test('code and URL protected', () => {
  const result=check('`тектс` и тектс. https://example.com/пунктация');
  assert.ok(result.text.includes('`тектс`'));
  assert.ok(result.text.includes('и текст.'));
  assert.ok(result.text.includes('https://example.com/пунктация'));
});
test('result UI shows spelling issue', () => {
  elements.source.value='Тут тектс и машна.';
  elements.source.fire('input');
  elements['check-button'].fire('click');
  const timer=timers.find(item=>!item.canceled && item.ms===150);
  timer.canceled=true;
  timer.fn();
  assert.ok(elements['issue-list'].innerHTML.includes('тектс'));
  assert.ok(elements['issue-list'].innerHTML.includes('машна'));
  assert.ok(elements['issue-list'].innerHTML.includes('issue-number'));
  assert.ok(elements['issue-list'].innerHTML.includes('data-jump-issue="1"'));
  assert.ok(shownResult().includes('текст'));
  assert.ok(elements['result-text'].innerHTML.includes('result-mark suspect'));
  assert.ok(elements['result-text'].innerHTML.includes('result-issue-pin'));
  assert.equal(vm.runInContext('preparedText',context),shownResult());
  assert.ok(elements['success-summary'].textContent.includes('ручной проверки'));
  assert.equal(elements['result-title'].textContent,'Текст на проверке');
  assert.equal(elements['pending-badge'].textContent,'Осталось: 1');
  assert.equal(elements['copy-button'].attributes['aria-label'],'Скопировать черновик');
});
test('editor can confirm with unresolved notices after explicit modal confirmation', () => {
  elements.source.value='Это машна.';
  elements['check-button'].fire('click');
  const timer=timers.findLast(item=>!item.canceled && item.ms===150);
  timer.canceled=true;
  timer.fn();
  assert.equal(elements['result-title'].textContent,'Текст на проверке');
  assert.equal(elements['finish-button'].disabled,false);
  elements['finish-button'].fire('click');
  assert.ok(!elements['leave-overlay'].classList.contains('hidden'));
  assert.equal(elements['leave-description'].textContent,'Вы действительно хотите подтвердить данный результат?');
  assert.equal(elements['confirm-leave'].textContent,'Подтвердить результат');
  assert.equal(vm.runInContext('reviewed',context),false);
  elements['cancel-leave'].fire('click');
  assert.equal(vm.runInContext('reviewed',context),false);
  assert.ok(!elements['pending-badge'].classList.contains('hidden'));
  const confirmedText=shownResult();
  elements['finish-button'].fire('click');
  elements['confirm-leave'].fire('click');
  assert.equal(vm.runInContext('reviewed',context),false);
  assert.equal(elements.source.value,confirmedText);
  assert.ok(!elements['input-screen'].classList.contains('hidden'));
  assert.ok(elements['result-screen'].classList.contains('hidden'));
  assert.equal(vm.runInContext('hasResult',context),false);
  assert.equal(windowEvents.get('beforeunload')?.size,0);
  assert.equal(elements['intro-description'].textContent,'Подтверждённый исправленный текст готов к дальнейшей работе.');
  assert.equal(elements['toast-message'].textContent,'Подтверждённый текст перенесён на главный экран.');
  assert.ok(vm.runInContext('historyDatabase.documents.some(doc=>doc.status==="confirmed" && doc.correctedText===source.value)',context));
  assert.equal(elements['check-button'].disabled,false);
  elements.source.value=confirmedText+' Новый фрагмент.';
  elements.source.fire('input');
  assert.equal(elements['intro-description'].textContent,'Вставьте черновик статьи. Типограф покажет правки и подготовит текст для копирования.');
});
test('editing the result requires a new check and confirmation', () => {
  elements.source.value='Это машна.';
  elements['check-button'].fire('click');
  const initialTimer=timers.findLast(item=>!item.canceled && item.ms===150);
  initialTimer.canceled=true;
  initialTimer.fn();
  elements['edit-result-button'].fire('click');
  assert.equal(vm.runInContext('editingResult',context),true);
  assert.equal(elements['copy-button'].disabled,true);
  assert.equal(elements['result-editor'].classList.contains('hidden'),false);
  elements['result-editor'].value='Это машина.';
  elements['result-editor'].fire('input');
  vm.runInContext('restoreSavedResult()',context);
  assert.equal(elements['result-editor'].value,'Это машина.');
  assert.equal(vm.runInContext('editingResult',context),true);
  elements['recheck-button'].fire('click');
  const timer=timers.findLast(item=>!item.canceled && item.ms===150);
  timer.canceled=true;
  timer.fn();
  assert.equal(shownResult(),'Это машина.');
  assert.equal(elements['result-title'].textContent,'Текст на проверке');
  assert.equal(elements['finish-button'].disabled,false);
  elements['finish-button'].fire('click');
  assert.equal(elements['leave-description'].textContent,'Вы действительно хотите подтвердить данный результат?');
  elements['confirm-leave'].fire('click');
  assert.equal(elements.source.value,'Это машина.');
  assert.ok(!elements['input-screen'].classList.contains('hidden'));
  assert.ok(elements['result-screen'].classList.contains('hidden'));
});
test('grammar advice changes text only after editor chooses it', () => {
  const base=check('Когда загрузка закончится появится результат.');
  const phrase='закончится появится';
  context.reviewBase=base;
  context.reviewRemote={masked:base.text,matches:[{offset:base.text.indexOf(phrase),length:phrase.length,rule:{category:{id:'GRAMMAR'}},replacements:[{value:'закончится, появится'}]}]};
  vm.runInContext('reviewResult = applyGrammarMatches(reviewBase, reviewRemote); updateResult(reviewResult.text, reviewResult.issues, reviewResult.highlights)',context);
  assert.equal(vm.runInContext('preparedText',context),base.text);
  elements['issue-list'].scrollTop=176;
  elements['result-text'].scrollTop=128;
  mockWindow.scrollY=522;
  const grammarIssueIndex=vm.runInContext('currentIssues.findIndex(item => item.category === "Грамматика" && !item.applied)',context);
  elements['issue-list'].fire('click',{target:{closest:selector=>selector==='button[data-issue-index]'?{dataset:{issueIndex:String(grammarIssueIndex),choiceIndex:'0'}}:null}});
  assert.ok(vm.runInContext('preparedText',context).includes('закончится, появится'));
  assert.equal(elements['issue-list'].scrollTop,176);
  assert.equal(elements['result-text'].scrollTop,128);
  assert.equal(mockWindow.scrollY,522);
  assert.equal(document.activeElement,elements['issue-list']);
});
test('clicking an issue number scrolls to and emphasizes its result pin', () => {
  const pin=new Element('test-pin');
  pin.dataset={number:'1'};
  let scrollOptions;
  pin.scrollIntoView=options=>{scrollOptions=options;};
  elements['result-text'].querySelectorAll=selector=>selector==='.result-issue-pin'?[pin]:[];
  const jump={dataset:{jumpIssue:'1'}};
  elements['issue-list'].fire('click',{target:{closest:selector=>selector==='button[data-jump-issue]'?jump:null}});
  assert.ok(pin.classList.contains('is-active'));
  assert.equal(document.activeElement,pin);
  assert.equal(scrollOptions.block,'center');
});
test('finished sample appears in the result text pane and copy source', () => {
  elements.source.value='Превет, это скора закончиться. Он нашол проблемму в тексте.';
  elements['check-button'].fire('click');
  const timer=timers.findLast(item=>!item.canceled && item.ms===150);
  timer.canceled=true;
  timer.fn();
  assert.equal(shownResult(),'Привет, это скоро закончится. Он нашёл проблему в\u00a0тексте.');
  assert.equal(vm.runInContext('preparedText',context),shownResult());
  assert.ok(elements['result-text'].innerHTML.includes('result-mark error'));
  assert.ok(elements['result-text'].innerHTML.includes('result-mark format'));
  assert.ok(elements['result-text'].innerHTML.includes('<span class="result-mark error">Привет</span>'));
  assert.ok(!elements['result-text'].innerHTML.includes('<span class="result-mark error">это</span>'));
  assert.ok(elements['success-summary'].textContent.includes('Перечитайте текст'));
  assert.equal(elements['result-title'].textContent,'Текст на проверке');
  assert.ok(elements['pending-badge'].classList.contains('hidden'));
});
test('editor can accept a suggestion without changing code fragments', () => {
  elements.source.value='`машна` и машна.';
  elements['check-button'].fire('click');
  const timer=timers.findLast(item=>!item.canceled && item.ms===150);
  timer.canceled=true;
  timer.fn();
  const issueIndex=vm.runInContext("currentIssues.findIndex(item => item.before === 'машна' && !item.applied)",context);
  assert.ok(issueIndex>=0);
  assert.ok(vm.runInContext('currentIssues['+issueIndex+'].suggestions.length',context)>0);
  const choiceIndex=vm.runInContext('currentIssues['+issueIndex+'].suggestions.indexOf("машина")',context);
  assert.ok(choiceIndex>=0);
  elements['issue-list'].fire('click',{target:{closest:()=>({dataset:{issueIndex:String(issueIndex),choiceIndex:String(choiceIndex)}})}});
  assert.ok(shownResult().startsWith('`машна` и '));
  assert.ok(shownResult().endsWith('и машина.'),JSON.stringify({shown:shownResult(),issue:vm.runInContext('currentIssues[0]',context)}));
  assert.equal(vm.runInContext('preparedText',context),shownResult());
  assert.ok(elements['result-text'].innerHTML.includes('result-mark error'));
  assert.ok(elements['success-summary'].textContent.includes('Перечитайте текст'));
  assert.equal(elements['result-title'].textContent,'Текст на проверке');
  assert.ok(elements['pending-badge'].classList.contains('hidden'));
});
test('highlight rendering escapes source markup', () => {
  const html=vm.runInContext('renderHighlightedText("<img src=x onerror=alert(1)>", [])',context);
  assert.ok(html.includes('&lt;img'));
  assert.ok(!html.includes('<img'));
});
test('long text', () => {
  const source='Это текст в статье. '.repeat(5000);
  const start=Date.now();
  const result=check(source);
  assert.ok(result.text.length>99000);
  assert.equal(result.issues.length,5000);
  context.largeResult=result;
  const rendered=vm.runInContext('renderHighlightedText(largeResult.text, largeResult.highlights)',context);
  assert.ok(rendered.includes('result-mark format'));
  assert.ok(rendered.length>result.text.length);
  console.log('  100 000 characters:',Date.now()-start,'ms');
});

const sentTexts=[];
context.fetch=async (url, options) => {
  if (url.includes('languagetool.org')) return {ok:true,json:async()=>({matches:[]})};
  assert.equal(url,'https://speller.yandex.net/services/spellservice.json/checkText');
  const sent=options.body.get('text');
  sentTexts.push(sent);
  const pos=sent.indexOf('машна');
  return {ok:true,json:async()=>pos<0?[]:[{code:1,pos,len:5,word:'машна',s:['машина']}]};
};
elements['online-toggle'].checked=true;
elements['online-toggle'].fire('change');
assert.ok(!elements['online-info'].classList.contains('hidden'));
elements['online-info'].fire('mouseenter');
assert.ok(elements['online-tooltip'].classList.contains('is-open'));
elements['online-info'].fire('mouseleave');
assert.ok(!elements['online-tooltip'].classList.contains('is-open'));
elements['online-info-button'].fire('focus');
assert.ok(elements['online-tooltip'].classList.contains('is-open'));
elements['online-info-button'].fire('blur');
assert.ok(!elements['online-tooltip'].classList.contains('is-open'));
elements.source.value='`машна` и машна.';
elements['check-button'].fire('click');
const onlineTimer=timers.findLast(item=>!item.canceled && item.ms===150);
onlineTimer.canceled=true;
await onlineTimer.fn();
assert.equal(shownResult(),'`машна` и машна.');
assert.ok(vm.runInContext("currentIssues.some(item=>item.before==='машна' && !item.applied && item.suggestions.includes('машина'))",context));
assert.ok(!sentTexts[0].includes('`машна`'));
assert.ok(elements['online-credit'].classList.contains('hidden')===false);
assert.ok(elements['grammar-credit'].classList.contains('hidden')===false);
console.log('PASS combined online request, protected code, attribution, and final text');

context.fetch=async (url, options) => {
  if (url.includes('languagetool.org')) return {ok:true,json:async()=>({matches:[]})};
  const pos=options.body.get('text').indexOf('машна');
  return {ok:true,json:async()=>[{code:1,pos,len:5,word:'машна',s:['маша','машина','мошна']}]};
};
elements.source.value='Это машна.';
elements['check-button'].fire('click');
const ambiguousTimer=timers.findLast(item=>!item.canceled && item.ms===150);
ambiguousTimer.canceled=true;
await ambiguousTimer.fn();
assert.ok(shownResult().includes('машна'));
const ambiguousIndex=vm.runInContext("currentIssues.findIndex(item => item.before === 'машна' && !item.applied)",context);
const machineChoice=vm.runInContext('currentIssues['+ambiguousIndex+'].suggestions.indexOf("машина")',context);
elements['issue-list'].fire('click',{target:{closest:()=>({dataset:{issueIndex:String(ambiguousIndex),choiceIndex:String(machineChoice)}})}});
assert.ok(shownResult().includes('машина'));
console.log('PASS ambiguous online suggestion can be selected into final text');

let unwantedRequests=0;
context.fetch=async () => { unwantedRequests++; throw new Error('network down'); };
elements['online-toggle'].checked=false;
elements['online-toggle'].fire('change');
assert.ok(elements['online-info'].classList.contains('hidden'));
assert.ok(!elements['online-tooltip'].classList.contains('is-open'));
elements.source.value='Прешол и упол на пал.';
elements['check-button'].fire('click');
const localTimer=timers.findLast(item=>!item.canceled && item.ms===150);
localTimer.canceled=true;
await localTimer.fn();
assert.equal(unwantedRequests,0);
assert.equal(shownResult(),'Пришёл и упал на\u00a0пол.');
assert.ok(elements['online-credit'].classList.contains('hidden'));
assert.ok(elements['grammar-credit'].classList.contains('hidden'));
console.log('PASS local mode sends no request');

elements['online-toggle'].checked=true;
elements.source.value='Прешол и упол на пал.';
elements['check-button'].fire('click');
const failedTimer=timers.findLast(item=>!item.canceled && item.ms===150);
failedTimer.canceled=true;
await failedTimer.fn();
assert.equal(unwantedRequests,2);
assert.equal(shownResult(),'Пришёл и упал на\u00a0пол.');
assert.ok(elements['success-summary'].textContent.includes('Онлайн-проверка орфографии недоступна'));
assert.ok(elements['success-summary'].textContent.includes('Онлайн-проверка пунктуации недоступна'));
console.log('PASS network failure falls back to local corrections');

const chunksSeen=[];
context.fetch=async (url, options) => {
  const chunk=options.body.get('text');
  chunksSeen.push(chunk);
  const pos=chunk.indexOf('машна');
  return {ok:true,json:async()=>pos<0?[]:[{code:1,pos,len:5,word:'машна',s:['машина']}]};
};
const longOnlineInput='а'.repeat(8100)+' машна.';
const chunkMatches=await vm.runInContext('getOnlineMatches('+JSON.stringify(longOnlineInput)+')',context);
assert.equal(chunksSeen.length,2);
assert.equal(chunkMatches[0].pos,longOnlineInput.indexOf('машна'));
console.log('PASS long online text keeps correction offsets across chunks');

elements['online-toggle'].checked=true;
elements['online-toggle'].fire('change');
let grammarRequests=0;
context.fetch=async (url, options) => {
  if (url.includes('speller.yandex.net')) return {ok:true,json:async()=>[]};
  grammarRequests++;
  assert.equal(url,'https://api.languagetool.org/v2/check');
  assert.equal(options.method,'POST');
  assert.equal(options.body.get('language'),'ru');
  const sent=options.body.get('text');
  const phrase='подошёл к\u00a0окну посмотрел';
  const start=sent.indexOf(phrase);
  assert.ok(start>=0);
  return {ok:true,json:async()=>({matches:[{offset:start,length:phrase.length,rule:{category:{id:'PUNCTUATION'}},replacements:[{value:'подошёл к окну, посмотрел'},{value:'подошёл к окну и посмотрел'}]}]})};
};
elements.source.value='Он подошёл к окну посмотрел на улицу.';
elements['check-button'].fire('click');
const grammarTimer=timers.findLast(item=>!item.canceled && item.ms===150);
grammarTimer.canceled=true;
await grammarTimer.fn();
assert.equal(grammarRequests,1);
assert.equal(shownResult(),'Он подошёл к\u00a0окну посмотрел на\u00a0улицу.');
assert.ok(vm.runInContext('currentIssues.some(item => item.onlinePunctuation && !item.applied && item.reviewOnly)',context));
assert.ok(vm.runInContext('applyChosenSuggestion(currentIssues.find(i=>i.onlinePunctuation),currentIssues.find(i=>i.onlinePunctuation).suggestions[0])',context));
assert.equal(shownResult(),'Он подошёл к\u00a0окну, посмотрел на\u00a0улицу.');
assert.ok(!elements['grammar-credit'].classList.contains('hidden'));
assert.ok(!elements['online-credit'].classList.contains('hidden'));
assert.ok(elements['issue-list'].innerHTML.includes('LanguageTool'));
console.log('PASS combined switch proposes a comma-only LanguageTool correction and editor applies it');

context.fetch=async (url, options) => {
  if (url.includes('speller.yandex.net')) return {ok:true,json:async()=>[]};
  assert.equal(url,'https://api.languagetool.org/v2/check');
  const sent=options.body.get('text');
  const phrase='подошёл к\u00a0окну посмотрел';
  const start=sent.indexOf(phrase);
  return {ok:true,json:async()=>({matches:[{offset:start,length:phrase.length,rule:{category:{id:'PUNCTUATION'}},replacements:[{value:'подошёл к окну, посмотрел'},{value:'подошёл к окну; посмотрел'}]}]})};
};
elements.source.value='Он подошёл к окну посмотрел на улицу.';
elements['check-button'].fire('click');
const choicesTimer=timers.findLast(item=>!item.canceled && item.ms===150);
choicesTimer.canceled=true;
await choicesTimer.fn();
assert.ok(shownResult().includes('окну посмотрел'));
assert.ok(elements['issue-list'].innerHTML.includes('Проверьте и выберите вариант'));
const grammarChoiceIndex=vm.runInContext('currentIssues.findIndex(item => item.onlinePunctuation)',context);
elements['issue-list'].fire('click',{target:{closest:()=>({dataset:{issueIndex:String(grammarChoiceIndex),choiceIndex:'0'}})}});
assert.equal(shownResult(),'Он подошёл к\u00a0окну, посмотрел на\u00a0улицу.');
console.log('PASS ambiguous punctuation variant can be selected into final text');

elements.source.value='Он подошёл к окну посмотрел на улицу.';
elements['check-button'].fire('click');
const semicolonTimer=timers.findLast(item=>!item.canceled && item.ms===150);
semicolonTimer.canceled=true;
await semicolonTimer.fn();
const semicolonIssueIndex=vm.runInContext('currentIssues.findIndex(item => item.onlinePunctuation)',context);
elements['issue-list'].fire('click',{target:{closest:()=>({dataset:{issueIndex:String(semicolonIssueIndex),choiceIndex:'1'}})}});
assert.equal(shownResult(),'Он подошёл к\u00a0окну; посмотрел на\u00a0улицу.');
assert.ok(vm.runInContext('currentIssues.some(item => item.applied && item.after.includes(";"))',context));
console.log('PASS editor-selected semicolon is applied to the final text');

const twoBase=check('Он подошёл к окну посмотрел. Она вышла из дома заметила.');
const firstPhrase='подошёл к\u00a0окну посмотрел';
const secondPhrase='вышла из\u00a0дома заметила';
context.twoBase=twoBase;
context.twoRemote={masked:twoBase.text,matches:[
  {offset:twoBase.text.indexOf(firstPhrase),length:firstPhrase.length,rule:{category:{id:'PUNCTUATION'}},replacements:[{value:'подошёл к окну, посмотрел'}]},
  {offset:twoBase.text.indexOf(secondPhrase),length:secondPhrase.length,rule:{category:{id:'PUNCTUATION'}},replacements:[{value:'вышла из дома, заметила'}]}
]};
const twoFixed=vm.runInContext('applyGrammarMatches(twoBase,twoRemote)',context);
assert.equal(twoFixed.text,'Он подошёл к\u00a0окну посмотрел. Она вышла из\u00a0дома заметила.');
assert.equal(twoFixed.issues.filter(item=>item.note.includes('LanguageTool') && !item.applied).length,2);
assert.ok(twoFixed.issues.every(issue=>twoFixed.highlights.some(pin=>pin.kind==='issue-pin' && pin.issueId===issue.id)));
context.twoFixed=twoFixed;
vm.runInContext('updateResult(twoFixed.text, twoFixed.issues, twoFixed.highlights); for(let n=0;n<2;n++){const issue=currentIssues.find(i=>i.onlinePunctuation && !i.applied);applyChosenSuggestion(issue,issue.suggestions[0]);}',context);
assert.equal(vm.runInContext('preparedText',context),'Он подошёл к\u00a0окну, посмотрел. Она вышла из\u00a0дома, заметила.');
console.log('PASS two editor-selected LanguageTool corrections keep offsets and no-break spaces');

const twoPendingBase=check('Он подошёл к окну посмотрел. Она вышла из дома заметила.');
context.twoPendingBase=twoPendingBase;
context.twoPendingRemote={masked:twoPendingBase.text,matches:[
  {offset:twoPendingBase.text.indexOf(firstPhrase),length:firstPhrase.length,rule:{category:{id:'PUNCTUATION'}},replacements:[{value:'подошёл к окну, посмотрел'},{value:'подошёл к окну; посмотрел'}]},
  {offset:twoPendingBase.text.indexOf(secondPhrase),length:secondPhrase.length,rule:{category:{id:'PUNCTUATION'}},replacements:[{value:'вышла из дома, заметила'},{value:'вышла из дома; заметила'}]}
]};
vm.runInContext('twoPendingResult = applyGrammarMatches(twoPendingBase,twoPendingRemote); updateResult(twoPendingResult.text, twoPendingResult.issues, twoPendingResult.highlights)',context);
assert.ok(vm.runInContext('applyChosenSuggestion(currentIssues.find(item => item.onlinePunctuation), currentIssues.find(item => item.onlinePunctuation).suggestions[1])',context));
assert.ok(vm.runInContext('applyChosenSuggestion(currentIssues.find(item => item.onlinePunctuation), currentIssues.find(item => item.onlinePunctuation).suggestions[0])',context));
assert.equal(vm.runInContext('preparedText',context),'Он подошёл к\u00a0окну; посмотрел. Она вышла из\u00a0дома, заметила.');
console.log('PASS choosing two punctuation suggestions preserves later offsets');

let maskedGrammarText='';
context.fetch=async (url, options) => {
  maskedGrammarText=options.body.get('text');
  return {ok:true,json:async()=>({matches:[]})};
};
await vm.runInContext('getGrammarMatches("`пропущена,` и текст. https://example.com/a,b")',context);
assert.ok(!maskedGrammarText.includes('`пропущена,`'));
assert.ok(!maskedGrammarText.includes('https://example.com/a,b'));
console.log('PASS protected code and URLs are masked before punctuation request');

context.fetch=async url=>url.includes('speller.yandex.net') ? {ok:true,json:async()=>[]} : Promise.reject(new Error('network down'));
elements.source.value='Подошёл увидел как она присела на лавочку.';
elements['check-button'].fire('click');
const offlineGrammarTimer=timers.findLast(item=>!item.canceled && item.ms===150);
offlineGrammarTimer.canceled=true;
await offlineGrammarTimer.fn();
assert.equal(shownResult(),'Подошёл увидел как она присела на\u00a0лавочку.');
assert.equal(vm.runInContext('currentIssues.filter(i=>i.category===punctuationLabel && !i.applied).length',context),2);
assert.ok(elements['success-summary'].textContent.includes('Онлайн-проверка пунктуации недоступна'));
console.log('PASS punctuation service failure keeps local corrections');

elements['online-toggle'].checked=true;
elements['online-toggle'].fire('change');
const services=[];
context.fetch=async (url, options) => {
  services.push(url);
  if (url.includes('speller.yandex.net')) return {ok:true,json:async()=>[]};
  const sent=options.body.get('text');
  const phrase='пришёл к\u00a0окну посмотрел';
  const start=sent.indexOf(phrase);
  return {ok:true,json:async()=>({matches:[{offset:start,length:phrase.length,rule:{category:{id:'PUNCTUATION'}},replacements:[{value:'пришёл к окну, посмотрел'}]}]})};
};
elements.source.value='Он прешол к окну посмотрел на улицу.';
elements['check-button'].fire('click');
const combinedTimer=timers.findLast(item=>!item.canceled && item.ms===150);
combinedTimer.canceled=true;
await combinedTimer.fn();
assert.equal(shownResult(),'Он пришёл к\u00a0окну посмотрел на\u00a0улицу.');
assert.ok(vm.runInContext('currentIssues.some(item => item.onlinePunctuation && !item.applied && item.reviewOnly)',context));
assert.ok(vm.runInContext('applyChosenSuggestion(currentIssues.find(i=>i.onlinePunctuation),currentIssues.find(i=>i.onlinePunctuation).suggestions[0])',context));
assert.equal(shownResult(),'Он пришёл к\u00a0окну, посмотрел на\u00a0улицу.');
assert.equal(services.length,2);
assert.ok(!elements['online-credit'].classList.contains('hidden'));
assert.ok(!elements['grammar-credit'].classList.contains('hidden'));
console.log('PASS automatic spelling and editor-selected punctuation compose safely');

elements['online-toggle'].checked=false;
elements['online-toggle'].fire('change');
let disabledRequests=0;
context.fetch=async()=>{ disabledRequests++; throw new Error('no online requests expected'); };
elements.source.value='Он подошёл к окну посмотрел на улицу.';
elements['check-button'].fire('click');
const noGrammarTimer=timers.findLast(item=>!item.canceled && item.ms===150);
noGrammarTimer.canceled=true;
await noGrammarTimer.fn();
assert.ok(shownResult().includes('окну посмотрел'));
assert.ok(elements['grammar-credit'].classList.contains('hidden'));
assert.ok(elements['online-credit'].classList.contains('hidden'));
assert.equal(disabledRequests,0);
console.log('PASS single disabled switch stops both services');

test('result is preserved and refresh or close requests browser confirmation', () => {
  assert.equal(windowEvents.get('beforeunload')?.size,1);
  const key='typograf-result-v1:/typograf-prototype/index.html';
  const saved=JSON.parse(storedResults.get(key));
  assert.equal(saved.text,shownResult());
  assert.equal(saved.source,elements.source.value);
  assert.equal(saved.issues.length,vm.runInContext('currentIssues.length',context));
  assert.equal(mockWindow.history.state.typografResult.text,saved.text);
  let prevented=false;
  const event={preventDefault(){prevented=true;},returnValue:false};
  for(const handler of windowEvents.get('beforeunload')) handler(event);
  assert.equal(prevented,true);
  assert.equal(event.returnValue,true);
  assert.equal(storedResults.has(key),true);
});
test('history state restores the result if local file storage is blocked', () => {
  const originalStorage=mockWindow.sessionStorage;
  const expected=shownResult();
  Object.defineProperty(mockWindow,'sessionStorage',{configurable:true,get(){throw new Error('SecurityError');}});
  vm.runInContext('hasResult=false; preparedText=""; currentIssues=[]; currentHighlights=[];',context);
  elements['result-text'].innerHTML='';
  vm.runInContext('restoreSavedResult()',context);
  assert.equal(shownResult(),expected);
  Object.defineProperty(mockWindow,'sessionStorage',{configurable:true,value:originalStorage,writable:true});
});
test('refresh restores final text, issues, source and result screen', () => {
  const expected=shownResult();
  vm.runInContext('hasResult=false; preparedText=""; currentIssues=[]; currentHighlights=[];',context);
  elements.source.value='';
  elements['result-text'].innerHTML='';
  elements['issue-list'].innerHTML='';
  elements['input-screen'].classList.remove('hidden');
  elements['result-screen'].classList.add('hidden');
  vm.runInContext('restoreSavedResult()',context);
  assert.equal(shownResult(),expected);
  assert.equal(elements.source.value,'Он подошёл к окну посмотрел на улицу.');
  assert.ok(!elements['result-screen'].classList.contains('hidden'));
  assert.ok(elements['issue-list'].innerHTML.includes('issue-number'));
  assert.equal(vm.runInContext('hasResult',context),true);
});
test('edit button asks for confirmation and cancellation keeps the result', () => {
  const expected=shownResult();
  elements['edit-button'].focus();
  elements['edit-button'].fire('click');
  assert.ok(!elements['leave-overlay'].classList.contains('hidden'));
  assert.ok(elements['leave-description'].textContent.includes('изменить исходный текст'));
  assert.equal(elements['confirm-leave'].textContent,'Изменить текст');
  assert.ok(!elements['result-screen'].classList.contains('hidden'));
  elements['cancel-leave'].fire('click');
  assert.ok(elements['leave-overlay'].classList.contains('hidden'));
  assert.equal(shownResult(),expected);
  assert.ok(!elements['result-screen'].classList.contains('hidden'));
  assert.equal(windowEvents.get('beforeunload')?.size,1);
});
test('confirmed edit keeps the source and discards the old result', () => {
  const original=elements.source.value;
  elements['edit-button'].fire('click');
  elements['confirm-leave'].fire('click');
  assert.equal(elements.source.value,original);
  assert.ok(elements['leave-overlay'].classList.contains('hidden'));
  assert.ok(elements['result-screen'].classList.contains('hidden'));
  assert.ok(!elements['input-screen'].classList.contains('hidden'));
  assert.equal(vm.runInContext('hasResult',context),false);
  assert.equal(storedResults.size,0);
  assert.equal(mockWindow.history.state,null);
  assert.equal(windowEvents.get('beforeunload')?.size,0);
  elements['check-button'].fire('click');
  const timer=timers.findLast(item=>!item.canceled && item.ms===150);
  timer.canceled=true;
  timer.fn();
  assert.ok(!elements['result-screen'].classList.contains('hidden'));
});
test('confirmed return home clears saved result and unload warning', () => {
  let prevented=false;
  elements['home-link'].fire('click',{preventDefault(){prevented=true;}});
  assert.equal(prevented,true);
  assert.ok(!elements['leave-overlay'].classList.contains('hidden'));
  assert.ok(elements['leave-description'].textContent.includes('вернуться на главную страницу'));
  assert.equal(elements['confirm-leave'].textContent,'Перейти на главную');
  elements['confirm-leave'].fire('click');
  assert.equal(storedResults.size,0);
  assert.equal(mockWindow.history.state,null);
  assert.equal(windowEvents.get('beforeunload')?.size,0);
  assert.ok(!elements['input-screen'].classList.contains('hidden'));
});

test('empty and whitespace-only input cannot start a check', () => {
  assert.equal(elements['check-button'].disabled,true);
  elements.source.value=' \n\t ';
  elements.source.fire('input');
  assert.equal(elements['check-button'].disabled,true);
  assert.equal(elements['char-count'].textContent,'4 символа');
});

test('demo generates erroneous text and checks it in one action', () => {
  elements['demo-button'].fire('click');
  const timer=timers.findLast(item=>!item.canceled && item.ms===150);
  assert.ok(timer);
  timer.canceled=true;
  timer.fn();
  assert.ok(elements.source.value.startsWith('Вообщем,'));
  assert.ok(shownResult().replace(/\u00a0/g,' ').startsWith('В общем,'));
  assert.ok(!elements['result-screen'].classList.contains('hidden'));
  assert.ok(elements['issue-list'].innerHTML.includes('issue-number'));
  assert.equal(vm.runInContext('preparedText',context),shownResult());
});

test('Escape closes the loss warning and preserves the result', () => {
  const expected=shownResult();
  elements['home-link'].fire('click',{preventDefault(){}});
  assert.ok(!elements['leave-overlay'].classList.contains('hidden'));
  let prevented=false;
  elements['leave-overlay'].fire('keydown',{key:'Escape',preventDefault(){prevented=true;}});
  assert.equal(prevented,true);
  assert.ok(elements['leave-overlay'].classList.contains('hidden'));
  assert.equal(shownResult(),expected);
  assert.equal(windowEvents.get('beforeunload')?.size,1);
});

let copiedText='';
context.navigator.clipboard.writeText=async value=>{copiedText=value;};
await elements['copy-button'].fire('click');
assert.equal(copiedText,shownResult());
assert.equal(elements['toast-message'].textContent,'Черновик скопирован');
console.log('PASS copy writes the plain corrected text');

context.navigator.clipboard.writeText=async()=>{throw new Error('Clipboard blocked');};
document.execCommand=command=>command==='copy';
await elements['copy-button'].fire('click');
assert.equal(elements['toast-message'].textContent,'Черновик скопирован');
document.execCommand=()=>false;
await elements['copy-button'].fire('click');
assert.equal(elements['toast-message'].textContent,'Не удалось скопировать текст');
console.log('PASS copy fallback and failure states');

test('toast duration, hover pause, and reversible fade', () => {
  const toast=elements.toast;
  assert.ok(timers.findLast(item=>!item.canceled && item.ms===4600));
  toast.fire('mouseenter');
  const hoverTimer=timers.findLast(item=>item.ms===4600);
  assert.equal(hoverTimer.canceled,true);
  toast.fire('mouseleave');
  const resumeTimer=timers.findLast(item=>!item.canceled && item.ms>=1500);
  assert.ok(resumeTimer);
  resumeTimer.fn();
  assert.ok(toast.classList.contains('is-leaving'));
  assert.ok(!toast.classList.contains('hidden'));
  toast.fire('mouseenter');
  assert.ok(!toast.classList.contains('is-leaving'));
  toast.fire('mouseleave');
  const finalTimer=timers.findLast(item=>!item.canceled && item.ms===1500);
  assert.ok(finalTimer);
  finalTimer.fn();
  const fadeTimer=timers.findLast(item=>!item.canceled && item.ms===220);
  assert.ok(fadeTimer);
  fadeTimer.fn();
  assert.ok(toast.classList.contains('hidden'));
});

test('uppercase author emphasis survives verified typo correction', () => {
  assert.equal(check('ПРЕШОЛ И УПОЛ.').text,'ПРИШЁЛ И УПАЛ.');
  assert.equal(check('ВОOБЩЕМ.').text,'ВОOБЩЕМ.');
});
test('code, email, technical identifiers and filenames survive local and unexpected remote matches', () => {
  const input='Адрес: подошол@example.com. Ключ: прешол_count. Файл: упол.json. Код: `машна`.';
  assert.equal(check(input).text,input);
  context.protectedInput=input;
  context.protectedMatches=[{code:1,pos:input.indexOf('машна'),len:5,word:'машна',s:['машина']}];
  const result=vm.runInContext('checkText(protectedInput,{},protectedMatches)',context);
  assert.equal(result.text,input);
  assert.equal(result.issues.filter(x=>x.category==='Орфография').length,0);
});
test('fixed expressions and river-flow context are not damaged by broad comma or duration rules', () => {
  for(const input of ['Он сказал как отрезал.','Она сказала как отрезала.','Он сказал как есть.','Он объяснил как можно проще.',
    'Я знаю что к чему.','Он сказал что угодно.','Она написала что попало.','Конечно же, он пришёл.',
    'Измерения в течении этой реки завершены.','Щас проверю файл.']) {
    assert.equal(check(input).text.replace(/\u00a0/g,' '),input,input);
  }
  assert.equal(checkAndAccept('Я знаю что попало в отчёт.').text.replace(/\u00a0/g,' '),'Я знаю, что попало в отчёт.');
  assert.equal(check('В течении следующей недели он придёт.').text.replace(/\u00a0/g,' '),'В течение следующей недели он придёт.');
});
test('a title is not silently punctuated and the editor can accept an end-of-text insertion', () => {
  const result=check('Проверка текста');
  assert.equal(result.text,'Проверка текста');
  const issue=result.issues.find(x=>x.before==='' && x.suggestions.includes('.'));
  assert.ok(issue && !issue.applied && issue.start===result.text.length && issue.end===issue.start);
  context.endResult=result;
  elements.source.value='Проверка текста';
  vm.runInContext('hasResult=true; updateResult(endResult.text,endResult.issues,endResult.highlights)',context);
  assert.ok(elements['issue-list'].innerHTML.includes('конец текста'));
  const index=vm.runInContext('currentIssues.findIndex(x=>x.before==="")',context);
  const button={dataset:{issueIndex:String(index),choiceIndex:'0'}};
  elements['issue-list'].fire('click',{target:{closest:selector=>selector==='button[data-issue-index]'?button:null}});
  assert.equal(shownResult(),'Проверка текста.');
});
test('an ambiguous word can be corrected after explicit editor selection', () => {
  const result=check('Крипис!'); context.ambiguousWordResult=result;
  elements.source.value='Крипис!';
  vm.runInContext('hasResult=true; updateResult(ambiguousWordResult.text,ambiguousWordResult.issues,ambiguousWordResult.highlights)',context);
  const index=vm.runInContext('currentIssues.findIndex(x=>x.before==="Крипис")',context);
  const choice=vm.runInContext('currentIssues['+index+'].suggestions.indexOf("Крепись")',context);
  const button={dataset:{issueIndex:String(index),choiceIndex:String(choice)}};
  elements['issue-list'].fire('click',{target:{closest:selector=>selector==='button[data-issue-index]'?button:null}});
  assert.equal(shownResult(),'Крепись!');
  assert.ok(vm.runInContext('currentIssues.some(x=>x.applied && x.after==="Крепись")',context));
});
test('history saves the source, corrected text, decisions and markers without duplicate saves', () => {
  vm.runInContext("commitHistory({format:'typograf-history',version:1,documents:[],dictionary:[]}); activeHistoryId=null; hasResult=true",context);
  elements.source.value='Прешол и упол на пал.';
  context.historyCheck=check(elements.source.value);
  vm.runInContext('updateResult(historyCheck.text,historyCheck.issues,historyCheck.highlights)',context);
  elements['save-history-button'].fire('click');
  elements['save-history-button'].fire('click');
  const db=JSON.parse(vm.runInContext('JSON.stringify(historyDatabase)',context));
  assert.equal(db.documents.length,1);
  assert.equal(db.documents[0].originalText,elements.source.value);
  assert.equal(db.documents[0].correctedText,'Пришёл и упал на\u00a0пол.');
  assert.equal(db.documents[0].corrections.length,4);
  assert.ok(db.documents[0].highlights.some(mark=>mark.kind==='issue-pin'));
  assert.equal(vm.runInContext('historyPersistent',context),true);
  assert.equal(elements['history-count'].textContent,1);
});
test('history JSON roundtrip merges documents, preserves existing copies and restores dictionary', () => {
  const exported=vm.runInContext('JSON.stringify(historyDatabase,null,2)',context);
  vm.runInContext("commitHistory({format:'typograf-history',version:1,documents:[],dictionary:['нейротипограф']})",context);
  context.historyImport=exported;
  assert.equal(vm.runInContext('importHistoryJSON(historyImport).added',context),1);
  assert.equal(vm.runInContext('importHistoryJSON(historyImport).added',context),0);
  assert.equal(vm.runInContext('historyDatabase.dictionary[0]',context),'нейротипограф');
  const changed=JSON.parse(exported); changed.documents[0].correctedText='Чужой вариант'; changed.documents[0].highlights=[];
  context.changedImport=JSON.stringify(changed);
  vm.runInContext('importHistoryJSON(changedImport)',context);
  assert.equal(vm.runInContext('historyDatabase.documents[0].correctedText',context),'Пришёл и упал на\u00a0пол.');
});
test('invalid, oversized and unsupported JSON imports are atomic and cannot inject HTML', () => {
  const before=vm.runInContext('JSON.stringify(historyDatabase)',context);
  for(const bad of ['{',JSON.stringify({format:'typograf-history',version:2,documents:[],dictionary:[]}),JSON.stringify({format:'typograf-history',version:1,documents:[{}],dictionary:[]})]) {
    context.invalidHistory=bad;
    assert.throws(()=>vm.runInContext('importHistoryJSON(invalidHistory)',context));
    assert.equal(vm.runInContext('JSON.stringify(historyDatabase)',context),before);
  }
  const db=JSON.parse(before);
  const injection=structuredClone(db.documents[0]); injection.id='injected'; injection.title='<img src=x onerror=alert(1)>'; injection.correctedText='<script>alert(1)</script>'; injection.highlights=[]; injection.corrections=[];
  context.htmlHistory=JSON.stringify({format:db.format,version:1,documents:[injection],dictionary:[]});
  vm.runInContext('importHistoryJSON(htmlHistory)',context);
  assert.ok(elements['history-list'].innerHTML.includes('&lt;img'));
  assert.ok(!elements['history-list'].innerHTML.includes('<img'));
  vm.runInContext("openHistoryDocument('injected')",context);
  assert.ok(elements['result-text'].innerHTML.includes('&lt;script&gt;'));
  const invalidMark=structuredClone(db); invalidMark.documents[0].highlights[0].kind='error" onclick="alert(1)';
  context.invalidHistory=JSON.stringify(invalidMark);
  assert.throws(()=>vm.runInContext('importHistoryJSON(invalidHistory)',context));
  assert.throws(()=>vm.runInContext("importHistoryJSON(' '.repeat(6000001))",context));
});
test('reopening a history record does not send text, reuse issue ids, or mutate the saved copy', () => {
  const id=vm.runInContext('historyDatabase.documents[0].id',context);
  context.openHistoryId=id;
  const original=vm.runInContext('JSON.stringify(historyDatabase.documents[0])',context);
  let requests=0; const previousFetch=context.fetch;
  context.fetch=async()=>{requests++;throw new Error('Unexpected request');};
  vm.runInContext('openHistoryDocument(openHistoryId)',context);
  assert.equal(requests,0);
  assert.equal(elements['online-toggle'].checked,false);
  assert.ok(!elements['result-screen'].classList.contains('hidden'));
  vm.runInContext("currentIssues[0].note='Unsaved change'",context);
  assert.equal(vm.runInContext('JSON.stringify(historyDatabase.documents[0])',context),original);
  const max=vm.runInContext('Math.max(...currentIssues.map(issue=>issue.id))',context);
  assert.ok(vm.runInContext("addIssue([], 'Орфография','a','b','test').id",context)>max);
  context.fetch=previousFetch;
});
test('history deletion requires confirmation; cancellation preserves records', () => {
  const id=vm.runInContext('historyDatabase.documents[0].id',context);
  const originalCount=vm.runInContext('historyDatabase.documents.length',context);
  elements['history-list'].fire('click',{target:{closest:selector=>selector.includes('data-delete-document')?{dataset:{deleteDocument:id}}:null}});
  assert.equal(vm.runInContext('historyDatabase.documents.length',context),originalCount);
  elements['cancel-leave'].fire('click');
  assert.equal(vm.runInContext('historyDatabase.documents.length',context),originalCount);
  elements['history-list'].fire('click',{target:{closest:selector=>selector.includes('data-delete-document')?{dataset:{deleteDocument:id}}:null}});
  elements['confirm-leave'].fire('click');
  assert.equal(vm.runInContext('historyDatabase.documents.length',context),originalCount-1);
});
test('personal dictionary persists, affects spelling and rejects phrases and markup', () => {
  elements['dictionary-word'].value='Нейротипограф';
  elements['dictionary-form'].fire('submit',{preventDefault(){}});
  assert.equal(check('Нейротипограф.').issues.some(issue=>issue.category==='Орфография'),false);
  elements['dictionary-word'].value='подошол';
  elements['dictionary-form'].fire('submit',{preventDefault(){}});
  assert.equal(check('Он подошол.').text,'Он подошол.');
  const original=vm.runInContext('JSON.stringify(historyDatabase.dictionary)',context);
  for(const invalid of ['два слова','<script>','']) {
    elements['dictionary-word'].value=invalid;
    elements['dictionary-form'].fire('submit',{preventDefault(){}});
    assert.equal(vm.runInContext('JSON.stringify(historyDatabase.dictionary)',context),original);
  }
  vm.runInContext('loadHistory()',context);
  assert.equal(check('Нейротипограф.').issues.some(issue=>issue.category==='Орфография'),false);
});
test('quota failure retains an exportable in-memory copy and warns instead of claiming persistence', () => {
  const setItem=mockWindow.localStorage.setItem;
  mockWindow.localStorage.setItem=()=>{throw new Error('QuotaExceededError');};
  vm.runInContext("commitHistory({...historyDatabase,dictionary:[...historyDatabase.dictionary,'экспортируемоеимя']})",context);
  assert.equal(vm.runInContext('historyPersistent',context),false);
  assert.ok(!elements['history-storage-status'].classList.contains('hidden'));
  assert.ok(vm.runInContext('JSON.stringify(historyDatabase)',context).includes('экспортируемоеимя'));
  mockWindow.localStorage.setItem=setItem;
  vm.runInContext('commitHistory(historyDatabase)',context);
});
test('corrupt stored history is not overwritten by subsequent saves', () => {
  const key=vm.runInContext('historyStorageKey',context);
  const original=storedHistory.get(key);
  storedHistory.set(key,'{broken');
  vm.runInContext('loadHistory(); commitHistory(historyDatabase)',context);
  assert.equal(storedHistory.get(key),'{broken');
  assert.equal(vm.runInContext('historyReadError',context),true);
  storedHistory.set(key,original);
  vm.runInContext('historyReadError=false; loadHistory()',context);
});

test('schema example imports and capacity, offsets and id limits reject changes atomically', () => {
  context.exampleHistory=fs.readFileSync('../../examples/history-example.json','utf8');
  assert.equal(vm.runInContext('validateHistory(JSON.parse(exampleHistory)).documents[0].correctedText',context),'Он подошёл.');
  const example=JSON.parse(context.exampleHistory);
  const original=vm.runInContext('JSON.stringify(historyDatabase)',context);
  for(const change of [
    db=>{db.documents=Array.from({length:101},(_,i)=>({...db.documents[0],id:'limit-'+i}));},
    db=>{db.documents[0].highlights[0].end=1000;},
    db=>{db.documents[0].corrections[0].id=Number.MAX_SAFE_INTEGER;},
    db=>{db.documents[0].originalText='я'.repeat(200001);}
  ]) {
    const invalid=structuredClone(example); change(invalid); context.invalidHistory=JSON.stringify(invalid);
    assert.throws(()=>vm.runInContext('importHistoryJSON(invalidHistory)',context));
    assert.equal(vm.runInContext('JSON.stringify(historyDatabase)',context),original);
  }
});

let downloadedBlob, downloadedLink, clickedDownload=false;
context.Blob=Blob;
context.URL={createObjectURL:blob=>{downloadedBlob=blob;return 'blob:history-test';},revokeObjectURL(){}};
const createElement=document.createElement;
document.createElement=id=>{const item=new Element(id);if(id==='a'){downloadedLink=item;item.click=()=>{clickedDownload=true;};}return item;};
elements['export-history'].fire('click');
assert.equal(clickedDownload,true);
assert.match(downloadedLink.download,/^typograf-history-\d{4}-\d{2}-\d{2}\.json$/);
const downloaded=JSON.parse(await downloadedBlob.text());
assert.equal(downloaded.format,'typograf-history');
context.downloadedText=JSON.stringify(downloaded);
assert.equal(vm.runInContext('importHistoryJSON(downloadedText).added',context),0);
document.createElement=createElement;
console.log('PASS export button downloads valid reimportable JSON with the correct filename');

elements['history-file'].files=[{size:10,text:async()=>'{bad json'}];
await elements['history-file'].fire('change');
assert.equal(elements['import-history'].disabled,false);
assert.equal(elements['history-file'].value,'');
assert.match(elements['toast-message'].textContent,/JSON/);
elements['history-file'].files=[{size:9*1024*1024,text:async()=>{throw new Error('Must not read an oversized file');}}];
await elements['history-file'].fire('change');
assert.match(elements['toast-message'].textContent,/8 МБ/);
console.log('PASS import file control handles invalid and oversized files and resets for retry');

if (process.env.LIVE_SPELL === '1') {
  context.fetch=fetch;
  const input='В статье машна и приложнеие.';
  const matches=await vm.runInContext('getOnlineMatches('+JSON.stringify(input)+')',context);
  context.liveMatches=matches;
  const result=vm.runInContext('checkText('+JSON.stringify(input)+',{},liveMatches)',context);
  assert.ok(result.text.includes('машна'));
  assert.ok(result.text.includes('приложнеие'));
  assert.ok(result.issues.some(item=>item.before==='приложнеие' && !item.applied && item.suggestions.includes('приложение')));
  assert.ok(result.issues.some(item=>item.before==='машна' && item.suggestions.includes('машина')));
  console.log('PASS live Yandex Speller response:',result.text);
  const sentence='Сегодня я пошёл в магазин но ничего не купил.';
  const grammar=await vm.runInContext('getGrammarMatches('+JSON.stringify(sentence)+')',context);
  context.liveGrammar=grammar;
  const corrected=vm.runInContext('applyGrammarMatches({text:'+JSON.stringify(sentence)+',issues:[],highlights:[]},liveGrammar)',context);
  assert.equal(corrected.text,sentence);
  assert.ok(corrected.issues.some(item=>item.category==='Пунктуация' && !item.applied && item.before.includes('но')));
  console.log('PASS live LanguageTool comma correction requires editor selection');
  const contextSentence='Когда загрузка закончится появится результат.';
  const contextMatches=await vm.runInContext('getGrammarMatches('+JSON.stringify(contextSentence)+')',context);
  context.liveContextMatches=contextMatches;
  const reviewed=vm.runInContext('applyGrammarMatches({text:'+JSON.stringify(contextSentence)+',issues:[],highlights:[]},liveContextMatches)',context);
  assert.equal(reviewed.text,contextSentence);
  assert.ok(reviewed.issues.some(item=>item.category==='Грамматика' && item.reviewOnly));
  console.log('PASS live LanguageTool grammar response is review-only');
}
