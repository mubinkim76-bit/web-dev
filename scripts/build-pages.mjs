import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url));
const projects=JSON.parse(fs.readFileSync(path.join(root,'PROJECTS.json'),'utf8')).projects;
const out=path.join(root,'dist');
fs.rmSync(out,{recursive:true,force:true});fs.mkdirSync(out);
const escape=s=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const links=[];const redirects=['/index.html / 301'];let headers;
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);}
for(const {folder:slug} of projects){
 if(!/^[a-z]+(?:-[a-z]+)*$/.test(slug))throw new Error('Unsafe service folder');
 const source=path.join(root,slug),target=path.join(out,slug);
 execFileSync(process.execPath,['scripts/build.mjs'],{cwd:source,stdio:'inherit'});
 const policy=fs.readFileSync(path.join(source,'dist/_headers'),'utf8');
 if(headers!==undefined&&headers!==policy)throw new Error('Service header policies differ: '+slug);
 headers=policy;
 fs.cpSync(path.join(source,'dist'),target,{recursive:true});fs.rmSync(path.join(target,'_headers'));
 // Scope only HTML/CSS asset URLs. Module imports and import.meta.url stay intact.
 for(const file of walk(target).filter(f=>/\.(html|css)$/.test(f))){
  const text=fs.readFileSync(file,'utf8').replace(/(["'(])\/(src|public)\//g,`$1/${slug}/$2/`);
  fs.writeFileSync(file,text);
 }
 const title=fs.readFileSync(path.join(target,'index.html'),'utf8').match(/<title>(.*?)<\/title>/s)[1];
 links.push(`<li><a href="/${slug}/">${escape(title)}</a> <a lang="en" href="/${slug}/?lang=en">English</a></li>`);
 redirects.push(`/${slug} /${slug}/ 301`,`/${slug}/index.html /${slug}/ 301`);
}
const page=(title,body)=>`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><link rel="stylesheet" href="/directory.css"><link rel="icon" href="/image-batch/public/favicon.svg"></head><body><main>${body}</main></body></html>\n`;
fs.writeFileSync(path.join(out,'index.html'),page('브라우저 도구 / Browser utilities',`<h1>브라우저 도구 / Browser utilities</h1><p>무료 · 비회원 · 브라우저 처리 / Free · No account · Local processing</p><ul>${links.join('\n')}</ul><p>입력과 파일은 현재 브라우저에서 처리됩니다. 결과를 저장하세요.<br>Files and inputs stay in your browser. Save your results.</p>`));
fs.writeFileSync(path.join(out,'404.html'),page('404 — 찾을 수 없음 / Not found','<h1>404</h1><p>요청한 페이지를 찾을 수 없습니다. / Page not found.</p><a href="/">도구 목록 / All tools</a>'));
fs.writeFileSync(path.join(out,'directory.css'),'body{font:1rem/1.7 system-ui,sans-serif;margin:0;background:#f5f7f3;color:#203c33}main{max-width:52rem;margin:auto;padding:2rem 1rem}li{margin:1rem 0}a{color:#145b47}a:focus-visible{outline:3px solid #a87600}h1{font-size:1.8rem;overflow-wrap:anywhere}\n');
fs.writeFileSync(path.join(out,'_headers'),headers);
fs.writeFileSync(path.join(out,'_redirects'),redirects.join('\n')+'\n');
console.log(`Built ${projects.length} services under dist/<slug>/ with directory and 404.`);
