/** Actual controller handlers with a tiny synthetic DOM/Worker, NOT browser interaction tests. */
import {mount} from '../../src/tools/gomoku.js';
const storage=()=>{const map=new Map();return {map,getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};};
function harness(store=storage()){
 const winListeners=new Map(),workers=[],events=[];
 globalThis.CustomEvent=class {constructor(type,options){this.type=type;this.detail=options.detail;}};
 globalThis.document={activeElement:null};
 globalThis.window={localStorage:store,addEventListener:(k,f)=>winListeners.set(k,f),removeEventListener:k=>winListeners.delete(k),dispatchEvent:e=>{events.push(e);winListeners.get(e.type)?.(e);}};
 globalThis.Worker=class{constructor(){workers.push(this);this.dead=false;}postMessage(data){this.request=data;}terminate(){this.dead=true;}};
 const listeners=new Map();
 const fake=(selector)=>({dataset:{},name:'',classList:{contains:k=>k==='gm-board'&&selector==='.gm-board'},focus(){document.activeElement=this;},scrollIntoView(){},scrollLeft:0,scrollTop:0});
 const root={innerHTML:'',addEventListener:(k,f)=>listeners.set(k,f),removeEventListener:k=>listeners.delete(k),querySelector:s=>fake(s),contains:()=>false,replaceChildren(){this.innerHTML='';}};
 const clean=mount(root,{lang:'en',t:(_,en)=>en});
 const click=(action)=>listeners.get('click')({target:{closest:s=>s==='.gm-cell'?null:s==='[data-action]'?{dataset:{action}}:null}});
 const cell=(row,col)=>listeners.get('click')({target:{closest:s=>s==='.gm-cell'?{dataset:{row:String(row),col:String(col)}}:null}});
 const change=(name,value,checked=false)=>listeners.get('change')({target:{name,value,checked}});
 const key=(key,repeat=false)=>listeners.get('keydown')({target:{classList:{contains:k=>k==='gm-board'}},key,repeat,preventDefault(){}});
 const moves=()=>{const m=root.innerHTML.match(/Total <b>(\d+)<\/b>/);return m?Number(m[1]):null;};
 return {root,clean,click,cell,change,key,moves,store,workers,listeners,winListeners,events};
}

export {harness,storage};
