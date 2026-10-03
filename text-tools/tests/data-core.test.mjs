import test from 'node:test';import assert from 'node:assert/strict';import {decodeUTF8, countText, cleanText, DATA_LIMITS} from '../src/tools/data-core.js';
test('Strict UTF-8 rejects invalid sequences, preserves BOM and Korean', () => {
  assert.throws(() => decodeUTF8(new Uint8Array([0xc3, 0x28])), { code: 'UTF8' });
  assert.equal(decodeUTF8(new Uint8Array([0xef, 0xbb, 0xbf, 0xed, 0x95, 0x9c])), '\uFEFF한');
});
test('Unicode grapheme counts cover combining Hangul, family emoji, accents and CRLF', () => {
  const text = '한 👨‍👩‍👧‍👦 e\u0301\r\n';
  assert.deepEqual(countText(text), { graphemes: 6, withoutWhitespace: 3, bytes: Buffer.byteLength(text), words: 3, lines: 2 });
  assert.deepEqual(countText(''), { graphemes: 0, withoutWhitespace: 0, bytes: 0, words: 0, lines: 0 });
});
test('Text cleanup is ordered, non-mutating and literal', () => {
  const original = '  a  a \r\n\r\n  a  a \r\n끝';
  const result = cleanText(original, ['normalizeNewlines', 'trimLines', 'collapseSpaces', 'removeEmptyLines', 'deduplicateLines']);
  assert.equal(result.text, 'a a\n끝'); assert.equal(original, '  a  a \r\n\r\n  a  a \r\n끝'); assert.equal(result.stages.length, 5);
  assert.equal(cleanText('e\u0301', []).text, 'e\u0301');
});
test('Text cleanup preserves CRLF without explicit normalization', () => {
  assert.equal(cleanText('a\r\na\r\nb', ['deduplicateLines']).text, 'a\r\nb');
});
test('Text limit and unknown rule fail', () => {
  assert.throws(() => cleanText('x'.repeat(DATA_LIMITS.textBytes + 1)), { code: 'LIMIT' });
  assert.throws(() => cleanText('x', ['unknown']), { code: 'RULE' });
});
