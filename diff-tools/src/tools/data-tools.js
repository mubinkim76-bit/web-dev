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

export function mountDiff(root, context = {}) {
  const { body, t } = shell(root, context, tTitle(context, '텍스트·CSV 변경 비교', 'Text & CSV diff'), tTitle(context, '추가·삭제·변경을 직접 검토하세요. 텍스트 각 1 MiB, CSV 합계 2 MiB·20,000행. 입력창은 각각 최대 2,000줄.', 'Review additions, deletions, and changes. Text: 1 MiB each. CSV: 2 MiB combined and 20,000 rows. Each input is limited to 2,000 physical lines.'));
  const metrics=toolMetrics('diff');const save=(text,name,type,action='diff_export')=>saveFile(metrics,action,text,name,type);
  const work = job(); let alive = true, version = 0, result = null, page = 0;
  const status = statusNode(), results = h('div'), before = h('textarea', { 'aria-label': t('이전 원문', 'Before'), placeholder: t('이전 내용을 붙여넣으세요', 'Paste the previous version') }), after = h('textarea', { 'aria-label': t('이후 원문', 'After'), placeholder: t('새 내용을 붙여넣으세요', 'Paste the new version') });
  const mode = h('select', {}, h('option', { value: 'text' }, t('텍스트 줄 비교', 'Text line diff')), h('option', { value: 'csv' }, t('CSV 키 기준 비교', 'CSV key diff'))), delimiter = delimiters(t), keys = h('input', { type: 'text', value: '1', placeholder: '1, 2' }), csvOptions = h('div', { class: 'grid-2', hidden: true }, field(t('구분자 (양쪽 동일)', 'Delimiter (both sides)'), delimiter), field(t('키 열 위치 (1부터, 쉼표로 구분)', 'Key column positions (1-based, comma-separated)'), keys));
  const rememberDiff=new Map([before,after].map(input=>[input,protectTextView(input,t,error=>{metrics.fail(metrics.begin('validate_diff_input'),'validation');errorStatus(status,error,t);},()=>mode.value==='csv'?DATA_LIMITS.bytes:DATA_LIMITS.textBytes)]));
  const whitespace = check(t('모든 공백 무시 (키 비교에도 적용)', 'Ignore all whitespace (including keys)')), caseOption = check(t('대소문자 무시 (키 비교에도 적용)', 'Ignore case (including keys)'));
  const invalidate = () => {metrics.cancelAction('diff_compare');version++; work.cancel(); result = null; results.replaceChildren(); status.textContent = ''; run.disabled = false; cancel.disabled = true; exportButton.disabled = true; };
  const fileVersions = new Map([[before, 0], [after, 0]]);
  const invalidateFile = target => fileVersions.set(target, fileVersions.get(target) + 1);
  [before, after].forEach(input => input.addEventListener('input', () => { invalidateFile(input); invalidate(); }));
  keys.addEventListener('input', invalidate); [delimiter, whitespace.input, caseOption.input].forEach(input => input.addEventListener('change', invalidate));
  mode.addEventListener('change', () => { csvOptions.hidden = mode.value !== 'csv'; invalidate(); });
  function render() {
    if (!result) return; const changed = result.entries.filter(x => x.type !== 'same'); const maxPage = Math.max(0, Math.ceil(changed.length / 100) - 1); page = Math.min(page, maxPage);
    const types = { added: t('추가 +', 'Added +'), removed: t('삭제 −', 'Removed −'), changed: t('변경 ↔', 'Changed ↔') };
    const list = changed.slice(page * 100, page * 100 + 100).map(item => [h('span', { class: `du-${item.type}` }, types[item.type]), item.oldLine || '—', item.newLine || '—', h('pre', {}, Array.isArray(item.before) ? JSON.stringify(item.before) : item.before ?? ''), h('pre', {}, Array.isArray(item.after) ? JSON.stringify(item.after) : item.after ?? '')]);
    const prev = button(t('이전', 'Previous'), () => { page--; render(); }, true); prev.disabled = page === 0;
    const next = button(t('다음', 'Next'), () => { page++; render(); }, true); next.disabled = page === maxPage;
    results.replaceChildren(h('div', { class: 'panel' }, h('h3', {}, t('비교 결과', 'Comparison results')), h('p', {}, `${t('추가', 'Added')} ${result.added} · ${t('삭제', 'Removed')} ${result.removed} · ${t('변경', 'Changed')} ${result.changed || 0} · ${t('동일', 'Equal')} ${result.same}`), result.coarse ? h('div', { class: 'du-risk' }, t('변경 구간이 커서 최소 편집 탐색 대신 구간 전체를 삭제/추가로 표시합니다. 원문과 결과 값은 모두 보존됩니다.', 'The changed middle is large, so it is shown as a whole replacement block rather than a minimal edit sequence. All values are preserved.')) : null, result.lineEndingsDiffer ? h('p', { class: 'notice' }, t('줄 내용은 같지만 CRLF/LF/CR 줄바꿈 형식이 다릅니다.', 'Line content matches, but CRLF/LF/CR line endings differ.')) : null, h('p', { class: 'du-note' }, t('텍스트는 줄 단위 추가·삭제로 표시하며 수정 줄은 삭제+추가입니다. CSV는 명시 키로 변경 행을 구분합니다. 의미·법적 중요도는 판단하지 않습니다.', 'Text modifications appear as removed and added lines. CSV changes are matched by your chosen key. No semantic or legal significance is inferred.')), changed.length ? table([t('유형', 'Type'), t('이전 행', 'Old row'), t('이후 행', 'New row'), t('이전 값', 'Before'), t('이후 값', 'After')], list) : h('p', {}, t('선택한 비교 규칙에서 차이가 없습니다.', 'No differences under the selected comparison rules.')), h('div', { class: 'toolbar' }, prev, `${page + 1} / ${maxPage + 1} · ${t('페이지당 100건', '100 changes per page')}`, next)));
  }
  const run = button(t('비교 실행', 'Compare'), async () => {
    const current=++version,measurement=metrics.begin('diff_compare');run.disabled = true; cancel.disabled = false; status.className = 'du-status'; status.textContent = t('로컬 비교 중…', 'Comparing locally…');
    try {
      if (mode.value === 'csv' && utf8Bytes(before.value) + utf8Bytes(after.value) > DATA_LIMITS.bytes) throw new Error(t('CSV 합계는 최대 2 MiB입니다.', 'CSV total limit is 2 MiB.'));
      const keyColumns = keys.value.split(',').map(x => Number(x.trim()) - 1);
      if (mode.value === 'csv' && (!keys.value.trim() || keyColumns.some(x => !Number.isInteger(x) || x < 0))) throw new Error(t('키 열은 1부터 시작하는 정수로 지정하세요.', 'Enter 1-based integer key column positions.'));
      const value = await work.run({ task: 'diff', mode: mode.value, before: before.value, after: after.value, delimiter: delimiter.value, options: { keyColumns, ignoreWhitespace: whitespace.input.checked, ignoreCase: caseOption.input.checked } });
      if (!alive || current !== version) return; result = value; page = 0; render(); exportButton.disabled=false;metrics.success(measurement);metrics.artifact(measurement);status.textContent = t('비교 완료. 전체 입력을 검사했습니다.', 'Comparison complete. All input was checked.');
    }catch(error){if(error.name==='AbortError')metrics.cancel(measurement);else metrics.fail(measurement);errorStatus(status,error,t);}finally { if (alive && current === version) { run.disabled = false; cancel.disabled = true; } }
  });
  const cancel = button(t('취소', 'Cancel'), ()=>{metrics.cancelAction('diff_compare','user_cancel');version++;work.cancel();run.disabled = false; cancel.disabled = true; status.textContent = t('비교를 취소했습니다. 입력은 유지됩니다.', 'Comparison cancelled. Input is preserved.'); }, true); cancel.disabled = true;
  const exportButton = button(t('전체 변경내역 JSON 저장', 'Download full diff JSON'), () => { save(JSON.stringify({ mode: mode.value, comparison: { ignoreWhitespace: whitespace.input.checked, ignoreCase: caseOption.input.checked }, ...result }, null, 2), 'change-report.json', 'application/json'); status.textContent = t('다운로드 요청됨. 저장한 파일을 열어 확인하세요.', 'Download requested. Open the saved file to verify it.'); }, true); exportButton.disabled = true;
  const filePicker = target => h('input', { type: 'file', accept: '.txt,.csv,.tsv,text/plain,text/csv', onChange: async event => {
    const file = event.target.files[0]; if (!file) return;
    invalidateFile(target); invalidate(); const current=fileVersions.get(target),measurement=metrics.begin('diff_import',target===before?'before':'after');
    try {
      if (!(mode.value === 'csv' ? /\.(csv|tsv)$/i : /\.(txt|csv|tsv)$/i).test(file.name)) throw new Error(t('지원 확장자의 파일을 선택하세요.', 'Choose a file with a supported extension.'));
      const max = mode.value === 'csv' ? DATA_LIMITS.bytes : DATA_LIMITS.textBytes;
      if (file.size > max) throw new Error(t('파일 한도를 초과했습니다.', 'File exceeds the size limit.'));
      const value = decodeUTF8(new Uint8Array(await file.arrayBuffer()));
      validateTextView(value,t,max);
      if (alive && current === fileVersions.get(target)) {invalidate();target.value=value;rememberDiff.get(target)();metrics.success(measurement);}
    } catch (error) { if(alive&&current===fileVersions.get(target)){metrics.fail(measurement,'validation');errorStatus(status,error,t);} }
    if (alive && current === fileVersions.get(target)) event.target.value = '';
  } });
  body.append(h('div', { class: 'panel' }, field(t('비교 유형', 'Comparison type'), mode), csvOptions, h('div', { class: 'toolbar' }, whitespace.node, caseOption.node), h('p', { class: 'du-note' }, t('CSV 첫 행은 헤더입니다. 양쪽 헤더와 열 순서가 일치해야 하며, 비어 있거나 중복인 키는 비교를 중단합니다.', 'The first CSV row is a header. Headers and column order must match. Missing or duplicate keys stop comparison.')), h('div', { class: 'grid-2' }, h('div', {}, field(t('이전 파일', 'Before file'), filePicker(before)), field(t('이전 원문', 'Before'), before)), h('div', {}, field(t('이후 파일', 'After file'), filePicker(after)), field(t('이후 원문', 'After'), after))), h('div', { class: 'toolbar' }, run, cancel, exportButton, button(t('전체 지우기', 'Clear all'), ()=>{metrics.cancelAll('user_cancel');[before,after].forEach(invalidateFile); invalidate(); before.value = after.value = ''; [before,after].forEach(input=>rememberDiff.get(input)()); setDirty(false); }, true)), status), results);
  return () => { metrics.dispose();alive = false; version++; work.cancel(); before.value = after.value = ''; result = null; setDirty(false); };
}

