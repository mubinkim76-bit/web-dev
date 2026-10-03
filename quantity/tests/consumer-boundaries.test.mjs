import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateQuantity,quantityCsv} from '../src/lib/quantity-engine.js';
import {showError} from '../src/tools/auxiliary-ui.js';
test('unknown quantity errors contain no unrelated timezone instruction',()=>{
 for(const lang of [0,1]){const node={};showError(node,new Error('UNIT'),(...s)=>s[lang]);assert.equal(node.hidden,false);assert.equal(node.textContent,lang?'Check the inputs.':'입력값을 확인해 주세요.');}
});
test('room, precision, pack and cost boundaries reject invalid values and allow retry',()=>{
 const room={name:'A',area:'1'};
 for(const rooms of [[],Array(21).fill(room),[{name:'',area:'1'}]])assert.throws(()=>calculateQuantity(rooms));
 for(const area of ['','-1','NaN','1e2','0.0000001'])assert.throws(()=>calculateQuantity([{name:'A',area}]));
 assert.throws(()=>calculateQuantity([{name:'A',area:'1000000'}],{coverage:'0.000001'}),/PACK_LIMIT/);
 assert.throws(()=>calculateQuantity([{name:'A',area:'1001'}],{coverage:'1',waste:'0',price:'1000000000'}),/COST_LIMIT/);
 assert.equal(calculateQuantity(Array(20).fill(room),{coverage:'2',waste:'0'}).packs,10);
});
test('paint costs, selected units and CSV content remain consistent',()=>{
 for(const unit of ['m2','ft2','pyeong']){
 const r=calculateQuantity([{name:'Room, "A"',area:'88'},{name:'B',area:'12'}],{unit,coverage:'12',waste:'10',type:'paint',coats:'2',price:'5'});
 assert.equal(r.packs,19);assert.equal(r.estimatedCost,95);
 const csv=quantityCsv(r);assert(csv.startsWith('\uFEFF'));assert(csv.includes('"Room, ""A"""'));assert(csv.includes('"packs_rounded_up","19","packs"'));
 }
});
