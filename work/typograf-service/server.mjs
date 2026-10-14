import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const defaultFrontendDir = path.resolve(fileURLToPath(new URL('../../outputs/typograf-prototype/', import.meta.url)));
const defaultSpellerUrl = 'https://speller.yandex.net/services/spellservice.json/checkText';
const defaultLanguageToolUrl = 'http://127.0.0.1:8081/v2/check';

function reply(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'self'"
  });
  res.end(body);
}

async function readForm(req) {
  if (!/^application\/x-www-form-urlencoded(?:;|$)/i.test(req.headers['content-type'] || '')) throw Object.assign(new Error('Ожидается форма.'), {status:415});
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 80000) throw Object.assign(new Error('Текст слишком длинный.'), {status:413});
    chunks.push(chunk);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

export function createTypografServer({
  frontendDir = defaultFrontendDir,
  spellerUrl = defaultSpellerUrl,
  languageToolUrl = defaultLanguageToolUrl,
  request = fetch
} = {}) {
  return createServer(async (req, res) => {
    const pathname = new URL(req.url || '/', 'http://localhost').pathname;
    try {
      if (req.method === 'GET' && pathname === '/healthz') {
        reply(res, 200, JSON.stringify({status:'ok', languageToolConfigured:!!languageToolUrl}));
        return;
      }
      if (req.method === 'GET' && ['/', '/index.html', '/spellcheck.js'].includes(pathname)) {
        const name = pathname === '/spellcheck.js' ? 'spellcheck.js' : 'index.html';
        const contents = await readFile(path.join(frontendDir, name));
        reply(res, 200, contents, name.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8');
        return;
      }
      if (req.method !== 'POST' || !['/api/spelling', '/api/grammar'].includes(pathname)) {
        reply(res, 404, JSON.stringify({error:'Маршрут не найден.'}));
        return;
      }
      const form = await readForm(req);
      const text = form.get('text');
      if (typeof text !== 'string' || !text.trim()) throw Object.assign(new Error('Текст пуст.'), {status:400});
      const grammar = pathname === '/api/grammar';
      if (Buffer.byteLength(text) > (grammar ? 19000 : 32000)) throw Object.assign(new Error('Текст слишком длинный.'), {status:413});
      const upstream = await request(grammar ? languageToolUrl : spellerUrl, {
        method:'POST',
        headers:{'Content-Type':'application/x-www-form-urlencoded; charset=utf-8'},
        body:new URLSearchParams(grammar ? {text, language:'ru'} : {text, lang:'ru'}),
        signal:AbortSignal.timeout(15000)
      });
      if (!upstream.ok) throw Object.assign(new Error('Сервис проверки недоступен.'), {status:502});
      const payload = await upstream.json();
      if (grammar ? !Array.isArray(payload?.matches) : !Array.isArray(payload)) throw Object.assign(new Error('Некорректный ответ сервиса.'), {status:502});
      reply(res, 200, JSON.stringify(payload));
    } catch (error) {
      reply(res, error.status || 502, JSON.stringify({error:error.status ? error.message : 'Сервис проверки недоступен.'}));
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const host = '127.0.0.1';
  const port = Number(process.env.TYPOGRAF_PORT || 4173);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Некорректный TYPOGRAF_PORT');
  createTypografServer({languageToolUrl:process.env.TYPOGRAF_LT_URL || defaultLanguageToolUrl})
    .listen(port, host, () => console.log(`Типограф: http://${host}:${port}`));
}
