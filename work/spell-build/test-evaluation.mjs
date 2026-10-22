import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {evaluateGold} from './evaluate-gold.mjs';
import {matchesTechnicalTarget,findTechnicalRegressions} from './evaluate-technical.mjs';
import {buildReviewedGold} from './review-data.mjs';

const folder=fs.mkdtempSync(path.join(os.tmpdir(),'typograf-evaluation-'));
const file=path.join(folder,'fixture.json');
try {
  fs.writeFileSync(file,JSON.stringify({schemaVersion:1,cases:[{
    id:'unrelated-warning',input:'Возможно он вернулся открыв дверь.',
    expected:'Возможно, он вернулся, открыв дверь.',category:'punctuation',
    reviewedBy:'automated-test-fixture-not-editorial-gold',
    expectedIssues:[{category:'Пунктуация',before:'вернулся открыв'}]
  }]}));
  const result=evaluateGold(file);
  assert.equal(result.detected,0);
  assert.deepEqual(result.silentMisses,['unrelated-warning']);
  console.log('PASS unrelated introductory-word warning does not count as detecting a different missing comma');
  fs.writeFileSync(file,JSON.stringify({schemaVersion:1,cases:[{
    id:'manual-correct-choice',input:'Он сказал что вернётся.',
    expected:'Он сказал, что вернётся.',category:'punctuation',
    reviewedBy:'automated-test-fixture-not-editorial-gold'
  }]}));
  const manual=evaluateGold(file);
  assert.equal(manual.exact,0);
  assert.equal(manual.detected,1);
  assert.deepEqual(manual.silentMisses,[]);
  console.log('PASS an exact manual correction counts as detected without claiming automatic restoration');
} finally {
  fs.rmSync(folder,{recursive:true,force:true});
}

assert.equal(matchesTechnicalTarget({before:'первый второй третий',start:0,suggestions:['первый, второй третий']},{before:',',after:'',start:13},20),false);
assert.equal(matchesTechnicalTarget({before:'первый второй',start:0,suggestions:['первый, второй']},{before:',',after:'',start:6},13),true);
console.log('PASS a comma offered at another position never counts for the annotated insertion');

const corpus=JSON.parse(fs.readFileSync(new URL('technical-corpus.json',import.meta.url),'utf8'));
assert.throws(()=>buildReviewedGold(corpus,{},''));
assert.throws(()=>buildReviewedGold(corpus,{},'Test reviewer'));
const fragment=corpus.fragments[0];
assert.throws(()=>buildReviewedGold(corpus,{[fragment.id]:{approved:true,expected:''}},'Test reviewer'));
const reviewed=buildReviewedGold(corpus,{[fragment.id]:{approved:true,expected:fragment.text}},'Test reviewer');
assert.equal(reviewed.cases.length,2);
assert.ok(reviewed.cases.every(c=>c.reviewedBy==='Test reviewer'));
assert.equal(reviewed.cases[0].category,'clean');
assert.notEqual(reviewed.cases[0].input,reviewed.cases[1].input);
assert.equal(corpus.reviewedBy,null);
console.log('PASS review export requires a signature and explicit per-fragment approval, without altering the draft corpus');

const oldReference={cases:[{id:'improved-case',detected:false,offeredCorrectChoice:false}]};
const acceptedReference={cases:[{id:'improved-case',detected:true,offeredCorrectChoice:true}]};
assert.deepEqual(findTechnicalRegressions([{id:'improved-case',detected:false,offeredCorrectChoice:false}],[oldReference,acceptedReference]),['improved-case']);
assert.deepEqual(findTechnicalRegressions([{id:'improved-case',detected:true,offeredCorrectChoice:false}],[oldReference,acceptedReference]),['improved-case']);
assert.deepEqual(findTechnicalRegressions(acceptedReference.cases,[oldReference,acceptedReference]),[]);
console.log('PASS quality gate retains accepted improvements and catches loss of a correct suggestion');
