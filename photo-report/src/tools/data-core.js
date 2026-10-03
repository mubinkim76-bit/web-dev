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
