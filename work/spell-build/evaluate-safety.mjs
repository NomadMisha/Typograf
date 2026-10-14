import fs from 'node:fs';
import {createHash} from 'node:crypto';
import { loadChecker } from './load-checker.mjs';

const args = process.argv.slice(2);
const option = name => {const i=args.indexOf(name);return i < 0 ? undefined : args[i+1];};
const dataset = JSON.parse(fs.readFileSync(option('--dataset') || new URL('safety-cases.json',import.meta.url), 'utf8'));
const check = loadChecker(option('--html'));
const normalized = text => text.replace(/\u00a0/g,' ').replace(/\r\n?/g,'\n');
const matchesTarget = (issue,target) => issue.category === target.category && normalized(issue.before).toLowerCase() === normalized(target.before).toLowerCase();
let truePositive=0, falsePositive=0, falseNegative=0;
const cases=dataset.cases.map(item=>{
  const result=check(item.input,item.remoteMatches || []);
  const relevant=result.issues.filter(issue=>issue.category !== 'Висячие предлоги');
  const matched=item.targets.filter(target=>relevant.some(issue=>matchesTarget(issue,target)));
  const unmatched=relevant.filter(issue=>!item.targets.some(target=>matchesTarget(issue,target)));
  const wrongAutomatic=relevant.filter(issue=>issue.applied && item.targets.some(target=>matchesTarget(issue,target) &&
    typeof target.after==='string' && normalized(issue.after)!==normalized(target.after)));
  truePositive+=matched.length;falseNegative+=item.targets.length-matched.length;falsePositive+=unmatched.length;
  return {id:item.id,input:item.input,reference:item.reference,actual:normalized(result.text),
    exactReference:normalized(result.text)===normalized(item.reference),
    clean:item.targets.length===0,changed:normalized(result.text)!==normalized(item.input),
    detectedTargets:matched.length,totalTargets:item.targets.length,
    missedTargets:item.targets.filter(target=>!matched.includes(target)),
    wrongAutomatic:wrongAutomatic.map(({category,before,after})=>({category,before,after})),
    unexpectedNotices:unmatched.map(({category,before,after,applied})=>({category,before,after,applied})),
    issues:relevant.map(({category,before,after,applied})=>({category,before,after,applied}))};
});
const report={dataset:dataset.purpose,datasetDigest:createHash('sha256').update(JSON.stringify(dataset)).digest('hex'),provenance:dataset.provenance,humanReviewed:!!dataset.reviewedBy,
  metrics:{cases:cases.length,cleanCases:cases.filter(x=>x.clean).length,
    cleanTextChanges:cases.filter(x=>x.clean&&x.changed).length,
    cleanCasesWithNotices:cases.filter(x=>x.clean&&x.unexpectedNotices.length).length,
    exactReference:cases.filter(x=>x.exactReference).length,
    wrongAutomaticOnAnnotatedTargets:cases.reduce((n,x)=>n+x.wrongAutomatic.length,0),
    annotatedTargets:truePositive+falseNegative,detectedTargets:truePositive,missedTargets:falseNegative,
    unexpectedNotices:falsePositive,
    annotatedDetectionPrecision:truePositive+falsePositive?truePositive/(truePositive+falsePositive):null,
    annotatedDetectionRecall:truePositive+falseNegative?truePositive/(truePositive+falseNegative):null},cases};
if(option('--output'))fs.writeFileSync(option('--output'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,cases:undefined},null,2));
if(args.includes('--require-clean')&&report.metrics.cleanTextChanges>0)process.exitCode=1;
