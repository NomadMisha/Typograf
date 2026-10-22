import fs from 'node:fs';
import {summary as regression} from './evaluate-corpus.mjs';
import {evaluateGold} from './evaluate-gold.mjs';
import {evaluateTechnical,findTechnicalRegressions} from './evaluate-technical.mjs';

const gold = evaluateGold();
const technical = evaluateTechnical({html:process.env.TYPOGRAF_HTML});
const baseline = JSON.parse(fs.readFileSync(new URL('../../outputs/typograf-prototype/TECHNICAL_BASELINE.json',import.meta.url),'utf8'));
if (technical.corpusDigest !== baseline.corpusDigest) throw new Error('Изменён зафиксированный корпус. Нужны отдельный новый набор и исходный отчёт.');
const accepted = JSON.parse(fs.readFileSync(new URL('../../outputs/typograf-prototype/TECHNICAL_CURRENT.json',import.meta.url),'utf8'));
if (technical.corpusDigest !== accepted.corpusDigest) throw new Error('Контрольный снимок относится к другому корпусу.');
const regressed = findTechnicalRegressions(technical.cases,[baseline,accepted]);
const technicalPass = technical.summary.sourceControlsUnchanged === technical.summary.fragments && regressed.length === 0;
const regressionPass = regression.cleanUnchanged === regression.corpusSize &&
  regression.reviewUnchanged === regression.reviewSize && regression.injectedSilentMisses === 0;
const pilotEligible = regressionPass && technicalPass && gold.cases >= 100 &&
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
  technicalDiagnostics:{...technical.summary,humanReviewed:technical.humanReviewed,regressed,passed:technicalPass},
  criteria:['Ни одной ложной автоматической правки в регрессионных фрагментах.',
    'Все намеренно внесённые ошибки исправлены или отмечены.',
    'Ни одной новой автоматической правки публичных контролей и ни одного ухудшения обнаружения по сравнению с зафиксированным состоянием.',
    'Не менее 100 проверенных редактором примеров, без ложных правок и незамеченных ошибок.'],
  note:'Прохождение этого ограниченного набора не гарантирует 100% правильность любого нового текста.'
};
fs.writeFileSync('../../outputs/typograf-prototype/QUALITY_STATUS.json', JSON.stringify(status, null, 2) + '\n');
console.log(JSON.stringify(status, null, 2));
if (process.argv.includes('--pilot') && !pilotEligible) process.exitCode = 1;
if (!regressionPass || !technicalPass) process.exitCode = 1;
