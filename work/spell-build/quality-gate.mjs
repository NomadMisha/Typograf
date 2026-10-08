import fs from 'node:fs';
import {summary as regression} from './evaluate-corpus.mjs';
import {evaluateGold} from './evaluate-gold.mjs';

const gold = evaluateGold();
const regressionPass = regression.cleanUnchanged === regression.corpusSize &&
  regression.reviewUnchanged === regression.reviewSize && regression.injectedSilentMisses === 0;
const pilotEligible = regressionPass && gold.cases >= 100 &&
  gold.falseChanges === 0 && gold.silentMisses.length === 0;
const status = {
  stage:pilotEligible ? 'ready_for_editorial_pilot' : 'prototype_requires_editorial_validation',
  pilotEligible,
  regression:{publishedUnchanged:regression.cleanUnchanged + regression.reviewUnchanged,
    publishedTotal:regression.corpusSize + regression.reviewSize,
    seededDetected:regression.injectedDetectedOrRestored,
    seededTotal:regression.injectedCases,
    silentMisses:regression.injectedSilentMisses},
  editorialGold:gold,
  criteria:['Ни одной ложной автоматической правки в регрессионных фрагментах.',
    'Все намеренно внесённые ошибки исправлены или отмечены.',
    'Не менее 100 проверенных редактором черновиков, без ложных правок и незамеченных ошибок.'],
  note:'Прохождение этого ограниченного набора не гарантирует 100% правильность любого нового текста.'
};
fs.writeFileSync('../../outputs/typograf-prototype/QUALITY_STATUS.json', JSON.stringify(status, null, 2) + '\n');
console.log(JSON.stringify(status, null, 2));
if (process.argv.includes('--pilot') && !pilotEligible) process.exitCode = 1;
