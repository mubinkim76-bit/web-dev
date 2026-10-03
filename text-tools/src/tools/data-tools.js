import {toolMetrics} from '../measurement.js';
import { setDirty } from '../shared.js';
import { DATA_LIMITS, decodeUTF8, utf8Bytes } from './data-core.js';
const h = (tag, attrs = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'class') node.className = value;
    else if (key in node && key !== 'list') node[key] = value;
    else node.setAttribute(key, value);
  }
  for (const child of children.flat(Infinity)) if (child !== null && child !== undefined) node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  return node;
};
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
// Protect the native textarea before it lays out a huge number of physical lines.
// Keep the previous value intact; the pure text engines retain their byte limits.
function validateTextView(text,t,maxBytes=DATA_LIMITS.textBytes){
 let lines=1;
 for(let i=0;i<text.length;i++){if(text[i]==='\r'){lines++;if(text[i+1]==='\n')i++;}else if(text[i]==='\n')lines++;if(lines>2000)break;}
 if(lines>2000||utf8Bytes(text)>maxBytes)throw new Error(t(`입력창은 최대 ${maxBytes/1048576} MiB·2,000줄입니다. 파일이나 내용을 나누세요. 기존 원문은 유지했습니다.`,`Text inputs support up to ${maxBytes/1048576} MiB and 2,000 lines. Split the file or text. The previous input was preserved.`));
}
function protectTextView(input,t,onBlocked,getMax=()=>DATA_LIMITS.textBytes){
 let accepted=input.value;
 const check=(event,incoming)=>{accepted=input.value;if(typeof incoming!=='string'||event.isComposing)return;const start=input.selectionStart??input.value.length,end=input.selectionEnd??start;
  try{validateTextView(input.value.slice(0,start)+incoming+input.value.slice(end),t,getMax());}catch(error){event.preventDefault();onBlocked(error);}
 };
 input.addEventListener('paste',event=>check(event,event.clipboardData?.getData('text/plain')));
 input.addEventListener('beforeinput',event=>{if(!event.inputType?.startsWith('delete'))check(event,event.data);});
 const reconcile=event=>{if(event.isComposing)return;try{validateTextView(input.value,t,getMax());accepted=input.value;}catch(error){input.value=accepted;event.stopImmediatePropagation();onBlocked(error);}};
 input.addEventListener('input',reconcile);input.addEventListener('compositionend',reconcile);
 return ()=>{accepted=input.value;};
}
function saveFile(metrics,action,text,name,type='text/plain;charset=utf-8') {
 const measurement=metrics.begin(action);
 try{const blob=text instanceof Blob?text:new Blob([text],{type});const url=URL.createObjectURL(blob);
 const anchor=h('a',{href:url,download:name});document.body.append(anchor);
 metrics.success(measurement);metrics.artifact(measurement);metrics.download(action,measurement);
 anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }catch(error){metrics.fail(measurement);throw error;}
}
function job() {
  let active = null;
  const cancel = () => { const current = active; active = null; if (current) { current.worker.terminate(); current.reject(new DOMException('Cancelled', 'AbortError')); } };
  const run = data => { cancel(); return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./data-worker.js', import.meta.url), { type: 'module' });
    const current = { worker, reject }; active = current;
    worker.onmessage = ({ data: response }) => { if (active !== current) return; active = null; worker.terminate(); if (response.error) reject(Object.assign(new Error(response.error.message), response.error)); else resolve(response.result); };
    worker.onerror = () => { if (active !== current) return; active = null; worker.terminate(); reject(new Error('Local worker could not run. Reload the page and try again.')); };
    worker.postMessage(data);
  }); };
  return { run, cancel };
}
const button = (text, onClick, secondary = false) => h('button', { type: 'button', class: `button${secondary ? ' secondary' : ''}`, onClick }, text);
const field = (label, input, note) => h('label', { class: 'field du-field' }, h('span', {}, label), input, note ? h('small', {}, note) : null);
const check = (label, checked = false, onChange = () => {}) => {
  const input = h('input', { type: 'checkbox', checked, onChange }); return { input, node: h('label', { class: 'du-check' }, input, h('span', {}, label)) };
};
function table(headers, rows) { return h('div', { class: 'du-scroll', tabIndex: 0, 'aria-label': 'Scrollable results' }, h('table', { class: 'result-table du-table' }, h('thead', {}, h('tr', {}, headers.map(x => h('th', { scope: 'col' }, x)))), h('tbody', {}, rows.map(row => h('tr', {}, row.map(x => h('td', {}, x))))))); }
function shell(root, context, title, description) {
  const t = context.t || ((ko, en) => context.lang === 'en' ? en : ko);
  root.replaceChildren(h('style', {}, `.du-tools{display:grid;gap:20px}.du-tools [hidden]{display:none!important}.du-tools textarea{width:100%;min-height:220px;resize:vertical;font-family:ui-monospace,monospace;line-height:1.6}.du-tools input:not([type=checkbox]):not([type=file]),.du-tools select{min-height:42px;max-width:100%}.du-tools input[type=checkbox]{width:18px;height:18px;flex:0 0 auto}.du-check{display:flex;align-items:center;gap:9px;min-height:42px}.du-tools .toolbar{display:flex;gap:10px;flex-wrap:wrap;align-items:center}.du-tools .toolbar .button{flex:0 1 auto;max-width:100%}.du-tools .panel{display:grid;gap:14px}.du-field{display:grid;gap:7px}.du-field small,.du-note{color:var(--muted,#54677a);line-height:1.5}.du-scroll{overflow:auto;max-width:100%;max-height:460px}.du-table{width:100%;border-collapse:collapse;text-align:left}.du-table th,.du-table td{border-bottom:1px solid #dce4eb;padding:9px;vertical-align:top;white-space:pre-wrap;overflow-wrap:anywhere;min-width:80px;max-width:420px}.du-table th{position:sticky;top:0;background:var(--surface,#fff)}.du-stats{display:flex;flex-wrap:wrap;gap:10px}.du-stat{padding:10px 14px;border:1px solid #dce4eb;border-radius:10px}.du-status{padding:10px 0;white-space:pre-wrap}.du-error{color:#aa2330}.du-risk{border-left:4px solid #bf7a00;background:#fff8e7;padding:14px;color:#694300}.du-added{background:#eaf7ef;color:#135b35}.du-removed{background:#fff0f0;color:#8e2323}.du-changed{background:#fff8df;color:#6c5200}.du-rule{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.du-rule .button{padding:6px 12px}.du-tools details{border:1px solid #dce4eb;border-radius:10px;padding:12px}.du-tools summary{cursor:pointer;font-weight:650}.du-mapping{display:grid;gap:10px}.du-mapping-row{display:grid;grid-template-columns:minmax(100px,1fr) minmax(130px,2fr) minmax(110px,1fr);gap:10px;align-items:center}.du-tools .grid-2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}.du-tools pre{white-space:pre-wrap;overflow-wrap:anywhere;margin:0}.du-tools .du-subhead{margin:0;font-size:1.08rem}.du-tools .du-count{font-size:.9rem;color:var(--muted,#54677a)}@media(max-width:700px){.du-tools .grid-2{grid-template-columns:1fr}.du-mapping-row{grid-template-columns:1fr}.du-tools textarea{min-height:180px}.du-tools .panel{padding:16px}.du-tools .button{min-height:44px}}`));
  const body = h('section', { class: 'du-tools' }, h('div', {}, h('h2', {}, title), h('p', { class: 'du-note' }, description)), h('div', { class: 'notice' }, t('모든 처리는 현재 브라우저에서만 실행됩니다. 원본 파일은 바뀌지 않으며 새로고침·페이지 이동 시 작업이 사라집니다.', 'Everything runs in this browser. Original files stay unchanged. Refreshing or leaving this page clears the workspace.')));
  body.addEventListener('input', () => setDirty(true)); body.addEventListener('change', () => setDirty(true));
  root.append(body); return { body, t };
}
function statusNode() { return h('div', { class: 'du-status', role: 'status', 'aria-live': 'polite' }); }
function errorStatus(status, error, t) { if (error.name === 'AbortError') return; status.className = 'du-status du-error'; status.textContent = `${t('오류', 'Error')} ${error.code ? `[${error.code}] ` : ''}${error.message}`; }
const delimiters = t => h('select', {}, h('option', { value: ',' }, t('쉼표 (,)', 'Comma (,)')), h('option', { value: '\t' }, t('탭 (TSV)', 'Tab (TSV)')), h('option', { value: ';' }, t('세미콜론 (;)', 'Semicolon (;)')));

function tTitle(context, ko, en) { return context.t ? context.t(ko, en) : context.lang === 'en' ? en : ko; }

export function mountText(root, context = {}) {
  const { body, t } = shell(root, context, tTitle(context, '텍스트 정리와 글자 수', 'Text cleanup & counts'), tTitle(context, '순서를 정한 규칙으로 정리하고 원문과 나란히 확인하세요. 입력 최대 UTF-8 1 MiB·2,000줄.', 'Choose an ordered set of rules and compare with the original. Input maximum: 1 MiB UTF-8 and 2,000 lines.'));
  const metrics=toolMetrics('text');const save=(text,name,type,action='text_export')=>saveFile(metrics,action,text,name,type);
  const work = job(), counter = job(); let alive = true, timer, version = 0, result = null, selected = [];
  const source = h('textarea', { placeholder: t('원문을 붙여넣으세요', 'Paste your original text'), 'aria-label': t('원문', 'Original text') });
  const output = h('textarea', { readOnly: true, 'aria-label': t('정리 결과', 'Cleaned text') });
  const originalCounts = h('div', { class: 'du-count' }), resultCounts = h('div', { class: 'du-count' }), status = statusNode(), ruleList = h('div'), selectedList = h('div');
  const rememberSource=protectTextView(source,t,error=>{metrics.fail(metrics.begin('validate_text_input'),'validation');errorStatus(status,error,t);});
  const labels = { normalizeNewlines: t('줄바꿈을 LF로 통일', 'Normalize line endings to LF'), trimLines: t('각 줄 앞뒤 공백 제거', 'Trim each line'), collapseSpaces: t('연속 공백·탭을 한 칸으로', 'Collapse spaces and tabs'), removeEmptyLines: t('빈 줄 제외', 'Remove empty lines'), deduplicateLines: t('완전히 같은 줄은 첫 줄 유지', 'Keep the first exact duplicate line') };
  const showCounts = (node, counts) => { node.textContent = `${t('인지 문자', 'Graphemes')} ${counts.graphemes.toLocaleString()} · ${t('공백 제외', 'Without whitespace')} ${counts.withoutWhitespace.toLocaleString()} · UTF-8 ${counts.bytes.toLocaleString()} B · ${t('단어', 'Words')} ${counts.words.toLocaleString()} · ${t('줄', 'Lines')} ${counts.lines.toLocaleString()}`; };
  const invalidate = () => { metrics.cancelAction('text_cleanup');metrics.cancelAction('text_count');metrics.cancelAction('text_import');version++; work.cancel(); result = null; output.value = ''; resultCounts.textContent = ''; copy.disabled = download.disabled = true; status.textContent = ''; run.disabled = false; cancel.disabled = true; };
  const refreshCount = () => { clearTimeout(timer); timer = setTimeout(async () => { const measurement=metrics.begin('text_count');if (utf8Bytes(source.value) > DATA_LIMITS.textBytes) { originalCounts.textContent = t('1 MiB 한도를 초과했습니다. 내용을 줄이세요.', 'Over the 1 MiB limit. Shorten the input.');metrics.fail(measurement,'validation');return; } const current = version; const text = source.value; try { const counts = await counter.run({ task: 'count', text }); if (alive && current === version && source.value === text){showCounts(originalCounts, counts);metrics.success(measurement);} } catch (error) { if (alive && current === version){metrics.fail(measurement);errorStatus(status, error, t);} } }, 180); };
  source.addEventListener('input', () => { invalidate(); refreshCount(); });
  const renderRules = () => { selectedList.replaceChildren(h('p', { class: 'du-note' }, t('적용 순서 (위에서 아래)', 'Application order (top to bottom)')), ...selected.map((rule, i) => h('div', { class: 'du-rule' }, h('span', {}, `${i + 1}. ${labels[rule]}`), Object.assign(button(t('위로', 'Up'), () => { [selected[i - 1], selected[i]] = [selected[i], selected[i - 1]]; invalidate(); renderRules(); }, true), { disabled: i === 0 }), Object.assign(button(t('아래로', 'Down'), () => { [selected[i + 1], selected[i]] = [selected[i], selected[i + 1]]; invalidate(); renderRules(); }, true), { disabled: i === selected.length - 1 })))); };
  const checks = Object.entries(labels).map(([rule, label]) => { const item = check(label, false, () => { selected = item.input.checked ? [...selected, rule] : selected.filter(x => x !== rule); invalidate(); renderRules(); }); ruleList.append(item.node); return item; }); renderRules();
  const run = button(t('정리 실행', 'Clean text'), async () => {
    const current = ++version,measurement=metrics.begin('text_cleanup'); status.className = 'du-status'; status.textContent = t('로컬 처리 중…', 'Processing locally…'); run.disabled = true; cancel.disabled = false;
    try { const value = await work.run({ task: 'text', text: source.value, rules: selected }); if (!alive || current !== version) return; result = value; output.value = value.text; showCounts(resultCounts, value.counts); copy.disabled = download.disabled = false;metrics.success(measurement);metrics.artifact(measurement);status.textContent = t(`완료 · ${value.stages.filter(x => x.changed).length}개 규칙이 내용을 변경했습니다.`, `Done · ${value.stages.filter(x => x.changed).length} rules changed the text.`); }
    catch(error){if(error.name==='AbortError')metrics.cancel(measurement);else metrics.fail(measurement);errorStatus(status,error,t);}
    finally { if (alive && current === version) { run.disabled = false; cancel.disabled = true; } }
  });
  const cancel = button(t('취소', 'Cancel'), () => {metrics.cancelAction('text_cleanup','user_cancel');version++;work.cancel();run.disabled = false; cancel.disabled = true; status.textContent = t('취소됨. 원문은 유지됩니다.', 'Cancelled. The original is preserved.'); }, true); cancel.disabled = true;
  const copy = button(t('결과 복사', 'Copy result'), async () => { try { await navigator.clipboard.writeText(result.text); status.textContent = t('결과를 복사했습니다.', 'Result copied.'); } catch { output.focus(); output.select(); status.textContent = t('자동 복사를 사용할 수 없습니다. 선택한 결과를 Ctrl/Cmd+C로 복사하세요.', 'Clipboard unavailable. Press Ctrl/Cmd+C to copy the selected result.'); } }, true); copy.disabled = true;
  const download = button(t('TXT 저장', 'Download TXT'), () => { save(result.text, 'cleaned-text.txt'); status.textContent = t('다운로드 요청됨. 저장한 파일을 열어 확인하세요.', 'Download requested. Open the saved file to verify it.'); }); download.disabled = true;
  const input = h('input', { type: 'file', accept: '.txt,text/plain', onChange: async event => { const file = event.target.files[0]; if (!file) return; invalidate();const current=version,measurement=metrics.begin('text_import');try { if (!/\.txt$/i.test(file.name)) throw new Error(t('TXT 파일을 선택하세요.', 'Choose a TXT file.')); if (file.size > DATA_LIMITS.textBytes) throw new Error(t('파일은 최대 1 MiB입니다.', 'File limit is 1 MiB.')); const text = decodeUTF8(new Uint8Array(await file.arrayBuffer())); if (!alive || current !== version) return; validateTextView(text,t);source.value=text;rememberSource();metrics.success(measurement);refreshCount(); } catch(error){metrics.fail(measurement,'validation');errorStatus(status,error,t);}event.target.value = ''; } });
  body.append(h('div', { class: 'panel' }, field(t('UTF-8 TXT 불러오기', 'Open UTF-8 TXT'), input), h('div', { class: 'grid-2' }, h('div', {}, field(t('원문', 'Original'), source), originalCounts), h('div', {}, field(t('정리본', 'Result'), output), resultCounts)), h('p', { class: 'du-note' }, t('인지 문자는 Unicode grapheme 기준입니다. 단어는 연속 공백으로 분리합니다. Unicode 정규화·숫자·날짜 변환은 하지 않습니다.', 'Characters are Unicode graphemes. Words are split on whitespace. Unicode normalization, numeric conversion, and date conversion are not applied.'))), h('div', { class: 'panel' }, h('h3', { class: 'du-subhead' }, t('정리 규칙', 'Cleanup rules')), ruleList, selectedList, h('div', { class: 'toolbar' }, run, cancel, button(t('규칙 되돌리기', 'Reset rules'), () => { selected = []; checks.forEach(c => { c.input.checked = false; }); invalidate(); renderRules(); }, true), button(t('원문 복원', 'Restore original'), () => { invalidate(); output.value = source.value; status.textContent = t('결과를 원문으로 복원했습니다. 다시 실행하면 새 정리본을 만듭니다.', 'Result restored to the original. Run again to make a cleaned result.'); }, true)), status), h('div', { class: 'toolbar' }, copy, download, button(t('전체 지우기', 'Clear all'), () => { invalidate(); source.value = ''; originalCounts.textContent = ''; counter.cancel(); clearTimeout(timer); setDirty(false); }, true)));
  return () => { metrics.dispose();alive = false; version++; clearTimeout(timer); work.cancel(); counter.cancel(); source.value = output.value = ''; result = null; setDirty(false); };
}
