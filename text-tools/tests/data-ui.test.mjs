// Lightweight DOM contract tests. This is not browser or accessibility-device validation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanText,countText } from '../src/tools/data-core.js';
class Element {
  constructor(tag, text = '') { this.tagName = tag; this.children = []; this.parentNode = null; this.events = new Map(); this.attrs = {}; this._text = text; this._value = undefined; this.checked = false; this.disabled = false; this.hidden = false; this.readOnly = false; this.multiple = false; this.open = false; this.style = {}; this.files = []; }
  append(...nodes) { nodes.forEach(node => { this.children.push(node); node.parentNode = this; }); }
  replaceChildren(...nodes) { this.children.forEach(node => { node.parentNode = null; }); this.children = []; this._text = ''; this.append(...nodes); }
  setAttribute(key, value) { this.attrs[key] = String(value); }
  addEventListener(type, fn) { this.events.set(type, [...(this.events.get(type) || []), fn]); }
  dispatch(type, target = this) { for (const fn of this.events.get(type) || []) fn({ type, target, currentTarget: this }); this.parentNode?.dispatch(type, target); }
  click() { if (!this.disabled) this.dispatch('click'); }
  get textContent() { return this._text + this.children.map(node => node.textContent).join(''); }
  set textContent(value) { this._text = String(value); this.children = []; }
  get value() { return this._value ?? (this.tagName === 'select' ? this.children[0]?.value || '' : ''); }
  set value(value) { this._value = String(value); }
  focus() {} select() {} remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(node => node !== this); }
}
const settle = () => new Promise(resolve => setTimeout(resolve, 15));
function search(node, predicate) { if (predicate(node)) return node; for (const child of node.children) { const found = search(child, predicate); if (found) return found; } }
function all(node, predicate) { return [ ...(predicate(node) ? [node] : []), ...node.children.flatMap(child => all(child, predicate)) ]; }
function byText(root, tag, text) { const value = search(root, node => node.tagName === tag && node.textContent === text); assert.ok(value, `${tag}: ${text}`); return value; }
function byAria(root, label) { const value = search(root, node => node.attrs['aria-label'] === label); assert.ok(value, `label: ${label}`); return value; }
function labelled(root, label) { const node = search(root, node => node.tagName === 'label' && node.children[0]?.textContent === label); assert.ok(node, label); return node.children[1]; }
function checkbox(root, text) { return byText(root, 'label', text).children[0]; }
function setup() {
  globalThis.Node = Element;
  globalThis.document = { createElement: tag => new Element(tag), createTextNode: text => new Element('#text', String(text)), body: new Element('body') };
  globalThis.CustomEvent = class { constructor(type, options) { this.type = type; this.detail = options.detail; } };
  const dirty = [], workers = []; globalThis.window = { dispatchEvent: event => dirty.push(event.detail) };
  globalThis.Worker = class {
    stopped = false;
    constructor() { workers.push(this); }
    terminate() { this.stopped = true; }
    postMessage(data) { setTimeout(() => {
      if (this.stopped) return;
      try {
        let result;
        if (data.task === 'count') result = countText(data.text);
        else if (data.task === 'text') result = cleanText(data.text, data.rules);
        else if (data.task === 'parse') result = data.inputs.map(input => ({ name: input.name, table: parseCSV(input.text, data.options) }));
        else if (data.task === 'merge') result = mergeCSV(data.sources, data.options);
        else if (data.task === 'diff') result = data.mode === 'text' ? diffText(data.before, data.after, data.options) : diffCSV(parseCSV(data.before), parseCSV(data.after), data.options);
        this.onmessage({ data: { result } });
      } catch (error) { this.onmessage({ data: { error: { message: error.message, code: error.code } } }); }
    }, 1); }
  };
  return { root: new Element('div'), dirty, workers };
}
const { mountText } = await import('../src/tools/data-tools.js');

test('Text module mounts, cleans, marks dirty, restores and clears without stale results', async () => {
  const { root, dirty } = setup(); const cleanup = mountText(root, { lang: 'en' });
  const source = byAria(root, 'Original text'); source.value = '  한글  \n  한글  '; source.dispatch('input');
  const trim = checkbox(root, 'Trim each line'); trim.checked = true; trim.dispatch('change');
  const dedup = checkbox(root, 'Keep the first exact duplicate line'); dedup.checked = true; dedup.dispatch('change');
  byText(root, 'button', 'Clean text').click(); await settle();
  assert.equal(byAria(root, 'Cleaned text').value, '한글\n'); assert.equal(byText(root, 'button', 'Download TXT').disabled, false); assert.equal(dirty.at(-1), true);
  byText(root, 'button', 'Restore original').click(); assert.equal(byAria(root, 'Cleaned text').value, source.value);
  byText(root, 'button', 'Clear all').click(); assert.equal(source.value, ''); assert.equal(dirty.at(-1), false); cleanup();
});
test('Terminated worker events cannot kill a newer job or repopulate cleared output', async () => {
  const { root, workers } = setup(); const cleanup = mountText(root, { lang: 'en' });
  const source = byAria(root, 'Original text'); source.value = 'first'; source.dispatch('input');
  byText(root, 'button', 'Clean text').click(); const oldWorker = workers.at(-1);
  source.value = 'second'; source.dispatch('input'); byText(root, 'button', 'Clean text').click(); const newWorker = workers.at(-1);
  oldWorker.onmessage({ data: { result: cleanText('stale') } });
  assert.equal(newWorker.stopped, false); await settle(); assert.equal(byAria(root, 'Cleaned text').value, 'second');
  byText(root, 'button', 'Clean text').click(); const clearedWorker = workers.at(-1); byText(root, 'button', 'Clear all').click();
  clearedWorker.onmessage({ data: { result: cleanText('must not return') } }); await settle(); assert.equal(byAria(root, 'Cleaned text').value, ''); cleanup();
});
