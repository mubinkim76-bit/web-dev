import QRCode from '../vendor/qr/index.js';
import levels from '../vendor/qr/QRErrorCorrectLevel.js';
export function encodeQR(text, mode = 'text') {
  if (typeof text !== 'string' || !text.trim()) throw new Error('EMPTY');
  if (new TextEncoder().encode(text).length > 500) throw new Error('LIMIT_500_BYTES');
  // Lone surrogates would be silently replaced by TextEncoder: reject instead.
  if (/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(text)) throw new Error('INVALID_UNICODE');
  if (!['text', 'url'].includes(mode)) throw new Error('MODE');
  if (mode === 'url') {
    let url; try { url = new URL(text); } catch { throw new Error('HTTP_URL'); }
    if (!['http:', 'https:'].includes(url.protocol) || text !== text.trim() || /[\u0000-\u0020\u007f]/.test(text) || !url.hostname || url.username || url.password) throw new Error('HTTP_URL');
  }
  const qr = new QRCode(-1, levels.M); qr.addData(text); qr.make();
  return qr.modules.map(row => row.map(Boolean));
}
export function qrSvg(matrix, pixelSize = 640) {
  if (!Number.isInteger(pixelSize) || pixelSize<64 || pixelSize>4096 || !Array.isArray(matrix) || !matrix.length || matrix.length>177 || matrix.some(r => !Array.isArray(r)||r.length !== matrix.length||r.some(x=>typeof x!=='boolean'))) throw new Error('MATRIX');
  const n = matrix.length + 8;
  const rects = matrix.flatMap((row, y) => row.flatMap((value, x) => value ? [`M${x+4} ${y+4}h1v1h-1z`] : [])).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${pixelSize}" height="${pixelSize}" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges"><rect width="${n}" height="${n}" fill="white"/><path d="${rects}" fill="black"/></svg>`;
}
