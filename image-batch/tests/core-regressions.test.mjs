import test from 'node:test';
import assert from 'node:assert/strict';
import {mount as images} from '../src/tools/images.js';
import {setup,state,good,delayed,deferred,all,button,aria,files,rows,confirmReceipt} from './helpers/core-ui.mjs';
const corrupt=()=>new File([new Uint8Array([0,1,2])],'corrupt.jpg',{type:'image/jpeg'});

test('CORE-01: repeated failed-item retries retain prior omitted counts and manifest filenames',async()=>{
 const h=setup(images),wait=delayed('in-flight.png');
 try{
  await files(h.root,'Choose images',[corrupt(),wait,good('never-processed.png')]);
  const running=button(h.root,'Convert batch').dispatch('click');await wait.entered.promise;
  await button(h.root,'Cancel').dispatch('click');wait.resume.resolve();await running;
  for(let attempt=0;attempt<3;attempt++){
   assert.match(h.root.textContent,/1 available · 1 failed · 1 unprocessed/);
   state.zip=[];await button(h.root,'Download successful files as ZIP').dispatch('click');
   const manifest=state.zip.find(x=>x.name==='_manifest.txt').value;
   assert.match(manifest,/1 result\(s\); 1 failed; 1 unprocessed/);
   assert.equal(manifest.split('UNPROCESSED\n')[1].split('\n').filter(Boolean).length,1);
   assert.match(manifest,/never-processed/);
   await button(h.root,'Retry failed items').dispatch('click');
  }
  await button(h.root,'Convert batch').dispatch('click');
  assert.match(h.root.textContent,/2 available · 1 failed · 0 unprocessed/,'A fresh full run replaces old omission accounting');
 }finally{h.cleanup();}
});

test('CORE-01: cancellation during retry adds its unprocessed failures without dropping previous omissions',async()=>{
 const h=setup(images),second=corrupt(),current=delayed('in-flight.png');
 // The first read fails before decoding; retry is held until after cancellation.
 let calls=0;const retryGate=deferred(),retryResume=deferred();
 const first={name:'fail-one.png',size:24,arrayBuffer:async()=>{if(++calls===1)return new Uint8Array([0,1,2]).buffer;retryGate.resolve();await retryResume.promise;return await good().arrayBuffer();}};
 try{
  await files(h.root,'Choose images',[first,second,current,good('prior-omitted.png')]);
  const running=button(h.root,'Convert batch').dispatch('click');await current.entered.promise;await button(h.root,'Cancel').dispatch('click');current.resume.resolve();await running;
  assert.match(h.root.textContent,/1 available · 2 failed · 1 unprocessed/);
  const retrying=button(h.root,'Retry failed items').dispatch('click');await retryGate.promise;await button(h.root,'Cancel').dispatch('click');retryResume.resolve();await retrying;
  assert.match(h.root.textContent,/2 available · 0 failed · 2 unprocessed/);
  await button(h.root,'Download successful files as ZIP').dispatch('click');
  const manifest=state.zip.find(x=>x.name==='_manifest.txt').value;
  assert.match(manifest,/prior-omitted/);assert.match(manifest.split('UNPROCESSED\n')[1],/corrupt/);
 }finally{h.cleanup();}
});

