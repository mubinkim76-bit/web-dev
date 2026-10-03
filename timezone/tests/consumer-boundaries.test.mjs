import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveLocal,findOverlaps,makeIcs} from '../src/lib/timezone-engine.js';
const start=Date.parse('2026-10-03T00:00:00Z');
const row=(zone='UTC',from='09:00',until='17:00')=>({zone,start:from,end:until});
test('consumer: invalid zone/date rejected and following valid input recovers',()=>{
 for(const [date,zone] of [['2026-10-03T12:00','Invalid/Zone'],['','UTC'],['1969-12-31T23:59','UTC'],['2101-01-01T00:00','UTC']])assert.throws(()=>resolveLocal(date,zone));
 assert.deepEqual(resolveLocal('2026-10-03T12:00','Asia/Kathmandu'),[Date.parse('2026-10-03T06:15:00Z')]);
});
test('consumer: no overlap, empty and excessive zone lists, invalid hours',()=>{
 assert.deepEqual(findOverlaps(start,[row('UTC','09:00','10:00'),row('UTC','11:00','12:00')],60,1),[]);
 for(const rows of [[],Array(7).fill(row()),[row('UTC','25:00','26:00')],[row('UTC','09:00','09:00')]])assert.throws(()=>findOverlaps(start,rows));
 assert.equal(findOverlaps(start,Array(6).fill(row()),60,1).length,15);
});
test('consumer: search duration/horizon limits and 30-result cap',()=>{
 for(const duration of [0,45,270,NaN])assert.throws(()=>findOverlaps(start,[row()],duration));
 for(const days of [0,8,1.5])assert.throws(()=>findOverlaps(start,[row()],60,days));
 assert.equal(findOverlaps(start,[row()],30,7).length,30);
 assert.ok(findOverlaps(start,[row()],240,1).every(ms=>ms>=start&&ms+240*60000<=start+86400000));
});
test('consumer: selecting either DST fold yields distinct exact UTC calendar times',()=>{
 const times=resolveLocal('2026-11-01T01:30','America/New_York');
 assert.equal(times.length,2);
 for(const [i,stamp] of ['20261101T053000Z','20261101T063000Z'].entries())assert.ok(makeIcs(times[i],30,'Meeting','consumer-fold',start).includes(`DTSTART:${stamp}\r\n`));
});
test('consumer: UTC ICS crosses year boundary, folds Unicode and rejects invalid exports',()=>{
 const ics=makeIcs(Date.parse('2026-12-31T23:30:00Z'),90,'한😀'.repeat(40),'consumer-export',start);
 assert.ok(ics.includes('DTEND:20270101T010000Z\r\n'));
 assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
 for(const line of ics.split('\r\n'))assert.ok(Buffer.byteLength(line)<=75);
 for(const args of [[NaN],[start,0],[start,60,'x'.repeat(201)],[start,60,'Title','bad\r\nUID']])assert.throws(()=>makeIcs(...args));
});
