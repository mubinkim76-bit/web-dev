import test from 'node:test';import assert from 'node:assert/strict';import {parseCSV, decodeUTF8, DATA_LIMITS} from '../src/tools/data-core.js';
const input=text=>({name:'test.csv',table:parseCSV(text)});
test('Header-less input gets positional labels and retains the first data row', () => {
  assert.deepEqual(parseCSV('a,b\r\nc,d', { header: false }), { headers: ['Column 1', 'Column 2'], rows: [['a', 'b'], ['c', 'd']], hadBOM: false });
});
test('Empty file, trailing delimiter, empty fields, and terminal CRLF are deterministic', () => {
  assert.deepEqual(parseCSV('').rows, []);
  assert.deepEqual(parseCSV('h1,h2\r\n,\r\n').rows, [['', '']]);
  assert.deepEqual(parseCSV('h1,h2\nfoo,').rows, [['foo', '']]);
});
test('Unclosed quote, stray quote, and characters after closing quote fail with coordinates', () => {
  for (const malformed of ['a,b\n"x,y', 'a,b\nx"y,z', 'a,b\n"x"x,y']) assert.throws(() => parseCSV(malformed), e => e.code === 'CSV_SYNTAX' && e.row === 2);
});
test('Uneven CSV widths fail without deleting records', () => {
  assert.throws(() => parseCSV('a,b\nx,y,z'), e => e.code === 'CSV_WIDTH' && e.row === 2 && e.expected === 2 && e.actual === 3);
});
test('CSV limits are data-row-based, excluding header and quoted newlines', () => {
  assert.equal(parseCSV('h\n"a\nb"', { maxRows: 1 }).rows.length, 1);
  assert.throws(() => parseCSV('h\na\nb', { maxRows: 1 }), { code: 'LIMIT' });
  assert.throws(() => parseCSV('a,b', { maxColumns: 1 }), { code: 'LIMIT' });
  assert.throws(() => parseCSV('한글', { maxBytes: 5 }), { code: 'LIMIT' });
});
test('Strict UTF-8 rejects invalid sequences, preserves BOM and Korean', () => {
  assert.throws(() => decodeUTF8(new Uint8Array([0xc3, 0x28])), { code: 'UTF8' });
  assert.equal(decodeUTF8(new Uint8Array([0xef, 0xbb, 0xbf, 0xed, 0x95, 0x9c])), '\uFEFF한');
});
