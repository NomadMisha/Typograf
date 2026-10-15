import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {loadChecker} from './load-checker.mjs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const args=process.argv.slice(2);
const option=name=>{const i=args.indexOf(name);return i<0?undefined:args[i+1];};
const file=new URL('technical-corpus.json',import.meta.url);
const raw=fs.readFileSync(file);
const corpus=JSON.parse(raw);
if(corpus.schemaVersion!==1 || corpus.fragments.length!==40)throw new Error('Invalid technical corpus.');
const normalize=text=>text.replace(/\u00a0/g,' ').replace(/\r\n?/g,'\n');
const category={spelling:'Орфография',punctuation:'Пунктуация',typography:'Типографика'};
export function matchesTechnicalTarget(issue, mutation) {
  const m=mutation;
  if(m.after)return normalize(issue.before).toLowerCase()===m.after.toLowerCase();
  if(!Number.isInteger(issue.start) || !Array.isArray(issue.suggestions))return false;
  return issue.suggestions.some(choice=>{
    const before=normalize(issue.before),after=normalize(choice);
    let prefix=0,suffix=0;
    while(prefix<Math.min(before.length,after.length)&&before[prefix]===after[prefix])prefix++;
    while(suffix<Math.min(before.length,after.length)-prefix&&before[before.length-1-suffix]===after[after.length-1-suffix])suffix++;
    return issue.start+prefix===m.start && issue.start+before.length-suffix===m.start && after.slice(prefix,after.length-suffix)===m.before;
  });
}
export function evaluateTechnical({html,split}={}) {
const check=loadChecker(html);
const selected=corpus.fragments.filter(f=>!split||f.split===split);
const cases=[];
for(const fragment of selected) {
  const {text,mutation:m}=fragment;
  if(text.slice(m.start,m.start+m.before.length)!==m.before)throw new Error('Invalid mutation '+fragment.id);
  const control=check(text);
  const input=text.slice(0,m.start)+m.after+text.slice(m.start+m.before.length);
  const result=check(input);
  const restored=normalize(result.text)===text;
  const targets=result.issues.filter(issue=>issue.category===category[m.category] ||
    (m.category==='typography' && issue.category==='Пунктуация'));
  // Only the annotated fragment counts. Other warnings never receive credit.
  const detected=restored || targets.some(issue=>matchesTechnicalTarget(issue,m));
  const offeredCorrectChoice=restored || result.issues.some(issue=>!issue.applied && Number.isInteger(issue.start) &&
    issue.suggestions.some(choice=>normalize(result.text.slice(0,issue.start)+choice+result.text.slice(issue.end))===text));
  cases.push({id:fragment.id,split:fragment.split,category:m.category,
    controlUnchanged:normalize(control.text)===text,
    controlNotices:control.issues.filter(i=>!i.applied).length,
    restored,detected,offeredCorrectChoice,
    inputHash:createHash('sha256').update(input).digest('hex')});
}
const report={corpusDigest:createHash('sha256').update(raw).digest('hex'),
  humanReviewed:!!corpus.reviewedBy,provenance:corpus.provenance,baselineCommit:corpus.baselineCommit,
  summary:{fragments:cases.length,sourceControlsUnchanged:cases.filter(c=>c.controlUnchanged).length,
    sourceControlsWithNotices:cases.filter(c=>c.controlNotices).length,
    introducedErrorsDetected:cases.filter(c=>c.detected).length,
    introducedErrorsRestoredAutomatically:cases.filter(c=>c.restored).length,
    introducedErrorsWithCorrectOption:cases.filter(c=>c.offeredCorrectChoice).length,
    byCategory:Object.fromEntries(Object.keys(category).map(k=>{const group=cases.filter(c=>c.category===k);return[k,{cases:group.length,detected:group.filter(c=>c.detected).length,restored:group.filter(c=>c.restored).length,offered:group.filter(c=>c.offeredCorrectChoice).length}];}))},cases};
return report;
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
const report=evaluateTechnical({html:option('--html'),split:option('--split')});
if(option('--output'))fs.writeFileSync(option('--output'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,cases:args.includes('--details')?report.cases:undefined},null,2));
if(args.includes('--require-controls') && report.cases.some(c=>!c.controlUnchanged))process.exitCode=1;
}
