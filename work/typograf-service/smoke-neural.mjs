// Explicit live diagnostic. Uses only these fixed examples, never browser history.
import fs from 'node:fs';
import {createLocalNeural} from './local-neural.mjs';
import {loadChecker} from '../spell-build/load-checker.mjs';
const ai=createLocalNeural({model:process.env.TYPOGRAF_AI_MODEL || 'qwen3:4b',cpuOnly:process.env.TYPOGRAF_AI_CPU === '1'});
if (!(await ai.status()).available) throw new Error('Сначала запустите start-neural.command и скачайте модель.');
const check=loadChecker();
const samples=[
  {input:'Подошёл увидел как она присела на лавочку.',reference:'Подошёл, увидел, как она присела на лавочку.'},
  {input:'Алкоголик пропил глобус упал и улыбался.',reference:'Алкоголик пропил глобус, упал и улыбался.'},
  {input:'Прешол и упол на пал.',reference:'Пришёл и упал на пол.'},
  {input:'Где эта тварь которая засрала мне газон?',reference:'Где эта тварь, которая засрала мне газон?'},
  {input:'Крепись это скора закончиться.',reference:'Крепись, это скоро закончится.'},
  {input:'Делай что угодно. Он сказал как есть.',reference:'Делай что угодно. Он сказал как есть.'},
  {input:'В файле main.js сохранён API-токен. Он не изменился. Цена — 100 рублей.',reference:'В файле main.js сохранён API-токен. Он не изменился. Цена — 100 рублей.'}
];
const cases=[];
const normalize=text=>text.replace(/\u00a0/g,' ');
for (const sample of samples) {
  const prepared=check(sample.input).text;
  const started=Date.now();
  try {
    const result=await ai.check(prepared);
    let hypothetical=prepared;
    for(const edit of [...result.edits].sort((a,b)=>b.start-a.start)) hypothetical=hypothetical.slice(0,edit.start)+edit.after+hypothetical.slice(edit.end);
    cases.push({...sample,prepared,edits:result.edits,rejected:result.rejected,
      hypotheticalAfterAcceptingAll:hypothetical,matchesReference:normalize(hypothetical)===sample.reference,cpuMode:result.cpuMode,milliseconds:Date.now()-started});
    console.log(JSON.stringify({case:cases.length,proposals:result.edits.length,matchesReference:cases.at(-1).matchesReference,milliseconds:Date.now()-started}));
  } catch(error) {
    cases.push({...sample,prepared,error:error.message,milliseconds:Date.now()-started});
    console.log(JSON.stringify({case:cases.length,error:error.message}));
  }
}
const report={model:ai.model,createdAt:new Date().toISOString(),local:true,
  note:'Small diagnostic from user examples and synthetic clean controls. References authored by AI and not reviewed by an editor. Hypothetical acceptance is calculated only in this test; the application requires manual selection. This is not a general accuracy estimate.',cases};
fs.writeFileSync(new URL('../../outputs/typograf-prototype/NEURAL_SMOKE.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log('Live neural diagnostic saved. '+cases.filter(c=>c.matchesReference).length+'/'+cases.length+' exact reference matches.');
if(cases.some(c=>c.error))process.exitCode=1;
