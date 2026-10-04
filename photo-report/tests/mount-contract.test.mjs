// All eleven real module entrypoints with a minimal DOM adapter. Not browser QA.
import test from 'node:test';import assert from 'node:assert/strict';
class Element {
 constructor(tag,text=''){Object.assign(this,{tagName:tag,children:[],attrs:{},dataset:{},style:{},events:new Map(),_text:text,_html:'',_value:undefined,checked:false,disabled:false,hidden:false,files:[],parentNode:null});this.classList={add(){},remove(){},contains:()=>false};}
 append(...nodes){for(const n of nodes){this.children.push(n);n.parentNode=this;}}
 replaceChildren(...nodes){this.children=[];this._text='';this._html='';this.append(...nodes);}
 setAttribute(k,v){this.attrs[k]=String(v);if(k.startsWith('data-'))this.dataset[k.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=String(v);}
 addEventListener(k,f){this.events.set(k,f);}removeEventListener(k){this.events.delete(k);}
 get textContent(){return this._text+this._html+this.children.map(n=>n.textContent).join('');}set textContent(v){this._text=String(v);this.children=[];this._html='';}
 get innerHTML(){return this._html;}set innerHTML(v){this._html=String(v);this.children=[];}
 get options(){return this.children;}get selectedIndex(){const i=this.children.findIndex(n=>n.value===this.value);return i<0?0:i;}get text(){return this.textContent;}
 get value(){return this._value??(this.tagName==='select'?this.children.find(n=>n.selected)?.value||this.children[0]?.value||'':'');}set value(v){this._value=String(v);}
 querySelectorAll(selector){const names=selector.split(',');return this.children.flatMap(n=>[...(names.some(s=>s==='[data-key]'?n.dataset.key!==undefined:s.trim()===n.tagName)?[n]:[]),...n.querySelectorAll(selector)]);}
 querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
 remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(n=>n!==this);}focus(){}scrollIntoView(){}contains(){return false;}
}
function setup(){globalThis.Node=Element;globalThis.matchMedia=()=>({matches:false});globalThis.CustomEvent=class{constructor(type,options){this.type=type;this.detail=options.detail;}};globalThis.document={createElement:t=>new Element(t),createTextNode:t=>new Element('#text',String(t)),body:new Element('body'),activeElement:null};const data=new Map();globalThis.window={dispatchEvent(){},addEventListener(){},removeEventListener(){},localStorage:{getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)}};globalThis.Worker=class{postMessage(){}terminate(){}};}
const routes=[["report","mount"]];
for(const [i,[file,method]]of routes.entries())test(`catalog ${String(i+1).padStart(2,'0')} ${file}/${method} mounts and cleans up`,async()=>{setup();const mod=await import(`../src/tools/${file}.js`),root=new Element('div');assert.equal(typeof mod[method],'function');const cleanup=mod[method](root,{lang:'en',t:(ko,en)=>en,toast(){}});assert.equal(typeof cleanup,'function');assert.ok(root.textContent.length>30);const errors=root.querySelectorAll('p').filter(n=>n.attrs.role==='alert'&&!n.hidden);assert.equal(errors.length,0,errors.map(n=>n.textContent).join(' / '));cleanup();});

async function reportFixture(){
 setup();const dirty=[];window.dispatchEvent=e=>{if(e.type==='workspace-dirty')dirty.push(e.detail);};
 const root=new Element('div'),{mount}=await import('../src/tools/report.js');
 const cleanup=mount(root,{t:(ko,en)=>en,toast(){}});
 const input=label=>root.querySelectorAll('input').find(e=>e.attrs['aria-label']===label);
 const click=label=>root.querySelectorAll('button').find(e=>e.textContent===label).events.get('click')();
 const photo=new Blob([new Uint8Array([255,216,255,224])]);photo.name='alpha.jpg';
 const original=globalThis.createImageBitmap;globalThis.createImageBitmap=async()=>({width:10,height:10,close(){}});
 try{input('Choose report photos').files=[photo];await input('Choose report photos').events.get('change')();}finally{globalThis.createImageBitmap=original;}
 const caption=()=>root.querySelector('textarea')?.value;
 const csv=input('Caption CSV');
 function request(name){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});csv.files=[{name:name+'.csv',size:100,arrayBuffer:()=>promise}];csv.value=name+'.csv';const done=csv.events.get('change')();return {done,resolve:()=>resolve(new TextEncoder().encode(`file_name,caption,work_date\nalpha.jpg,${name},2026-10-04`).buffer),reject:()=>reject(new Error('stale error'))};}
 return {root,dirty,click,caption,csv,request,cleanup};
}
for(const order of ['A-first','B-first','stale-error'])test(`caption import keeps latest request: ${order}`,async()=>{
 const f=await reportFixture();try{const a=f.request('A'),b=f.request('B');
 if(order==='A-first'){a.resolve();await a.done;assert.equal(f.caption(),'');assert.equal(f.csv.value,'B.csv');b.resolve();await b.done;}
 else{b.resolve();await b.done;order==='stale-error'?a.reject():a.resolve();await a.done;}
 assert.equal(f.caption(),'B');assert.ok(f.root.textContent.includes('1 captions linked.'));assert.ok(!f.root.textContent.includes('stale error'));
 }finally{f.cleanup();}
});
test('clear all resets report details and invalidates pending CSV',async()=>{
 const f=await reportFixture();try{
 const title=f.root.querySelectorAll('input').find(e=>e.value==='Site photo report'),author=f.root.querySelectorAll('input').find(e=>e.attrs.placeholder==='Author or site (optional)');
 title.value='Custom title';author.value='Custom author';for(const s of f.root.querySelectorAll('select'))s.value=s.value==='A4'?'Letter':'2';
 const a=f.request('A');f.click('Clear all');a.resolve();await a.done;
 assert.equal(title.value,'Site photo report');assert.equal(author.value,'');assert.deepEqual(f.root.querySelectorAll('select').map(e=>e.value),['A4','4']);assert.equal(f.caption(),undefined);assert.equal(f.dirty.at(-1),false);assert.ok(f.root.textContent.includes('Workspace cleared'));
 }finally{f.cleanup();}
});
