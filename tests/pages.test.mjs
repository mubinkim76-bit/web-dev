import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {createPagesServer} from '../scripts/serve-pages.mjs';
const projects=JSON.parse(fs.readFileSync('PROJECTS.json')).projects;
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);}
test('11 built subpaths preserve scripts and licenses, scope assets, and exclude source-only files',()=>{
 for(const {folder:s} of projects){
  const html=fs.readFileSync(`dist/${s}/index.html`,'utf8');assert(html.includes(`/${s}/src/app.js`));assert(!/["']\/(src|public)\//.test(html));
  for(const f of walk(`${s}/dist`)){
   const rel=path.relative(`${s}/dist`,f);if(rel==='_headers')continue;
   const actual=fs.readFileSync(`dist/${s}/${rel}`);const original=fs.readFileSync(f);
   if(!/\.(html|css)$/.test(f))assert.deepEqual(actual,original,f);
   else assert(!/["'(]\/(src|public)\//.test(actual.toString()),f);
  }
  for(const name of ['package.json','qa','tests','scripts','SPEC.json','_headers'])assert(!fs.existsSync(`dist/${s}/${name}`));
 }
 assert(fs.existsSync('dist/404.html'));assert(!fs.existsSync('dist/_worker.js'));
});
test('HTTP routes, redirects preserve queries, real 404s, MIME and global security/cache headers',async()=>{
 const server=createPagesServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 try{
  assert.equal((await fetch(base+'/')).status,200);
  for(const {folder:s} of projects){
   for(const route of [`/${s}`,`/${s}/index.html`]){const r=await fetch(base+route+'?lang=en',{redirect:'manual'});assert.equal(r.status,301);assert.equal(r.headers.get('location'),`/${s}/?lang=en`);}
   for(const route of [`/${s}/`,`/${s}/src/app.js`,`/${s}/public/fonts/NotoSansKR-Local.woff`]){const r=await fetch(base+route);assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-cache');assert.equal(r.headers.get('x-content-type-options'),'nosniff');assert(r.headers.get('content-security-policy').includes("connect-src 'none'"));}
   assert.match((await fetch(base+`/${s}/src/app.js`)).headers.get('content-type'),/javascript/);
   for(const route of [`/${s}/missing`,`/${s}/package.json`,`/${s}/_headers`])assert.equal((await fetch(base+route)).status,404);
  }
  for(const route of ['/missing','/src/app.js','/public/favicon.svg','/_headers','/_redirects','/.git/config','/../package.json'])assert.equal((await fetch(base+route)).status,404);
  assert.equal((await fetch(base+'/%ZZ')).status,400);assert.equal((await fetch(base+'/',{method:'POST'})).status,405);assert.equal(await (await fetch(base+'/',{method:'HEAD'})).text(),'');
 }finally{await new Promise(r=>server.close(r));}
});
