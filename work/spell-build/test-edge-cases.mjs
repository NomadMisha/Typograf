import fs from 'node:fs';
import {performance} from 'node:perf_hooks';
import {loadChecker} from './load-checker.mjs';
const check=loadChecker(process.env.TYPOGRAF_HTML || new URL('../../docs/index.html',import.meta.url));
const cases=[
 ['sentence-space','Готово.Начинаем.Ёж спит.','Готово. Начинаем. Ёж спит.'],
 ['abbreviations','См.Рис.1, проф.Иванов, А.С.Пушкин.','См.Рис.1, проф.Иванов, А.С.Пушкин.'],
 ['abbreviation-napr','Напр.Москва, абз.Первый.','Напр.Москва, абз.Первый.'],
 ['decimal-number','Сумма 12.75, версия 2.5.1.','Сумма 12.75, версия 2.5.1.'],
 ['word-number','5 новых сообщений, 1,5 литра.','5\u00a0новых сообщений, 1,5\u00a0литра.'],
 ['existing-nbsp','5\u00a0новых сообщений.','5\u00a0новых сообщений.'],
 ['multiline-number','Строка 5\nновых сообщений.','Строка 5\nновых сообщений.'],
 ['namespace','Math.PI и System.Text.','Math.PI и System.Text.'],
 ['file-names','app.test.js, index.HTML, .env.local.','app.test.js, index.HTML, .env.local.'],
 ['email','user.name+tag@example.org.','user.name+tag@example.org.'],
 ['inline-code','Код: `подошол  5 слов Math.PI`.','Код: `подошол  5 слов Math.PI`.'],
 ['fenced-code','```js\nподошол  5 слов Math.PI\n```','```js\nподошол  5 слов Math.PI\n```'],
 ['html-code','<pre>подошол  5 слов Math.PI</pre>','<pre>подошол  5 слов Math.PI</pre>'],
 ['json-single','Данные: {"текст":"подошол  5 слов"}.','Данные: {"текст":"подошол  5 слов"}.'],
 ['url-normal','https://example.org/подошол?count=5','https://example.org/подошол?count=5'],
 ['url-parentheses','https://example.org/страница_(подошол)','https://example.org/страница_(подошол)'],
 ['markdown-url','[Пример](https://example.org/(подошол))','[Пример](https://example.org/(подошол))'],
 ['xss-tag','<img src=x onerror=alert(1)>','<img src=x onerror=alert(1)>'],
 ['unicode-marker','Текст \uE0000\uE001 `подошол` готов.','Текст \uE0000\uE001 `подошол` готов.'],
 ['emoji','🙂 Готово. 🚀 Ещё 3 задачи.','🙂 Готово. 🚀 Ещё 3\u00a0задачи.'],
 ['quotes','Он написал "новый текст".','Он написал «новый текст».'],
 ['speech-missing','«Я приду» сказал он.','«Я приду» сказал он.'],
 ['speech-correct','«Я приду», — сказал он.','«Я приду», — сказал он.'],
 ['speech-question','«Ты придёшь?» спросил он.','«Ты придёшь?» спросил он.'],
 ['fixed-expression','Он сказал как есть. Потом ушёл.','Он сказал как есть. Потом ушёл.'],
 ['title','Название статьи','Название статьи'],
 ['empty','',''],
 ['whitespace',' \n\t ',''],
 ['crlf','Первый.\r\nВторой.','Первый.\nВторой.'],
 ['typos','Он подошол и упол на пал.','Он подошёл и упал на\u00a0пол.']
];
const rows=cases.map(([id,input,expected])=>{
 const result=check(input),second=check(result.text);
 const positions=result.issues.filter(i=>Number.isInteger(i.start)&&!i.applied).every(i=>i.start>=0&&i.end>=i.start&&i.end<=result.text.length&&result.text.slice(i.start,i.end)===i.before);
 const manual=result.issues.filter(i=>i.note.startsWith('Возможна прямая речь:'));
 const speechOk=id==='speech-correct'?manual.length===0:id.startsWith('speech-')?manual.length===1&&manual.every(i=>!i.applied&&i.suggestions.length===0):true;
 return {id,input,expected,actual:result.text,pass:result.text===expected&&positions&&speechOk,idempotent:second.text===result.text,positions,speechOk};
});
const large='Готово.Начинаем. Ещё 5 новых сообщений. Код `Math.PI; подошол`.\n'.repeat(1600);
const before=performance.now(),big=check(large),elapsedMs=performance.now()-before;
const report={provenance:'Synthetic QA fixtures prepared by AI, not an editorial gold set',cases:rows.length,passed:rows.filter(r=>r.pass).length,failed:rows.filter(r=>!r.pass||!r.idempotent),idempotent:rows.filter(r=>r.idempotent).length,longText:{characters:large.length,elapsedMs:Math.round(elapsedMs),issues:big.issues.length,protectedCodePreserved:big.text.split('`Math.PI; подошол`').length===1601}};
if(process.argv.includes('--report')) fs.writeFileSync(new URL('../../outputs/typograf-prototype/EDGE_QA_REPORT.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));

if(report.passed!==report.cases || report.idempotent!==report.cases || !report.longText.protectedCodePreserved) process.exitCode=1;
