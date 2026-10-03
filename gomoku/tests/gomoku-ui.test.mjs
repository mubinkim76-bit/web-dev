/** Event-handler integration with a minimal DOM adapter, NOT real browser/a11y QA. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mount } from '../src/tools/gomoku.js';
import { CURRENT_KEY, SETTINGS_KEY } from '../src/lib/gomoku-storage.js';
function harness() {
  const data=new Map(),events=new Map(),workers=[],dirty=[];
  const storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};
  globalThis.CustomEvent=class {constructor(type,options){this.type=type;this.detail=options.detail;}};
  globalThis.window={localStorage:storage,addEventListener:(key,fn)=>events.set(key,fn),removeEventListener:key=>events.delete(key),dispatchEvent:event=>{if(event.type==='workspace-dirty')dirty.push(event.detail);}};
  globalThis.document={activeElement:null};
  globalThis.Worker=class {constructor(){this.terminated=false;workers.push(this);}postMessage(value){this.request=value;}terminate(){this.terminated=true;}reply(move){this.onmessage?.({data:{...this.request,move,reason:'pattern'}});}};
  const handlers=new Map();
  const root={innerHTML:'',addEventListener:(key,fn)=>handlers.set(key,fn),removeEventListener:key=>handlers.delete(key),replaceChildren(){this.innerHTML='';},contains:()=>false,querySelector(selector){if(selector==='.gm-board-scroll')return null;return{focus(){},scrollIntoView(){}};}};
  const cleanup=mount(root,{lang:'en'});
  const click=action=>handlers.get('click')({target:{closest:selector=>selector==='[data-action]'?{dataset:{action}}:null}});
  const select=(row,col)=>handlers.get('click')({target:{closest:selector=>selector==='.gm-cell'?{dataset:{row:String(row),col:String(col)}}:null}});
  const change=(name,value)=>handlers.get('change')({target:{name,value,checked:Boolean(value)}});
  const key=(key,repeat=false)=>handlers.get('keydown')({target:{classList:{contains:x=>x==='gm-board'}},key,repeat,preventDefault(){}});
  const stones=()=>[...root.innerHTML.matchAll(/class="gm-stone /g)].length;
  return{root,cleanup,click,select,change,key,stones,storage,workers,events,dirty};
}
test('DOM adapter: click selects, separate confirmation places, duplicate placement stays one move',()=>{
  const h=harness();try{
    h.change('gm-mode','local2p');h.click('start');h.select(7,7);assert.equal(h.stones(),0);
    h.click('place');assert.equal(h.stones(),1);h.click('place');assert.equal(h.stones(),1);
    assert.equal(h.storage.getItem(CURRENT_KEY),null);assert.equal(h.dirty.at(-1),true);
    h.key('ArrowRight');h.key('Enter');assert.equal(h.stones(),2);h.key('ArrowRight');h.key('Enter',true);assert.equal(h.stones(),2);
    h.key(' ');assert.equal(h.stones(),3);
  }finally{h.cleanup();assert.equal(h.dirty.at(-1),false);}
});
test('DOM adapter: two-player undo requires both-player confirmation and supports cancel',()=>{
  const h=harness();try{
    h.change('gm-mode','local2p');h.click('start');h.click('place');assert.equal(h.stones(),1);
    h.click('undo');assert.equal(h.stones(),1);assert.match(h.root.innerHTML,/Do both players agree/);
    h.click('confirm-no');assert.equal(h.stones(),1);h.click('undo');h.click('confirm-yes');assert.equal(h.stones(),0);
  }finally{h.cleanup();}
});
test('DOM adapter: saving on is optional; setup opt-out clears both records immediately',()=>{
  const h=harness();try{
    h.change('gm-mode','local2p');h.click('start');h.click('place');assert.equal(h.storage.getItem(CURRENT_KEY),null);
    h.change('gm-save',true);assert.ok(h.storage.getItem(CURRENT_KEY));assert.ok(h.storage.getItem(SETTINGS_KEY));assert.equal(h.dirty.at(-1),false);
    h.click('setup');h.change('gm-save',false);assert.equal(h.storage.getItem(CURRENT_KEY),null);assert.equal(h.storage.getItem(SETTINGS_KEY),null);
    h.click('continue');h.select(7,8);h.click('place');assert.equal(h.stones(),2);assert.equal(h.storage.getItem(CURRENT_KEY),null);assert.equal(h.dirty.at(-1),true);
  }finally{h.cleanup();}
});
test('DOM adapter: resetting during AI destroys worker and ignores a late response',()=>{
  const h=harness();try{
    h.click('start');h.click('place');assert.equal(h.stones(),1);const worker=h.workers.at(-1);assert.ok(worker);
    h.click('restart');assert.equal(worker.terminated,true);h.click('confirm-yes');assert.equal(h.stones(),0);
    worker.reply({row:7,col:8});assert.equal(h.stones(),0);
    h.click('place');const next=h.workers.at(-1);next.reply({row:7,col:8});assert.equal(h.stones(),2);
    h.click('undo');assert.equal(h.stones(),0);next.reply({row:7,col:9});assert.equal(h.stones(),0);
  }finally{h.cleanup();}
});
test('DOM adapter: cleanup destroys AI-first worker and no late callback renders',()=>{
  const h=harness();h.change('gm-color','2');h.click('start');const worker=h.workers.at(-1);assert.ok(worker);
  h.cleanup();assert.equal(worker.terminated,true);assert.equal(h.root.innerHTML,'');worker.reply({row:7,col:7});assert.equal(h.root.innerHTML,'');
});
test('DOM adapter: another-tab update pauses play and can start an unsaved separate game',()=>{
  const h=harness();try{
    h.change('gm-mode','local2p');h.click('start');h.click('place');h.change('gm-save',true);
    const original=h.storage.getItem(CURRENT_KEY);h.events.get('storage')({key:CURRENT_KEY,newValue:'changed'});
    assert.match(h.root.innerHTML,/The saved game changed in another tab/);
    h.select(7,8);h.click('place');assert.equal(h.stones(),1);
    h.click('separate');assert.equal(h.stones(),0);h.click('place');assert.equal(h.stones(),1);assert.equal(h.storage.getItem(CURRENT_KEY),original);
  }finally{h.cleanup();}
});
test('DOM adapter: mismatched Worker token is ignored without cancelling the live request',()=>{
  const h=harness();try{
    h.click('start');h.click('place');const worker=h.workers.at(-1);
    worker.onmessage({data:{...worker.request,requestId:'stale',move:{row:7,col:8}}});
    assert.equal(h.stones(),1);assert.equal(worker.terminated,false);
    worker.reply({row:7,col:8});assert.equal(h.stones(),2);assert.equal(worker.terminated,true);
  }finally{h.cleanup();}
});
test('DOM adapter: invalid AI point becomes an explicit retry with no hidden move',()=>{
  const h=harness();try{
    h.click('start');h.click('place');const worker=h.workers.at(-1);worker.reply({row:7,col:7});
    assert.equal(h.stones(),1);assert.match(h.root.innerHTML,/Retry calculation/);assert.equal(worker.terminated,true);
    h.click('retry');const retried=h.workers.at(-1);assert.notEqual(retried,worker);retried.reply({row:7,col:8});assert.equal(h.stones(),2);
  }finally{h.cleanup();}
});
