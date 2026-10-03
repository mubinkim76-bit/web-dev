import test from 'node:test';
import assert from 'node:assert/strict';
import { BLACK, WHITE, SIZE, createGame, playMove, winningLines, replayMoves, undoCount, undoMove, moveError } from '../src/lib/gomoku-engine.js';
import { GomokuSession } from '../src/lib/gomoku-session.js';
import { chooseMove } from '../src/lib/gomoku-ai.js';
import { CURRENT_KEY, SETTINGS_KEY, parseSave, serializeSave, readCurrent, writeCurrent, clearCurrent } from '../src/lib/gomoku-storage.js';
const local = { mode: 'local2p', humanColor: BLACK, difficulty: 'easy' };
const ai = humanColor => ({ mode: 'ai', humanColor, difficulty: 'easy' });
const add = (game, row, col) => { const next = playMove(game, row, col); assert.notEqual(next, game, `legal move ${row},${col}`); return next; };
function lineGame(color, points) {
  let game = createGame(local, 'fixture');
  const filler = i => ({ row: 14, col: i * 2 });
  for (let i = 0; i < points.length; i++) {
    const target = points[i], safe = filler(i);
    if (color === WHITE) game = add(game, safe.row, safe.col);
    game = add(game, target.row, target.col);
    if (color === BLACK && i < points.length - 1) game = add(game, safe.row, safe.col);
  }
  return game;
}
for (const color of [BLACK, WHITE]) {
  for (const [label, row, col, dr, dc] of [['horizontal', 0, 0, 0, 1], ['vertical', 0, 0, 1, 0], ['diagonal', 1, 1, 1, 1], ['anti-diagonal', 0, 14, 1, -1]]) {
    test(`G11-T01 ${color} wins on ${label}`, () => {
      const points = Array.from({ length: 5 }, (_, i) => ({ row: row + i * dr, col: col + i * dc }));
      const game = lineGame(color, points);
      assert.equal(game.status, 'won'); assert.equal(game.winner, color);
      assert.equal(game.winningLines.length, 1); assert.equal(game.winningLines[0].length, 5);
      assert.deepEqual(new Set(game.winningLines[0].map(x => `${x.row},${x.col}`)), new Set(points.map(x => `${x.row},${x.col}`)));
    });
  }
  test(`G11-T03 ${color} wins with six by filling a gap`, () => {
    const game = lineGame(color, [0, 1, 2, 4, 5, 3].map(col => ({ row: 5, col })));
    assert.equal(game.winner, color); assert.equal(game.winningLines[0].length, 6);
  });
}
test('G11-T02 gaps, opposing stones and zigzags do not win', () => {
  for (const points of [[[4,0],[4,1],[4,2],[4,4],[4,5]], [[0,0],[1,1],[2,0],[3,1],[4,0]]]) {
    const board = Array(225).fill(0);
    for (const [row,col] of points) board[row * 15 + col] = BLACK;
    for (const [row,col] of points) assert.deepEqual(winningLines(board,row,col,BLACK),[]);
  }
  const board = Array(225).fill(0); for (let col=0;col<6;col++) board[60+col]=BLACK; board[63]=WHITE;
  assert.deepEqual(winningLines(board,4,4,BLACK),[]);
});
test('G11-T04 double-three and double-four placements are legal', () => {
  for (const offsets of [[-1, 1], [-2, -1, 1]]) {
    const board = Array(225).fill(0);
    for (const offset of offsets) { board[7*15+7+offset]=BLACK; board[(7+offset)*15+7]=BLACK; }
    const game = { ...createGame(local), board };
    const next = playMove(game,7,7); assert.notEqual(next,game); assert.equal(next.status,'playing');
  }
});
function fullBoardFixture(finalWin = false) {
  const board = Array.from({length:225},(_,i)=>(Math.floor(i/15)+Math.floor((i%15)/2))%2===0 ? BLACK : WHITE);
  if (finalWin) { board[2]=BLACK; board[3]=BLACK; board[17]=WHITE; board[21]=WHITE; }
  const black=[],white=[];
  board.forEach((color,index)=>(color===BLACK?black:white).push({row:Math.floor(index/15),col:index%15}));
  if (finalWin) { const index=black.findIndex(x=>x.row===0&&x.col===2); black.push(...black.splice(index,1)); }
  const moves=[];
  black.forEach((move,index)=>{moves.push(move); if(white[index])moves.push(white[index]);});
  return moves;
}
test('G11-T05 fixed 225-move legal nonwinning fixture draws', () => {
  const moves = fullBoardFixture();
  const game = replayMoves(moves,local,'draw-fixture');
  assert.equal(game.moves.length,225); assert.equal(game.status,'draw'); assert.equal(game.winner,null);
  assert.equal(game.board.filter(x=>x===BLACK).length,113); assert.equal(game.board.filter(x=>x===WHITE).length,112);
  let live=createGame(local,'draw-fixture');
  for(const move of moves) live=add(live,move.row,move.col);
  assert.deepEqual(live,game);
});
test('G11-T05 final 225th move wins before draw evaluation', () => {
  const moves=fullBoardFixture(true);
  const before=replayMoves(moves.slice(0,-1),local); assert.equal(before.status,'playing');
  const final=moves.at(-1),game=add(before,final.row,final.col);
  assert.equal(game.moves.length,225); assert.equal(game.status,'won'); assert.equal(game.winner,BLACK);
});
test('G11-T06 one move can produce two consistently marked winning lines',()=>{
  const board=Array(225).fill(0);
  for(const d of [-2,-1,1,2]){board[7*15+7+d]=BLACK;board[(7+d)*15+7]=BLACK;}
  const game=playMove({...createGame(local),board},7,7);
  assert.equal(game.status,'won');assert.equal(game.winningLines.length,2);
});
test('G11-T07 invalid moves preserve object identity, board and revision',()=>{
  const initial=createGame(local), game=add(initial,7,7);
  for(const [r,c,color,revision] of [[7,7,WHITE,1],[-1,0,WHITE,1],[0,15,WHITE,1],[.5,0,WHITE,1],[NaN,0,WHITE,1],[0,0,BLACK,1],[0,0,WHITE,0]]) assert.equal(playMove(game,r,c,color,revision),game);
  assert.equal(initial.board[112],0);assert.equal(game.revision,1);
  const won=lineGame(BLACK,[0,1,2,3,4].map(col=>({row:1,col})));
  assert.equal(playMove(won,10,10),won);assert.equal(moveError(won,10,10),'finished');
});
test('G11-T08 many valid partial games equal replay with alternating counts',()=>{
  const fixture=fullBoardFixture();
  for(let count=0;count<=225;count+=7){
    const game=replayMoves(fixture.slice(0,count),local,'property');
    assert.equal(game.board.filter(Boolean).length,count);
    assert.equal(game.board.filter(x=>x===BLACK).length,Math.ceil(count/2));
    assert.equal(game.board.filter(x=>x===WHITE).length,Math.floor(count/2));
  }
});
test('local undo removes one move and monotonically advances revision',()=>{
  let game=createGame(local);game=add(game,7,7);game=add(game,7,8);
  assert.equal(undoCount(game),1);const next=undoMove(game);assert.equal(next.moves.length,1);assert.equal(next.revision,3);assert.equal(next.turn,WHITE);
});
test('AI undo before reply removes one, after reply removes two',()=>{
  const session=new GomokuSession(ai(BLACK));
  session.play(7,7);assert.equal(undoCount(session.game),1);
  const pending=session.begin('ai');assert.equal(session.receive({...pending,move:{row:7,col:8}}).ok,true);
  assert.equal(undoCount(session.game),2);session.undo();assert.equal(session.game.moves.length,0);assert.equal(session.game.turn,BLACK);
});
test('AI first move cannot be undone until the white human has moved',()=>{
  const session=new GomokuSession(ai(WHITE));const first=session.begin('ai');
  session.receive({...first,move:{row:7,col:7}});assert.equal(undoCount(session.game),0);assert.equal(session.undo(),false);
  session.play(7,8);assert.equal(undoCount(session.game),1);session.undo();assert.equal(session.game.moves.length,1);
});
for (const action of ['reset', 'undo', 'cancel']) test(`AI ${action} invalidates stale response without a stone`,()=>{
  const session=new GomokuSession(ai(BLACK));session.play(7,7);const request=session.begin('ai');
  session[action]();const snapshot=session.game;
  assert.deepEqual(session.receive({...request,move:{row:7,col:8}}),{ok:false,stale:true});assert.equal(session.game,snapshot);
});
test('AI rejects invalid, occupied, duplicate and mismatched token replies',()=>{
  for(const move of [{row:-1,col:0},{row:7,col:7},{row:0,col:99}]){
    const session=new GomokuSession(ai(BLACK));session.play(7,7);const request=session.begin('ai'),before=session.game;
    assert.deepEqual(session.receive({...request,move}),{ok:false,error:true});assert.equal(session.game,before);
  }
  const session=new GomokuSession(ai(BLACK));session.play(7,7);const request=session.begin('ai');
  assert.equal(session.receive({...request,requestId:'wrong',move:{row:8,col:7}}).stale,true);
  assert.equal(session.receive({...request,move:{row:8,col:7}}).ok,true);
  const after=session.game;assert.equal(session.receive({...request,move:{row:8,col:8}}).stale,true);assert.equal(session.game,after);
});
test('hint never places, and a subsequent move invalidates its response',()=>{
  const session=new GomokuSession(ai(BLACK));const request=session.begin('hint');
  const response=session.receive({...request,move:{row:7,col:7},reason:'pattern'});assert.equal(response.ok,true);assert.equal(session.game.moves.length,0);
  const old=session.begin('hint');session.play(7,7);assert.equal(session.receive({...old,move:{row:6,col:6}}).stale,true);
});
test('AI human input on AI turn is ignored, repeated input does not double place',()=>{
  const session=new GomokuSession(ai(BLACK));assert.equal(session.play(7,7),true);assert.equal(session.play(7,8),false);assert.equal(session.game.moves.length,1);
  const two=new GomokuSession(local);assert.equal(two.play(7,7),true);assert.equal(two.play(7,7),false);assert.equal(two.game.moves.length,1);
});
test('AI starts centrally, takes an immediate win and blocks immediate loss',()=>{
  assert.deepEqual(chooseMove(Array(225).fill(0),BLACK).move,{row:7,col:7});
  for(const side of [BLACK,WHITE]){
    const board=Array(225).fill(0);for(let c=0;c<4;c++)board[7*15+c]=side;
    const result=chooseMove(board,BLACK);
    assert.deepEqual(result.move,{row:7,col:4});assert.equal(result.reason,side===BLACK?'win':'block');
  }
});
test('AI is deterministic, legal and respects node budgets',()=>{
  const board=Array(225).fill(0);board[112]=BLACK;board[113]=WHITE;
  const a=chooseMove(board,BLACK,'normal',{maxNodes:200,maxMs:800}),b=chooseMove(board,BLACK,'normal',{maxNodes:200,maxMs:800});
  assert.deepEqual(a.move,b.move);assert.equal(board[a.move.row*15+a.move.col],0);assert.ok(a.nodes<=200);
  assert.equal(chooseMove(Array(225).fill(BLACK),WHITE),null);
});
function mockStorage(){const data=new Map();return{getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};}
const savedRaw=()=>serializeSave(replayMoves([{row:7,col:7},{row:7,col:8}],local,'save-game'),'owner-1','save-1');
test('local storage defaults off and roundtrip rebuilds game from moves',()=>{
  const storage=mockStorage();assert.deepEqual(readCurrent(storage),{raw:null,saved:null,enabled:false});
  const raw=savedRaw(),result=writeCurrent(storage,raw,null);assert.equal(result.ok,true);
  const saved=readCurrent(storage);assert.equal(saved.enabled,true);assert.equal(saved.saved.game.moves.length,2);assert.equal(saved.saved.game.turn,BLACK);
  assert.equal(clearCurrent(storage),true);assert.equal(storage.getItem(CURRENT_KEY),null);assert.equal(storage.getItem(SETTINGS_KEY),null);
});
test('save revision, rules, enum, coordinate, duplicate and post-win tampering is rejected',()=>{
  const base=JSON.parse(savedRaw());
  const cases=[{schemaVersion:2},{rulesVersion:'renju'},{revision:-1},{revision:1},{mode:'online'},{humanColor:3},{difficulty:'expert'},{gameId:'<script>'},{moves:[{row:20,col:0}]},{moves:[{row:0,col:0},{row:0,col:0}]},{moves:Array(226).fill({row:0,col:0})},{uiSettings:{showNumbers:'yes'}}];
  for(const patch of cases) assert.throws(()=>parseSave(JSON.stringify({...base,...patch})));
  assert.throws(()=>parseSave('{broken'));assert.throws(()=>parseSave(' '.repeat(65537)));
  const won=lineGame(BLACK,[0,1,2,3,4].map(col=>({row:1,col})));
  assert.throws(()=>parseSave(JSON.stringify({...base,revision:100,moves:[...won.moves,{row:10,col:10}]})));
});
test('saved board/winner/turn fields cannot override replayed truth',()=>{
  const tampered={...JSON.parse(savedRaw()),board:Array(225).fill(WHITE),winner:WHITE,turn:WHITE,status:'won'};
  const actual=parseSave(JSON.stringify(tampered)).game;assert.equal(actual.winner,null);assert.equal(actual.status,'playing');assert.equal(actual.turn,BLACK);
});
test('other-tab changes are detected before overwriting a saved game',()=>{
  const storage=mockStorage(),first=savedRaw();assert.equal(writeCurrent(storage,first,null).ok,true);
  const second=serializeSave(createGame(local,'new-game'),'owner-2','save-2');
  assert.equal(writeCurrent(storage,second,null).conflict,true);assert.equal(storage.getItem(CURRENT_KEY),first);
  assert.equal(writeCurrent(storage,second,first).ok,true);
});
test('blocked storage and malformed saved games do not throw through adapter',()=>{
  const blocked={getItem(){throw Error('blocked')},setItem(){throw Error('blocked')},removeItem(){throw Error('blocked')}};
  assert.equal(readCurrent(blocked).error,true);assert.equal(writeCurrent(blocked,savedRaw(),null).unavailable,true);assert.equal(clearCurrent(blocked),false);
  const storage=mockStorage();storage.setItem(CURRENT_KEY,'not JSON');assert.equal(readCurrent(storage).error,true);
});
