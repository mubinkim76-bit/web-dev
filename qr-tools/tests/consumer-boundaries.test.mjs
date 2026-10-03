import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeQR,qrSvg} from '../src/lib/qr-engine.js';
import {showError} from '../src/tools/auxiliary-ui.js';

test('consumer: rejects empty, invalid URLs, credentials and whitespace',()=>{
 for(const text of ['', '  ', '\n'])assert.throws(()=>encodeQR(text),/EMPTY/);
 for(const text of ['javascript:alert(1)','data:text/plain,x','ftp://example.com','https://u:p@example.com',' https://example.com','https://example.com/a b','not a url'])assert.throws(()=>encodeQR(text,'url'),/HTTP_URL/);
 assert.ok(encodeQR('https://example.com/a?x=한글','url').length);
 assert.ok(encodeQR('javascript:alert(1)','text').length);
});
test('consumer: exact UTF-8 byte limit, surrogate validation and mode validation',()=>{
 for(const text of ['a'.repeat(500),'한'.repeat(166)+'ab','😀'.repeat(125)])assert.ok(encodeQR(text).length);
 for(const text of ['a'.repeat(501),'한'.repeat(167),'😀'.repeat(126)])assert.throws(()=>encodeQR(text),/LIMIT_500_BYTES/);
 for(const text of ['\ud800','\udc00','abc\ud800xyz'])assert.throws(()=>encodeQR(text),/INVALID_UNICODE/);
 assert.throws(()=>encodeQR('value','unsupported'),/MODE/);
});
test('consumer: validation failure does not affect a subsequent successful generation',()=>{
 const before=encodeQR('retry 한글 😀');assert.throws(()=>encodeQR(''),/EMPTY/);
 assert.deepEqual(encodeQR('retry 한글 😀'),before);
});
test('consumer: SVG bounds and untrusted text remains QR data',()=>{
 const matrix=encodeQR('<script>alert(1)</script>');
 for(const size of [256,512,1024]){const svg=qrSvg(matrix,size);assert.ok(svg.includes(`width="${size}"`));assert.ok(!svg.includes('<script>'));}
 for(const size of [0,63,4097,512.5])assert.throws(()=>qrSvg(matrix,size),/MATRIX/);
 for(const matrix of [[],[[true,false]],[[1]]])assert.throws(()=>qrSvg(matrix),/MATRIX/);
});
test('consumer: export error is actionable and does not mention another tool',()=>{
 for(const lang of ['ko','en'])for(const reason of ['PNG','unexpected']){
  const node={hidden:true};showError(node,new Error(reason),(ko,en)=>lang==='en'?en:ko);
  assert.equal(node.hidden,false);assert.ok(!/IANA|시간대|Time zones/.test(node.textContent));
  assert.match(node.textContent,lang==='en'?/try again/i:/다시/);
 }
});
