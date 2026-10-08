import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {check} from './evaluate-corpus.mjs';

const validCategories = new Set(['spelling','punctuation','typography','grammar','mixed','clean']);
const normalized = text => text.replace(/\u00a0/g, ' ').replace(/\r\n?/g, '\n').trim();

export function evaluateGold(file = 'gold-cases.json') {
  const dataset = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (dataset.schemaVersion !== 1 || !Array.isArray(dataset.cases)) throw new Error('Неверный формат эталонного набора.');
  const ids = new Set();
  const cases = dataset.cases.map(item => {
    if (!item || typeof item.id !== 'string' || !item.id || ids.has(item.id) ||
        typeof item.input !== 'string' || typeof item.expected !== 'string' ||
        !item.input.trim() || !item.expected.trim() || !validCategories.has(item.category) ||
        typeof item.reviewedBy !== 'string' || !item.reviewedBy.trim()) throw new Error('Некорректный эталонный случай: ' + (item?.id || '?'));
    ids.add(item.id);
    const result = check(item.input);
    const expected = normalized(item.expected);
    const original = normalized(item.input);
    const actual = normalized(result.text);
    const pending = result.issues.filter(issue => !issue.applied).length;
    const clean = original === expected;
    return {id:item.id, category:item.category, clean, exact:actual === expected,
      detected:actual === expected || pending > 0,
      falseChange:clean && actual !== expected,
      pending, actual};
  });
  const byCategory = Object.fromEntries([...validCategories].map(category => {
    const group = cases.filter(item => item.category === category);
    return [category,{cases:group.length,exact:group.filter(item => item.exact).length,
      detected:group.filter(item => item.detected).length,falseChanges:group.filter(item => item.falseChange).length}];
  }));
  return {cases:cases.length, exact:cases.filter(item => item.exact).length,
    detected:cases.filter(item => item.detected).length,
    falseChanges:cases.filter(item => item.falseChange).length,
    silentMisses:cases.filter(item => !item.clean && !item.detected).map(item => item.id),
    byCategory};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(JSON.stringify(evaluateGold(), null, 2));
