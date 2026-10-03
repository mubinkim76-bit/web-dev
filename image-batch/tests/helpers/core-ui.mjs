// Dependency-free DOM/canvas adapters for controller ownership tests, not browser rendering QA.
import assert from 'node:assert/strict';
export const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
const bytes=new Uint8Array(24);bytes.set([137,80,78,71]);new DataView(bytes.buffer).setUint32(16,2);new DataView(bytes.buffer).setUint32(20,2);
export const good=(name='good.png')=>new File([bytes],name,{type:'image/png'});
export function delayed(name,call=1){let calls=0;const entered=deferred(),resume=deferred();return{name,size:bytes.length,arrayBuffer:async()=>{if(++calls===call){entered.resolve();await resume.promise;}return bytes.slice().buffer;},entered,resume};}
export class Element {
 constructor(tag,text=''){Object.assign(this,{tagName:tag,children:[],parentNode:null,events:new Map(),attrs:{},_text:text,_value:'',checked:false,disabled:false,hidden:false,style:{},dataset:{},files:[]});}
 append(...nodes){for(const n of nodes){this.children.push(n);n.parentNode=this;}}
 replaceChildren(...nodes){this.children=[];this._text='';this.append(...nodes);}
 setAttribute(k,v){this.attrs[k]=String(v);}
 addEventListener(k,f){this.events.set(k,[...(this.events.get(k)||[]),f]);}
 async dispatch(type){if(this.disabled&&type==='click')return;await Promise.all((this.events.get(type)||[]).map(f=>f({target:this,currentTarget:this,type})));}
 click(){if(this.tagName==='a')state.downloads.push({name:this.attrs.download,blob:state.blobs.get(this.attrs.href)});else return this.dispatch('click');}
 get value(){return this._value;}set value(v){this._value=String(v);}
 get textContent(){return this._text+this.children.map(n=>n.textContent).join('');}set textContent(v){this._text=String(v);this.children=[];}
 querySelectorAll(selector){const tags=selector.split(',');return all(this,n=>tags.includes(n.tagName));}
 remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(n=>n!==this);}focus(){}
}
class Canvas {
 constructor(){this.width=1;this.height=1;state.canvases.push(this);}
 getContext(){return{fillRect(){},drawImage(){},fillText(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},measureText:text=>({width:Array.from(text).length*10})};}
 toBlob(callback,type){const finish=()=>callback(new Blob(['synthetic encoded image'],{type}));if(state.encodeHook)state.encodeHook(finish);else finish();}
}
export function all(root,p){return[...(p(root)?[root]:[]),...root.children.flatMap(x=>all(x,p))];}
export function button(root,text){const n=all(root,x=>x.tagName==='button'&&x.textContent===text)[0];assert(n,text);return n;}
export function aria(root,text){const n=all(root,x=>x.attrs['aria-label']===text)[0];assert(n,text);return n;}
export let state;
export function setup(mount){state={downloads:[],blobs:new Map(),dirty:[],zip:[],canvases:[],closed:0,encodeHook:null};globalThis.Node=Element;globalThis.CustomEvent=class{constructor(type,options){this.type=type;this.detail=options?.detail;}};globalThis.document={body:new Element('body'),fonts:{load:async()=>[],ready:Promise.resolve()},createTextNode:t=>new Element('#text',String(t)),createElement:t=>t==='canvas'?new Canvas():new Element(t)};globalThis.matchMedia=()=>({matches:false});globalThis.window={dispatchEvent(e){state.dirty.push(e.detail);},JSZip:class{file(name,value){state.zip.push({name,value});}async generateAsync(){return new Blob(['synthetic ZIP']);}}};globalThis.createImageBitmap=async()=>({width:2,height:2,close(){state.closed++;}});URL.createObjectURL=blob=>{const u='blob:core-test-'+state.blobs.size;state.blobs.set(u,blob);return u;};URL.revokeObjectURL=()=>{};const root=new Element('div');const cleanup=mount?.(root,{t:(_,en)=>en,toast(){}})||(()=>{});return{root,cleanup};}
export async function files(root,label,values){const input=aria(root,label);input.files=values;await input.dispatch('change');}
export const rows=root=>all(root,n=>n.tagName==='section'&&n.className==='panel photo-row');
export async function confirmReceipt(row){const inputs=all(row,n=>n.tagName==='input'),date=inputs.find(n=>n.attrs.type==='date'),amount=inputs.find(n=>n.attrs.inputmode==='decimal'),check=inputs.find(n=>n.attrs.type==='checkbox');date.value='2026-10-01';amount.value='1000';await amount.dispatch('input');check.checked=true;await check.dispatch('change');return{date,amount,check};}
