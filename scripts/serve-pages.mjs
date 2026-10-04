// Local static preview of this build's explicit redirects and global headers.
// Production Cloudflare CDN/TLS behavior still requires deployed verification.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
export function createPagesServer(root=fileURLToPath(new URL('../dist/',import.meta.url))){
 root=path.resolve(root);
 const headers=Object.fromEntries(fs.readFileSync(path.join(root,'_headers'),'utf8').split('\n').filter(l=>/^\s+\S/.test(l)).map(l=>{const i=l.indexOf(':');return [l.slice(0,i).trim(),l.slice(i+1).trim()];}));
 const redirects=new Map(fs.readFileSync(path.join(root,'_redirects'),'utf8').trim().split('\n').map(l=>{const [from,to,status]=l.split(/\s+/);return [from,{to,status:Number(status)}];}));
 const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.woff':'font/woff','.json':'application/json','.txt':'text/plain; charset=utf-8','.md':'text/plain; charset=utf-8'};
 return http.createServer((req,res)=>{
  const reply=(status,body='',extra={})=>{res.writeHead(status,{...headers,...extra});res.end(req.method==='HEAD'?undefined:body);};
  if(!['GET','HEAD'].includes(req.method))return reply(405,'Method not allowed',{'Allow':'GET, HEAD'});
  let url,pathname;try{url=new URL(req.url,'http://localhost');pathname=decodeURIComponent(url.pathname);if(/[\x00-\x1f\\]/.test(pathname))throw Error();}catch{return reply(400,'Bad request');}
  const redirect=redirects.get(pathname);if(redirect)return reply(redirect.status,'',{'Location':redirect.to+url.search});
  const relative=pathname.endsWith('/')?pathname+'index.html':pathname;
  const target=path.resolve(root,'.'+relative);
  if(target.startsWith(root+path.sep)&&!pathname.split('/').some(x=>x.startsWith('.')||x.startsWith('_'))&&fs.existsSync(target)&&fs.statSync(target).isFile())return reply(200,fs.readFileSync(target),{'Content-Type':mime[path.extname(target)]||'application/octet-stream'});
  return reply(404,fs.readFileSync(path.join(root,'404.html')),{'Content-Type':mime['.html']});
 });
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))createPagesServer().listen(Number(process.env.PORT||4173),'127.0.0.1',()=>console.log('Pages preview ready'));
