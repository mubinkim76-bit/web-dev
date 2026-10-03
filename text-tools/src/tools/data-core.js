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
export function countText(text) {
  if (!Intl.Segmenter) throw new DataError('SEGMENTER', 'This browser does not support accurate grapheme counting. Use a current browser.');
  let graphemes = 0, withoutWhitespace = 0;
  for (const { segment } of new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)) { graphemes++; if (!/^\s+$/u.test(segment)) withoutWhitespace++; }
  return { graphemes, withoutWhitespace, bytes: utf8Bytes(text), words: text.trim() ? text.trim().split(/\s+/u).length : 0, lines: text ? text.split(/\r\n|\n|\r/).length : 0 };
}
export const TEXT_RULES = ['normalizeNewlines', 'trimLines', 'collapseSpaces', 'removeEmptyLines', 'deduplicateLines'];
export function cleanText(text, rules = []) {
  if (utf8Bytes(text) > DATA_LIMITS.textBytes) throw new DataError('LIMIT', 'Text exceeds 1 MiB. Split the text.');
  let result = text; const stages = [];
  for (const rule of rules) {
    const before = result;
    if (rule === 'normalizeNewlines') result = result.replace(/\r\n|\r/g, '\n');
    else if (rule === 'trimLines') result = result.replace(/^[^\S\r\n]+|[^\S\r\n]+$/gm, '');
    else if (rule === 'collapseSpaces') result = result.replace(/[^\S\r\n]+/gu, ' ');
    else if (rule === 'removeEmptyLines' || rule === 'deduplicateLines') {
      const seen = new Set(); const records = result.match(/[^\r\n]*(?:\r\n|\r|\n|$)/g)?.filter(Boolean) || [];
      result = records.filter(record => {
        const value = record.replace(/(?:\r\n|\r|\n)$/, '');
        if (rule === 'removeEmptyLines') return value.trim() !== '';
        if (seen.has(value)) return false; seen.add(value); return true;
      }).join('');
    } else throw new DataError('RULE', `Unknown text rule: ${rule}`);
    stages.push({ rule, changed: before !== result });
  }
  return { text: result, stages, originalCounts: countText(text), counts: countText(result) };
}
