import fs from 'node:fs';
import assert from 'node:assert/strict';
import {loadChecker} from './load-checker.mjs';

// Reproducible local diagnostic: no external services and no automatic acceptance.
const tortureText = `Вообщем, вчера редактор Таня подошол к автору и сказала что в статье много ошибок.

«Мы раскажем как работает наш веб-продукт» — написал автор. Но редактор ответила что это не так: орфаграфия храмает, пунктуацыя тоже а некоторые запетые вообще потерялись.

В течении недели команда проверяла тексты не покладая рук. Лучше поздно чем никогда, подумал автор и ушол домой. Сьюзен Мейер и Бри Ван де Камп как ни в чём не бывало обсуждали статью на улице Вистерия Лейн.

Редактор открыл файл проверил его и отправил автору. Алкоголик пропил глобус упал и улыбался.

Код не трогать: \`const t = "ошибычный";\` Ссылка: https://example.com/ошибычный`;

const result=loadChecker(process.env.TYPOGRAF_HTML)(tortureText);
const plainText=result.text.replace(/\u00a0/g,' ');
const pending=result.issues.filter(i=>!i.applied);
for(const phrase of ['В общем,','Таня подошла к автору','орфография','запятые','В течение недели','ушёл домой']) {
  assert.ok(plainText.includes(phrase),'Missing automatic correction: '+phrase);
}
for(const choice of ['сказала, что','ответила, что','расскажем, как','открыл файл, проверил','Лучше поздно, чем','хромает','пунктуация']) {
  assert.ok(pending.some(i=>i.suggestions.some(s=>s.replace(/\u00a0/g,' ').includes(choice))),'Missing manual suggestion: '+choice);
}
assert.ok(plainText.includes('сказала что'),'Context punctuation must await editor selection');
assert.ok(plainText.includes('Алкоголик пропил глобус упал и улыбался.'),'Ambiguous wording must stay unchanged');
assert.ok(plainText.includes('`const t = "ошибычный";`'),'Code must stay protected');
assert.ok(plainText.includes('https://example.com/ошибычный'),'URL must stay protected');
assert.ok(pending.some(i=>i.before==='пропил глобус упал'),'Ambiguous boundary must remain for review');
const report={mode:'local dictionary and rules; no online requests',input:tortureText,output:result.text,
  applied:result.issues.filter(i=>i.applied).map(({category,before,after})=>({category,before,after})),
  forEditor:pending.map(({category,before,after,suggestions})=>({category,before,after,suggestions}))};
if(process.argv.includes('--report')) {
  const body='# Глубокая проверка на намеренно испорченном тексте\n\nОбновлено: 15 октября 2026. Локальный словарь и правила, без внешних запросов. Синтетический диагностический пример, не независимый редакторский эталон.\n\n## Исходный текст\n\n```text\n'+tortureText+'\n```\n\n## Автоматический результат до выбора редактора\n\n```text\n'+result.text+'\n```\n\n## Ожидают выбора\n\n'+pending.map(i=>'- '+JSON.stringify(i.before)+' → '+i.suggestions.map(s=>JSON.stringify(s)).join(' / ')).join('\n')+'\n\nПунктуационные и словарные варианты не применялись автоматически. Код и URL сохранились. Проверки ожидаемых исправлений и предложений пройдены; произвольные сложные статьи этот один пример не покрывает. Общие метрики и ограничения — в [отчёте качества](BROWSER_QUALITY_REPORT.md).\n';
  fs.writeFileSync(new URL('../../outputs/typograf-prototype/DEEP_QA_REPORT.md',import.meta.url),body);
}
console.log(JSON.stringify(report,null,2));
console.log('PASS deep local diagnostic: automatic known corrections, manual contextual choices, protected code and URL');
