// Lightweight DOM contract tests. This is not browser or accessibility-device validation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCSV,mergeCSV } from '../src/tools/data-core.js';
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
        else if (data.task === 'parse') result = data.inputs.map(input => ({ name: input.name, table: parseCSV(input.bytes ? new TextDecoder().decode(input.bytes) : input.text, data.options) }));
        else if (data.task === 'merge') result = mergeCSV(data.sources, data.options);
        else if (data.task === 'diff') result = data.mode === 'text' ? diffText(data.before, data.after, data.options) : diffCSV(parseCSV(data.before), parseCSV(data.after), data.options);
        this.onmessage({ data: { result } });
      } catch (error) { this.onmessage({ data: { error: { message: error.message, code: error.code } } }); }
    }, 1); }
  };
  return { root: new Element('div'), dirty, workers };
}
const { mountCsv } = await import('../src/tools/data-tools.js');

test('CSV sample mapping, duplicate approval, raw risk approval and parse invalidation', async () => {
  const { root, dirty } = setup(); const cleanup = mountCsv(root, { lang: 'en' });
  byText(root, 'button', 'Load two sample files').click(); await settle();
  assert.equal(dirty.at(-1), true); assert.equal(byText(root, 'button', 'Preview cleanup & merge').disabled, false);
  const keys = all(root, node => node.tagName === 'label' && node.textContent === '1. id'); const key = keys.at(-1).children[0]; key.checked = true; key.dispatch('change');
  const policy = labelled(root, '4. Duplicate policy'); policy.value = 'first'; policy.dispatch('change');
  byText(root, 'button', 'Preview cleanup & merge').click(); await settle();
  assert.ok(root.textContent.includes('6 = 4 + 2')); assert.equal(byText(root, 'button', 'Download CSV').disabled, true);
  const approve = checkbox(root, 'I confirm excluding 2 proposed duplicate rows'); approve.checked = true; approve.dispatch('change');
  assert.equal(byText(root, 'button', 'Download CSV').disabled, true);
  const raw = checkbox(root, 'I understand formula execution and auto-formatting risks and want the raw-value CSV'); raw.checked = true; raw.dispatch('change');
  assert.equal(byText(root, 'button', 'Download CSV').disabled, false);
  const mode = labelled(root, 'Export mode'); mode.value = 'protected'; mode.dispatch('change'); assert.ok(root.textContent.includes('Apostrophe prefix added'));
  const delimiter = labelled(root, 'Choose the delimiter explicitly'); delimiter.value = ';'; delimiter.dispatch('change');
  assert.equal(byText(root, 'button', 'Preview cleanup & merge').disabled, true); assert.ok(!search(root, node => node.tagName === 'button' && node.textContent === 'Download CSV')); assert.ok(root.textContent.includes('Input format changed.'));
  byText(root, 'button', 'Clear all').click(); assert.equal(dirty.at(-1), false); cleanup();
});

const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => {resolve=a;reject=b;}); return {promise,resolve,reject}; };
const fileFor = (pending,name='replacement.csv') => ({name,size:20,arrayBuffer:()=>pending.promise});
const bytes = text => new TextEncoder().encode(text).buffer;
test('replacement read blocks merge and rule invalidation until latest file is parsed', async () => {
 const {root}=setup();const cleanup=mountCsv(root,{lang:'en'});
 byText(root,'button','Load two sample files').click();await settle();
 const pending=deferred();labelled(root,'Choose CSV/TSV files (replaces current input)').files=[fileFor(pending)];
 byText(root,'button','Validate selected files').click();
 const merge=byText(root,'button','Preview cleanup & merge');assert.equal(merge.disabled,true);
 checkbox(root,'1. Trim cell whitespace').dispatch('change');assert.equal(merge.disabled,true);
 merge.dispatch('click');pending.resolve(bytes('id,name\nnew,latest'));await settle();await settle();
 assert.equal(merge.disabled,false);merge.click();await settle();assert.ok(root.textContent.includes('1 = 1 + 0'));assert.ok(root.textContent.includes('latest'));cleanup();
});
test('stale replacement failures cannot overwrite newer input or cancellation status', async () => {
 const {root}=setup();const cleanup=mountCsv(root,{lang:'en'});
 byText(root,'button','Load two sample files').click();await settle();
 const old=deferred(),latest=deferred(),input=labelled(root,'Choose CSV/TSV files (replaces current input)');
 input.files=[fileFor(old)];byText(root,'button','Validate selected files').click();
 input.files=[fileFor(latest,'latest.csv')];byText(root,'button','Validate selected files').click();
 latest.resolve(bytes('id\nlatest'));await settle();await settle();old.reject(new Error('STALE FAILURE'));await settle();assert.ok(!root.textContent.includes('STALE FAILURE'));
 byText(root,'button','Preview cleanup & merge').click();await settle();assert.ok(root.textContent.includes('1 = 1 + 0'));
 const cancelled=deferred();input.files=[fileFor(cancelled)];byText(root,'button','Validate selected files').click();byText(root,'button','Cancel').click();cancelled.reject(new Error('CANCELLED FAILURE'));await settle();assert.ok(root.textContent.includes('Cancelled.'));assert.ok(!root.textContent.includes('CANCELLED FAILURE'));cleanup();
});
test('current read failure remains visible and allows retry', async () => {
 const {root}=setup();const cleanup=mountCsv(root,{lang:'en'});byText(root,'button','Load two sample files').click();await settle();
 const pending=deferred();labelled(root,'Choose CSV/TSV files (replaces current input)').files=[fileFor(pending)];byText(root,'button','Validate selected files').click();pending.reject(new Error('READ FAILED'));await settle();
 assert.ok(root.textContent.includes('READ FAILED'));assert.equal(byText(root,'button','Cancel').disabled,true);assert.equal(byText(root,'button','Validate selected files').disabled,false);cleanup();
});
