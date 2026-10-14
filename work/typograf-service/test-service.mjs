import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createTypografServer} from './server.mjs';

const calls = [];
const server = createTypografServer({
  spellerUrl:'http://127.0.0.1:9101/speller',
  languageToolUrl:'http://127.0.0.1:9101/grammar',
  request:async (url, options) => {
    calls.push({url, options});
    return {ok:true, json:async () => url.endsWith('/grammar')
      ? {matches:[{offset:0,length:4,rule:{category:{id:'PUNCTUATION'}},replacements:[{value:'Тест,'}]}]}
      : [{code:1,pos:0,len:5,word:'тектс',s:['текст']}]};
  }
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}`;
try {
  const page = await fetch(base);
  assert.equal(page.status, 200);
  assert.ok((await page.text()).includes('Типограф'));
  assert.ok(page.headers.get('content-security-policy').includes("connect-src 'self'"));

  const dictionary = await fetch(base + '/spellcheck.js');
  assert.equal(dictionary.status, 200);
  assert.ok((await dictionary.text()).includes('typografSpell'));

  const spelling = await fetch(base + '/api/spelling', {method:'POST',body:new URLSearchParams({text:'тектс',lang:'en'})});
  assert.equal(spelling.status, 200);
  assert.equal((await spelling.json())[0].word, 'тектс');
  assert.equal(calls[0].url, 'http://127.0.0.1:9101/speller');
  assert.equal(calls[0].options.body.get('lang'), 'ru');

  const grammar = await fetch(base + '/api/grammar', {method:'POST',body:new URLSearchParams({text:'Тест'})});
  assert.equal(grammar.status, 200);
  assert.equal((await grammar.json()).matches.length, 1);
  assert.equal(calls[1].url, 'http://127.0.0.1:9101/grammar');
  assert.equal(calls[1].options.body.get('language'), 'ru');

  const tooLong = await fetch(base + '/api/grammar', {method:'POST',body:new URLSearchParams({text:'я'.repeat(10000)})});
  assert.equal(tooLong.status, 413);
  assert.equal(calls.length, 2);

  const missing = await fetch(base + '/missing');
  assert.equal(missing.status, 404);
  for (const route of ['/api/neural','/api/neural/status']) {
    assert.equal((await fetch(base + route)).status,404);
    assert.equal((await fetch(base + route,{method:'POST',body:new URLSearchParams({text:'Тест.'})})).status,404);
  }
  console.log('PASS local service static page, dictionary, proxy, limits and routing');
} finally {
  server.close();
  await once(server, 'close');
}
