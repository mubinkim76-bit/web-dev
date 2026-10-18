import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url));
const projects=JSON.parse(fs.readFileSync(path.join(root,'PROJECTS.json'),'utf8')).projects;
const out=path.join(root,'dist');
fs.rmSync(out,{recursive:true,force:true});fs.mkdirSync(out);
const escape=s=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const links=[];const catalog=[];const redirects=['/index.html / 301'];let headers;
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
 const {copy}=await import(new URL('../'+slug+'/src/service-guide.js',import.meta.url));
 catalog.push({slug,copy});
 const title=copy.ko.title;
 links.push(`<li><a href="/${slug}/">${escape(title)}</a> <a lang="en" href="/${slug}/?lang=en">English</a></li>`);
 redirects.push(`/${slug} /${slug}/ 301`,`/${slug}/index.html /${slug}/ 301`);
}
const page=(title,body)=>`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><link rel="stylesheet" href="/directory.css"><link rel="icon" href="/image-batch/public/favicon.svg"></head><body><main>${body}</main></body></html>\n`;
const {buildDirectory}=await import('./directory.mjs');
const directory=buildDirectory(catalog);
fs.writeFileSync(path.join(out,'index.html'),directory);
fs.cpSync(path.join(root,'landing'),out,{recursive:true});
// Do not fetch catalog at runtime: connect-src remains none.
fs.writeFileSync(path.join(out,'catalog.js'),'export default '+JSON.stringify(catalog)+';');
const origin=new URL(process.env.SITE_ORIGIN || 'https://web-dev-eleven.pages.dev').origin;
fs.writeFileSync(path.join(out,'index.html'),directory.replace('</head>',`<link rel="canonical" href="${origin}/"></head>`));
for(const {slug,copy} of catalog){
 const file=path.join(out,slug,'index.html');
 const html=fs.readFileSync(file,'utf8');
 const tags=`<link rel="canonical" href="${origin}/${slug}/"><link rel="alternate" hreflang="ko" href="${origin}/${slug}/"><link rel="alternate" hreflang="en" href="${origin}/${slug}/en/">`;
 fs.writeFileSync(file,html.replace('</head>',tags+'</head>'));
 const en=html.replace('<html lang="ko">','<html lang="en">').replace(/<title>.*?<\/title>/s,`<title>${escape(copy.en.title)}</title>`).replace(/(<meta (?:name="description"|property="og:description") content=")[^"]*"/g,`$1${escape(copy.en.description)}"`).replace(/(<meta property="og:title" content=")[^"]*"/,`$1${escape(copy.en.title)}"`).replace('content="ko_KR"','content="en_US"').replace(/<div id="app">.*?<div id="toast"/s,`<div id="app"><main id="main"><h1>${escape(copy.en.title)}</h1><p>${escape(copy.en.description)}</p><h2>Three steps</h2><ol>${copy.en.steps.map(x=>`<li>${escape(x)}</li>`).join('')}</ol><h2>Supported features and limits</h2><p>${escape(copy.en.scope)}</p><p>${escape(copy.en.limits)}</p><h2>If something goes wrong</h2><p>${escape(copy.en.recovery)}</p><noscript>Enable JavaScript to use this tool.</noscript></main></div><div id="toast"`).replace('</head>',tags.replace(`rel="canonical" href="${origin}/${slug}/"`,`rel="canonical" href="${origin}/${slug}/en/"`)+'</head>');
 fs.mkdirSync(path.join(out,slug,'en'),{recursive:true});fs.writeFileSync(path.join(out,slug,'en/index.html'),en);
 redirects.push(`/${slug}/en /${slug}/en/ 301`,`/${slug}/en/index.html /${slug}/en/ 301`);
}
fs.writeFileSync(path.join(out,'sitemap.xml'),`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${['/',...catalog.flatMap(({slug})=>['/'+slug+'/','/'+slug+'/en/'])].map(p=>`<url><loc>${escape(origin+p)}</loc></url>`).join('')}</urlset>`);
fs.writeFileSync(path.join(out,'robots.txt'),`User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml\n`);
fs.writeFileSync(path.join(out,'404.html'),page('404 — 찾을 수 없음 / Not found','<h1>404</h1><p>요청한 페이지를 찾을 수 없습니다. / Page not found.</p><a href="/">도구 목록 / All tools</a>'));
fs.writeFileSync(path.join(out,'_headers'),headers);
fs.writeFileSync(path.join(out,'_redirects'),redirects.join('\n')+'\n');
console.log(`Built ${projects.length} services under dist/<slug>/ with directory and 404.`);
