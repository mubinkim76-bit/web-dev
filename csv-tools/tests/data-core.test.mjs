import test from 'node:test';import assert from 'node:assert/strict';import {parseCSV, decodeUTF8, serializeCSV, formulaRisk, mergeCSV, DATA_LIMITS} from '../src/tools/data-core.js';
const input=text=>({name:'test.csv',table:parseCSV(text)});
const merge=(sources,extra={})=>mergeCSV(sources,{headers:['id','name'],mappings:sources.map(()=>[{index:0},{index:1}]),...extra});
test('CSV preserves BOM metadata, Korean, leading zeros, long integers, dates, quotes and multiline fields', () => {
  const values = [['id', 'value'], ['000123', '12345678901234567890'], ['01/02', '한글'], ['쉼표,', '"인용"'], ['multiline', '첫째\r\n둘째\n셋째']];
  const exported = serializeCSV(values, { bom: true });
  const parsed = parseCSV(exported.text);
  assert.equal(parsed.hadBOM, true); assert.deepEqual([parsed.headers, ...parsed.rows], values);
});
test('Explicit comma/tab/semicolon delimiters round-trip every field as a string', () => {
  for (const delimiter of [',', '\t', ';']) {
    const values = [['A', 'A', ''], ['000', '', 'a\tb;c,d"e\nf']];
    const parsed = parseCSV(serializeCSV(values, { delimiter }).text, { delimiter });
    assert.deepEqual([parsed.headers, ...parsed.rows], values);
  }
});
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
test('Formula candidates include leading control/space and fullwidth prefixes', () => {
  for (const value of ['=1+1', '+CMD', '-1', '@SUM(A1)', '\t=cmd', '\rtext', '\ntext', ' \u0000=2', '\uFEFF+2', '＝1']) assert.equal(formulaRisk(value), true, value);
  for (const value of ['000123', '12345678901234567890', 'A=1', '<script>bad</script>', "'=1"]) assert.equal(formulaRisk(value), false, value);
});
test('Raw export preserves values; experimental mitigation discloses every transformed cell', () => {
  const values = [['id', 'value'], ['000123', '=1+1'], ['12345678901234567890', 'normal']];
  const raw = serializeCSV(values); const protectedExport = serializeCSV(values, { mode: 'protected' });
  assert.deepEqual([parseCSV(raw.text).headers, ...parseCSV(raw.text).rows], values);
  assert.equal(raw.riskyCells.length, 1); assert.equal(raw.changes.length, 0);
  assert.deepEqual(protectedExport.changes, [{ row: 2, column: 2, before: '=1+1', after: "'=1+1", reason: 'formula-prefix' }]);
  assert.equal(parseCSV(protectedExport.text).rows[0][1], "'=1+1");
});
test('CSV quoting prevents delimiter/quote escaping without executing or interpreting cell values', () => {
  const values = [['name'], ['x",=HYPERLINK("evil")'], ['<img src=x onerror=alert(1)>']];
  assert.deepEqual([parseCSV(serializeCSV(values).text).headers, ...parseCSV(serializeCSV(values).text).rows], values);
});
test('Positional mapping supports schema order differences, duplicate headers, and explicit defaults', () => {
  const sources = [input('id,name\n0001,첫째'), input('name,id\n둘째,0002')];
  const value = merge(sources, { mappings: [[{ index: 0 }, { index: 1 }], [{ index: 1 }, { index: 0 }]] });
  assert.deepEqual(value.rows, [['0001', '첫째'], ['0002', '둘째']]);
  const dup = input('name,name\nleft,right');
  assert.deepEqual(merge([dup], { mappings: [[{ index: 1 }, { value: 'missing' }]] }).rows, [['right', 'missing']]);
});
test('Cleanup has a fixed visible sequence and audits only actual value changes', () => {
  const value = merge([input('id,name\n 001 , AA AA \n,')], { rules: { trim: true, removeEmpty: true, replace: { enabled: true, columns: [1], find: 'AA', with: '가' } } });
  assert.deepEqual(value.rows, [['001', '가 가']]); assert.equal(value.changes.length, 2);
  assert.equal(value.changes[1].reason, 'trim, literal-replace'); assert.equal(value.excluded[0].reason, 'empty-row');
  assert.equal(value.inputRows, value.outputRows + value.excluded.length);
});
test('Merge acceptance: 7 rows + 5 rows − 2 explicitly selected duplicates = 10', () => {
  const a = input('id,name\n' + Array.from({ length: 7 }, (_, i) => `${i + 1},a${i}`).join('\n'));
  const b = input('id,name\n7,b0\n6,b1\n8,b2\n9,b3\n10,b4');
  const value = merge([a, b], { dedup: { policy: 'first', keys: [0] } });
  assert.equal(value.inputRows, 12); assert.equal(value.outputRows, 10); assert.equal(value.excluded.length, 2); assert.equal(value.duplicateCandidates.length, 2);
});
test('No automatic dedup; first/last selected policies remain transparent and preserve empty keys', () => {
  const sources = [input('id,name\n1,a\n1,b\n,x\n,y\n1,c')];
  const all = merge(sources); assert.equal(all.rows.length, 5);
  const first = merge(sources, { dedup: { policy: 'first', keys: [0] } }); assert.deepEqual(first.rows, [['1', 'a'], ['', 'x'], ['', 'y']]);
  const last = merge(sources, { dedup: { policy: 'last', keys: [0] } }); assert.deepEqual(last.rows, [['', 'x'], ['', 'y'], ['1', 'c']]);
  assert.equal(last.emptyKeys.length, 2); assert.equal(last.excluded.length, 2);
});
test('Excluding a source is explicit and included in row reconciliation', () => {
  const a = input('id,name\n1,a'), b = { ...input('id,name\n2,b'), excluded: true };
  const value = merge([a, b]); assert.equal(value.inputRows, 2); assert.equal(value.outputRows, 1); assert.equal(value.excluded[0].reason, 'file-excluded');
});
test('Invalid mappings, key columns, and empty literal searches fail clearly', () => {
  const sources = [input('id,name\n1,a')];
  assert.throws(() => merge(sources, { mappings: [[{ index: 2 }, { value: '' }]] }), { code: 'MAPPING' });
  assert.throws(() => merge(sources, { dedup: { policy: 'all', keys: [9] } }), { code: 'DEDUP' });
  assert.throws(() => merge(sources, { dedup: { policy: 'first', keys: [] } }), { code: 'DEDUP' });
  assert.throws(() => merge(sources, { rules: { replace: { enabled: true, find: '', columns: [1] } } }), { code: 'REPLACE' });
});
test('Whitespace-only keys are retained and large replacement expansion is stopped before allocation', () => {
  const result = merge([input('id,name\n ,a\n ,b')], { dedup: { policy: 'first', keys: [0] } });
  assert.equal(result.outputRows, 2); assert.equal(result.emptyKeys.length, 2);
  assert.throws(() => merge([input('id,name\n1,' + 'x'.repeat(1000))], { rules: { replace: { enabled: true, columns: [1], find: 'x', with: 'y'.repeat(10000) } } }), { code: 'LIMIT' });
});
