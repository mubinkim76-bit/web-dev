/** Local-only CSV and text engines. Every parsed CSV cell remains a string. */
export class DataError extends Error {
  constructor(code, message, details = {}) { super(message); this.name = 'DataError'; this.code = code; Object.assign(this, details); }
}
export const DATA_LIMITS = Object.freeze({ bytes: 2 * 1024 * 1024, files: 3, rows: 10000, columns: 100, textBytes: 1024 * 1024 });
export function decodeUTF8(bytes) {
  try { return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); }
  catch { throw new DataError('UTF8', 'UTF-8 decoding failed. Save the file as UTF-8 and try again.'); }
}
export function utf8Bytes(text) { return new TextEncoder().encode(text).length; }
export function parseCSV(input, { delimiter = ',', header = true, maxRows = 50000, maxColumns = 200, maxBytes = 10 * 1024 * 1024 } = {}) {
  if (![',', ';', '\t'].includes(delimiter)) throw new DataError('DELIMITER', 'Choose comma, tab, or semicolon.');
  if (utf8Bytes(input) > maxBytes) throw new DataError('LIMIT', 'CSV exceeds the byte limit. Split the file.');
  const hadBOM = input.startsWith('\uFEFF');
  const text = hadBOM ? input.slice(1) : input;
  if (!text.length) return { headers: [], rows: [], hadBOM };
  const records = []; let row = [], value = '', state = 'start', line = 1, column = 1;
  const fail = message => { throw new DataError('CSV_SYNTAX', `${message} (line ${line}, field ${row.length + 1})`, { row: line, column: row.length + 1 }); };
  const field = () => { row.push(value); value = ''; state = 'start'; if (row.length > maxColumns) throw new DataError('LIMIT', `CSV exceeds ${maxColumns} columns.`, { row: line }); };
  const record = () => { field(); records.push(row); row = []; if (records.length > maxRows + (header ? 1 : 0)) throw new DataError('LIMIT', `CSV exceeds ${maxRows} data rows.`); };
  for (let i = 0; i < text.length; i++, column++) {
    const char = text[i];
    if (state === 'quoted') {
      if (char === '"') { if (text[i + 1] === '"') { value += '"'; i++; } else state = 'after'; }
      else { value += char; if (char === '\n' || (char === '\r' && text[i + 1] !== '\n')) { line++; column = 0; } }
      continue;
    }
    if (char === delimiter) { field(); continue; }
    if (char === '\n' || char === '\r') { record(); if (char === '\r' && text[i + 1] === '\n') i++; line++; column = 0; continue; }
    if (state === 'after') fail('Unexpected character after closing quote');
    if (char === '"') { if (state !== 'start') fail('Quote inside an unquoted field'); state = 'quoted'; continue; }
    value += char; state = 'unquoted';
  }
  if (state === 'quoted') fail('Unclosed quoted field');
  if (state !== 'start' || row.length || value.length || text.endsWith(delimiter)) record();
  const width = records[0]?.length || 0;
  records.forEach((values, index) => { if (values.length !== width) throw new DataError('CSV_WIDTH', `Record ${index + 1}: expected ${width} fields, received ${values.length}.`, { row: index + 1, expected: width, actual: values.length }); });
  const headers = header ? records.shift() : Array.from({ length: width }, (_, i) => `Column ${i + 1}`);
  return { headers: headers || [], rows: records, hadBOM };
}
const compareValue = (value, options) => {
  let result = options.ignoreWhitespace ? value.replace(/\s+/gu, '') : value;
  return options.ignoreCase ? result.toLocaleLowerCase('en-US') : result;
};
/** Exact LCS for <=4 million pairs; larger changed middles become an explicit coarse replacement block. */
export function diffText(before, after, options = {}) {
  if (utf8Bytes(before) > DATA_LIMITS.textBytes || utf8Bytes(after) > DATA_LIMITS.textBytes) throw new DataError('LIMIT', 'Each text must be at most 1 MiB.');
  const a = before === '' ? [] : before.split(/\r\n|\r|\n/), b = after === '' ? [] : after.split(/\r\n|\r|\n/);
  if (a.length > 20000 || b.length > 20000) throw new DataError('LIMIT', 'Each text must contain at most 20,000 lines.');
  const ak = a.map(x => compareValue(x, options)), bk = b.map(x => compareValue(x, options));
  let prefix = 0, suffix = 0; const entries = [];
  while (prefix < a.length && prefix < b.length && ak[prefix] === bk[prefix]) { entries.push({ type: 'same', before: a[prefix], after: b[prefix], oldLine: prefix + 1, newLine: prefix + 1 }); prefix++; }
  while (suffix < a.length - prefix && suffix < b.length - prefix && ak[a.length - suffix - 1] === bk[b.length - suffix - 1]) suffix++;
  const n = a.length - prefix - suffix, m = b.length - prefix - suffix;
  const coarse = (n + 1) * (m + 1) > 4000000;
  let i = 0, j = 0;
  if (!coarse) {
    const width = m + 1, matrix = new Uint32Array((n + 1) * width);
    for (let x = n - 1; x >= 0; x--) for (let y = m - 1; y >= 0; y--) matrix[x * width + y] = ak[prefix + x] === bk[prefix + y] ? matrix[(x + 1) * width + y + 1] + 1 : Math.max(matrix[(x + 1) * width + y], matrix[x * width + y + 1]);
    while (i < n || j < m) {
      if (i < n && j < m && ak[prefix + i] === bk[prefix + j]) { entries.push({ type: 'same', before: a[prefix + i], after: b[prefix + j], oldLine: prefix + i + 1, newLine: prefix + j + 1 }); i++; j++; }
      else if (i < n && (j === m || matrix[(i + 1) * width + j] >= matrix[i * width + j + 1])) { entries.push({ type: 'removed', before: a[prefix + i], oldLine: prefix + i + 1 }); i++; }
      else { entries.push({ type: 'added', after: b[prefix + j], newLine: prefix + j + 1 }); j++; }
    }
  } else {
    for (let x = 0; x < n; x++) entries.push({ type: 'removed', before: a[prefix + x], oldLine: prefix + x + 1 });
    for (let x = 0; x < m; x++) entries.push({ type: 'added', after: b[prefix + x], newLine: prefix + x + 1 });
  }
  for (let k = suffix; k > 0; k--) entries.push({ type: 'same', before: a[a.length - k], after: b[b.length - k], oldLine: a.length - k + 1, newLine: b.length - k + 1 });
  return { entries, added: entries.filter(x => x.type === 'added').length, removed: entries.filter(x => x.type === 'removed').length, same: entries.filter(x => x.type === 'same').length, coarse, lineEndingsDiffer: before !== after && before.replace(/\r\n|\r/g, '\n') === after.replace(/\r\n|\r/g, '\n') };
}
export function diffCSV(before, after, { keyColumns = [], ignoreWhitespace = false, ignoreCase = false } = {}) {
  if (!keyColumns.length) throw new DataError('KEY', 'Select at least one key column.');
  if (before.headers.length !== after.headers.length || before.headers.some((h, i) => h !== after.headers[i])) throw new DataError('SCHEMA', 'CSV headers and column order must match. Use CSV merge/mapping first.');
  if (keyColumns.some(i => !Number.isInteger(i) || i < 0 || i >= before.headers.length)) throw new DataError('KEY', 'Invalid key column.');
  if (before.rows.length + after.rows.length > 20000) throw new DataError('LIMIT', 'CSV diff supports 20,000 total rows.');
  const options = { ignoreWhitespace, ignoreCase };
  const index = (table, side) => {
    const map = new Map();
    table.rows.forEach((row, i) => {
      const values = keyColumns.map(k => compareValue(row[k], options));
      if (values.some(v => v.trim() === '')) throw new DataError('EMPTY_KEY', `${side}: empty key in data row ${i + 1}.`, { row: i + 1 });
      const key = JSON.stringify(values);
      if (map.has(key)) throw new DataError('DUPLICATE_KEY', `${side}: duplicate key in data rows ${map.get(key).row} and ${i + 1}.`, { row: i + 1 });
      map.set(key, { values: row, row: i + 1 });
    }); return map;
  };
  const old = index(before, 'Before'), current = index(after, 'After'), entries = [];
  old.forEach((item, key) => {
    const next = current.get(key);
    if (!next) entries.push({ type: 'removed', before: item.values, oldLine: item.row });
    else {
      const columns = item.values.flatMap((value, i) => compareValue(value, options) === compareValue(next.values[i], options) ? [] : [i]);
      entries.push({ type: columns.length ? 'changed' : 'same', before: item.values, after: next.values, columns, oldLine: item.row, newLine: next.row });
    }
  });
  current.forEach((item, key) => { if (!old.has(key)) entries.push({ type: 'added', after: item.values, newLine: item.row }); });
  return { entries, added: entries.filter(x => x.type === 'added').length, removed: entries.filter(x => x.type === 'removed').length, changed: entries.filter(x => x.type === 'changed').length, same: entries.filter(x => x.type === 'same').length };
}
