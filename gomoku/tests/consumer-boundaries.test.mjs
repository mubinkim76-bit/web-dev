/** Consumer regression tests use synthetic DOM/Workers, not Chromium. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,storage} from './helpers/gomoku-regression-dom.mjs';
import {CURRENT_KEY,serializeSave} from '../src/lib/gomoku-storage.js';
import {createGame,playMove} from '../src/lib/gomoku-engine.js';

test('consumer: restart cancellation keeps moves and resumes AI with a fresh request',()=>{
 const h=harness();try {
  h.click('start');h.click('place');const old=h.workers.at(-1);
  h.click('restart');assert.equal(old.dead,true);h.click('confirm-no');
  const fresh=h.workers.at(-1);assert.notEqual(fresh,old);assert.equal(h.moves(),1);
  old.onmessage({data:{...old.request,move:{row:7,col:8}}});assert.equal(h.moves(),1);
  fresh.onmessage({data:{...fresh.request,move:{row:7,col:8}}});assert.equal(h.moves(),2);
 }finally{h.clean();}
});
test('consumer: mode screen cancels AI, preserves game and continues safely',()=>{
 const h=harness();try{
  h.click('start');h.click('place');const old=h.workers.at(-1);h.click('setup');
  assert.equal(old.dead,true);old.onmessage({data:{...old.request,move:{row:7,col:8}}});
  assert.match(h.root.innerHTML,/Game in this tab/);h.click('continue');assert.equal(h.moves(),1);
  const fresh=h.workers.at(-1);fresh.onmessage({data:{...fresh.request,move:{row:7,col:8}}});assert.equal(h.moves(),2);
 }finally{h.clean();}
});
test('consumer: cancelling a hint ignores its late reply and a new hint never places',()=>{
 const h=harness();try{
  h.change('gm-mode','local2p');h.click('start');h.click('hint');const old=h.workers.at(-1);
  h.click('hint');assert.equal(old.dead,true);old.onmessage({data:{...old.request,move:{row:7,col:7}}});
  assert.doesNotMatch(h.root.innerHTML,/class="gm-cell[^\"]*is-hint/);assert.equal(h.moves(),0);
  h.click('hint');const next=h.workers.at(-1);next.onmessage({data:{...next.request,move:{row:7,col:7}}});
  assert.match(h.root.innerHTML,/class="gm-cell[^\"]*is-hint/);assert.equal(h.moves(),0);
 }finally{h.clean();}
});
test('consumer: malformed stored game warns and permits a fresh unsaved game',()=>{
 const store=storage();store.setItem(CURRENT_KEY,'{broken');const h=harness(store);try{
  assert.match(h.root.innerHTML,/could not be restored/);h.change('gm-mode','local2p');h.click('start');h.click('place');
  assert.equal(h.moves(),1);assert.equal(store.getItem(CURRENT_KEY),'{broken');
 }finally{h.clean();}
});
test('consumer: concurrent saved-game update during restart confirmation is preserved',()=>{
 const h=harness();try{
  h.change('gm-mode','local2p');h.click('start');h.click('place');h.change('gm-save',true,true);
  h.click('restart');assert.match(h.root.innerHTML,/End the current game/);
  const game=playMove(createGame({mode:'local2p',humanColor:1,difficulty:'easy'}),0,0);
  const newer=serializeSave(game,'another-owner','new-save');h.store.setItem(CURRENT_KEY,newer);
  h.click('confirm-yes');assert.equal(h.moves(),1);assert.equal(h.store.getItem(CURRENT_KEY),newer);
  assert.match(h.root.innerHTML,/The saved game changed in another tab/);
 }finally{h.clean();}
});
test('consumer: win locks further moves and replay resets the board',()=>{
 const h=harness();try{
  h.change('gm-mode','local2p');h.click('start');
  for(const [r,c] of [[0,0],[2,0],[0,1],[2,1],[0,2],[2,2],[0,3],[2,3],[0,4]]){h.cell(r,c);h.click('place');}
  assert.match(h.root.innerHTML,/Black wins/);assert.equal(h.moves(),9);
  h.cell(14,14);h.click('place');assert.equal(h.moves(),9);
  h.click('restart');assert.equal(h.moves(),0);assert.doesNotMatch(h.root.innerHTML,/Black wins/);
 }finally{h.clean();}
});
