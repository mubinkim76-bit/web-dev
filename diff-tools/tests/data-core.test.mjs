import test from 'node:test';import assert from 'node:assert/strict';import {parseCSV, decodeUTF8, diffText, diffCSV, DATA_LIMITS} from '../src/tools/data-core.js';
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
test('Text diff identifies insertions, removals and unchanged lines with coordinates', () => {
  const value = diffText('a\nb\nc', 'a\nx\nc\nd');
  assert.equal(value.added, 2); assert.equal(value.removed, 1); assert.equal(value.same, 2);
  assert.equal(value.entries.find(x => x.before === 'b').oldLine, 2);
  assert.equal(value.entries.find(x => x.after === 'd').newLine, 4);
});
test('Diff comparison flags are explicit and original strings remain intact', () => {
  const value = diffText(' A B ', 'ab', { ignoreWhitespace: true, ignoreCase: true });
  assert.equal(value.same, 1); assert.equal(value.entries[0].before, ' A B '); assert.equal(value.entries[0].after, 'ab');
  assert.equal(diffText('x\r\ny', 'x\ny').lineEndingsDiffer, true);
});
test('Large text diff uses a declared bounded coarse fallback', () => {
  const value = diffText(Array.from({ length: 2100 }, (_, i) => `old${i}`).join('\n'), Array.from({ length: 2100 }, (_, i) => `new${i}`).join('\n'));
  assert.equal(value.coarse, true); assert.equal(value.removed, 2100); assert.equal(value.added, 2100);
});
test('Empty text insertion/deletion are covered', () => {
  assert.equal(diffText('', 'a').added, 1); assert.equal(diffText('a', '').removed, 1); assert.equal(diffText('', '').same, 0);
});
test('CSV keyed diff recognizes addition/deletion/change and preserves string keys', () => {
  const before = parseCSV('id,name\n001,A\n002,B\n003,C'), after = parseCSV('id,name\n001,A\n002,변경\n004,D');
  const value = diffCSV(before, after, { keyColumns: [0] });
  assert.equal(value.added, 1); assert.equal(value.removed, 1); assert.equal(value.changed, 1); assert.equal(value.same, 1);
  assert.deepEqual(value.entries.find(x => x.type === 'changed').columns, [1]);
});
test('CSV diff stops on missing/duplicate keys, invalid columns and schema mismatches', () => {
  const good = parseCSV('id,name\n1,A');
  assert.throws(() => diffCSV(good, good), { code: 'KEY' });
  assert.throws(() => diffCSV(good, good, { keyColumns: [4] }), { code: 'KEY' });
  assert.throws(() => diffCSV(good, parseCSV('id,name\n,A'), { keyColumns: [0] }), { code: 'EMPTY_KEY' });
  assert.throws(() => diffCSV(good, parseCSV('id,name\n1,A\n1,B'), { keyColumns: [0] }), { code: 'DUPLICATE_KEY' });
  assert.throws(() => diffCSV(good, parseCSV('name,id\nA,1'), { keyColumns: [0] }), { code: 'SCHEMA' });
});
test('CSV diff checks collisions created by comparison options', () => {
  const input = parseCSV('id,name\nA B,first\nab,second');
  assert.throws(() => diffCSV(input, input, { keyColumns: [0], ignoreWhitespace: true, ignoreCase: true }), { code: 'DUPLICATE_KEY' });
});

