import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {evaluateGold} from './evaluate-gold.mjs';

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
} finally {
  fs.rmSync(folder,{recursive:true,force:true});
}
