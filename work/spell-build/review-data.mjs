// Only explicitly approved, named reviews may become editorial examples.
export function buildReviewedGold(corpus, reviews, reviewer) {
  if(typeof reviewer!=='string'||!reviewer.trim()||reviewer.trim().length>80)throw new Error('Укажите имя или подпись редактора.');
  const cases=[];
  for(const fragment of corpus.fragments) {
    const review=reviews[fragment.id];
    if(!review || review.approved!==true)continue;
    if(typeof review.expected!=='string'||!review.expected.trim()||review.expected.length>20000)throw new Error('Проверьте эталон: '+fragment.id);
    const expected=review.expected.trim(), m=fragment.mutation;
    if(fragment.text.slice(m.start,m.start+m.before.length)!==m.before)throw new Error('Повреждён исходный набор.');
    const input=fragment.text.slice(0,m.start)+m.after+fragment.text.slice(m.start+m.before.length);
    const shared={expected,reviewedBy:reviewer.trim(),source:fragment.source};
    cases.push({id:fragment.id+'-source',input:fragment.text,category:expected===fragment.text?'clean':'mixed',...shared});
    cases.push({id:fragment.id+'-mutated',input,category:expected===fragment.text?m.category:'mixed',...shared});
  }
  if(!cases.length)throw new Error('Нет примеров, отмеченных как проверенные.');
  return {schemaVersion:1,description:'Примеры, явно подтверждённые автором указанной редакторской подписи. Сам файл не удостоверяет личность проверяющего.',cases};
}
