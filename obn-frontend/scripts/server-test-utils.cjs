const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '..');
const req = createRequire(path.join(root, 'package.json'));
const ts = req('typescript');

function context({ env = {}, mocks = {}, fetch = async () => { throw Error('Unexpected network call'); } } = {}) {
  const cache = new Map();
  function load(relative) {
    const file = path.resolve(root, relative);
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} };
    cache.set(file, module);
    const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    const localRequire = (id) => {
      if (Object.hasOwn(mocks, id)) return mocks[id];
      if (id === 'next/server') return { NextResponse: { json: (body, options) => Response.json(body, options) } };
      if (id.startsWith('@/')) return load('src/' + id.slice(2) + '.ts');
      if (id.startsWith('.')) return load(path.resolve(path.dirname(file), id + '.ts'));
      return req(id);
    };
    new Function('require', 'module', 'exports', 'process', 'fetch', js)(localRequire, module, module.exports, { env }, fetch);
    return module.exports;
  }
  return { load, route: (name) => load(`src/app/api/${name}/route.ts`) };
}
function request(url = 'https://app.invalid/', body, headers = {}) {
  const req = new Request(url, body === undefined ? { headers } : {
    method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body),
  });
  Object.defineProperty(req, 'nextUrl', { value: new URL(url) });
  return req;
}
module.exports = { context, request, req, root };
