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
/** Recognizes common formula prefixes after whitespace/control characters. This is not a spreadsheet safety guarantee. */
export function formulaRisk(value) { return /^(?:[\s\u0000-\u001f\u007f-\u009f\uFEFF]*[=+\-@＝＋－＠]|[\t\r\n])/u.test(value); }
export function serializeCSV(rows, { delimiter = ',', bom = false, mode = 'raw' } = {}) {
  if (![',', ';', '\t'].includes(delimiter) || !['raw', 'protected'].includes(mode)) throw new DataError('EXPORT', 'Invalid export options.');
  const changes = [], riskyCells = [];
  const text = rows.map((row, r) => row.map((cell, c) => {
    const before = String(cell); let after = before;
    if (formulaRisk(before)) {
      riskyCells.push({ row: r + 1, column: c + 1, before });
      if (mode === 'protected') { after = `'${before}`; changes.push({ row: r + 1, column: c + 1, before, after, reason: 'formula-prefix' }); }
    }
    return `"${after.replaceAll('"', '""')}"`;
  }).join(delimiter)).join('\r\n');
  return { text: (bom ? '\uFEFF' : '') + text, changes, riskyCells };
}
function keyFor(row, keys, ignoreCase) { return JSON.stringify(keys.map(i => ignoreCase ? row[i].toLocaleLowerCase('en-US') : row[i])); }
/** mappings[file][target] = {index:number} or {value:string}. Dedup deletion is only a proposal until UI confirmation. */
export function mergeCSV(sources, { headers, mappings, rules = {}, dedup = { policy: 'all', keys: [] } }) {
  if (!headers?.length || headers.length > DATA_LIMITS.columns) throw new DataError('MAPPING', 'Choose 1–100 output columns.');
  if (!['all', 'first', 'last'].includes(dedup.policy)) throw new DataError('DEDUP', 'Choose a duplicate policy.');
  const keys = dedup.keys || [];
  if ((dedup.policy !== 'all' && !keys.length) || keys.some(i => !Number.isInteger(i) || i < 0 || i >= headers.length)) throw new DataError('DEDUP', 'Select valid duplicate key columns.');
  if (rules.replace?.enabled && !rules.replace.find) throw new DataError('REPLACE', 'The search string cannot be empty.');
  if (sources.reduce((sum, source) => sum + source.table.rows.length, 0) > DATA_LIMITS.rows) throw new DataError('LIMIT', `At most ${DATA_LIMITS.rows} input rows are supported in this build.`);
  if (headers.some(value => utf8Bytes(String(value)) > 10000)) throw new DataError('LIMIT', 'Output headers are limited to 10,000 UTF-8 bytes each.');
  if (rules.replace?.enabled && (utf8Bytes(rules.replace.find) > 10000 || utf8Bytes(rules.replace.with || '') > 10000)) throw new DataError('LIMIT', 'Find and replacement strings are limited to 10,000 UTF-8 bytes.');
  let outputBytes = 0;
  const changes = [], excluded = [], emptyKeys = [], candidates = []; let inputRows = 0;
  sources.forEach((source, s) => {
    if (source.excluded) { source.table.rows.forEach((row, r) => excluded.push({ source: s, row: r + 1, reason: 'file-excluded' })); inputRows += source.table.rows.length; return; }
    if (!mappings[s] || mappings[s].length !== headers.length) throw new DataError('MAPPING', `Complete the mapping for file ${s + 1}.`);
    for (let r = 0; r < source.table.rows.length; r++) {
      inputRows++; const original = source.table.rows[r];
      const values = mappings[s].map((mapping, c) => {
        if (Number.isInteger(mapping?.index) && (mapping.index < 0 || mapping.index >= source.table.headers.length)) throw new DataError('MAPPING', 'A mapped column is out of range.');
        const before = Number.isInteger(mapping?.index) ? original[mapping.index] : String(mapping?.value ?? '');
        if (!Number.isInteger(mapping?.index) && utf8Bytes(before) > 10000) throw new DataError('LIMIT', 'Custom default values are limited to 10,000 UTF-8 bytes.');
        let after = before; const reasons = [];
        if (rules.trim) { const next = after.trim(); if (next !== after) reasons.push('trim'); after = next; }
        if (rules.replace?.enabled && rules.replace.columns.includes(c)) { const pieces = after.split(rules.replace.find); const estimate = utf8Bytes(after) + (pieces.length - 1) * (utf8Bytes(rules.replace.with || '') - utf8Bytes(rules.replace.find)); if (estimate > 2 * 1024 * 1024 || estimate + outputBytes > 10 * 1024 * 1024) throw new DataError('LIMIT', 'Replacement output is too large. Reduce the replacement or split the job.'); const next = pieces.join(rules.replace.with || ''); if (next !== after) reasons.push('literal-replace'); after = next; }
        outputBytes += utf8Bytes(after); if (outputBytes > 10 * 1024 * 1024) throw new DataError('LIMIT', 'Mapped output exceeds the 10 MiB working limit. Split the job.');
        if (before !== after) changes.push({ source: s, row: r + 1, column: c + 1, before, after, reason: reasons.join(', ') });
        return after;
      });
      if (rules.removeEmpty && values.every(v => v === '')) excluded.push({ source: s, row: r + 1, reason: 'empty-row' });
      else candidates.push({ values, source: s, row: r + 1 });
    }
  });
  if (inputRows > DATA_LIMITS.rows) throw new DataError('LIMIT', `At most ${DATA_LIMITS.rows} input rows are supported in this build.`);
  const owners = new Map(), removed = new Set(), duplicateCandidates = [];
  if (keys.length) candidates.forEach((item, i) => {
    if (keys.some(k => item.values[k].trim() === '')) { emptyKeys.push({ source: item.source, row: item.row }); return; }
    const key = keyFor(item.values, keys, dedup.ignoreCase);
    if (!owners.has(key)) { owners.set(key, i); return; }
    const previous = owners.get(key);
    duplicateCandidates.push({ source: item.source, row: item.row, matches: { source: candidates[previous].source, row: candidates[previous].row } });
    if (dedup.policy === 'first') removed.add(i);
    if (dedup.policy === 'last') { removed.add(previous); owners.set(key, i); }
  });
  removed.forEach(i => excluded.push({ source: candidates[i].source, row: candidates[i].row, reason: `duplicate-keep-${dedup.policy}` }));
  const kept = candidates.filter((_, i) => !removed.has(i));
  return { headers: [...headers], rows: kept.map(i => i.values), origins: kept.map(({ source, row }) => ({ source, row })), changes, excluded, emptyKeys, duplicateCandidates, inputRows, outputRows: kept.length };
}
