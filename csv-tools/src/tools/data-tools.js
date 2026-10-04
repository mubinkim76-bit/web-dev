import {toolMetrics} from '../measurement.js';
import { setDirty } from '../shared.js';
import { DATA_LIMITS, decodeUTF8, utf8Bytes, serializeCSV } from './data-core.js';
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

export function mountCsv(root, context = {}) {
  const { body, t } = shell(root, context, tTitle(context, 'CSV 정리와 병합', 'CSV cleanup & merge'), tTitle(context, '문자열을 유지하고 열 위치를 직접 연결해 세로로 합칩니다. 현재 보수적 한도: 3파일·합계 2 MiB·10,000행·100열. 붙여넣기 입력창은 최대 2,000줄.', 'Keep values as strings, map columns explicitly, and append rows. Conservative limits: 3 files, 2 MiB combined, 10,000 rows, 100 columns. Pasted input is limited to 2,000 physical lines.'));
  const metrics=toolMetrics('csv');const save=(text,name,type,action='csv_export')=>saveFile(metrics,action,text,name,type);
  const work = job(); let reading = false, alive = true, version = 0, sources = [], targetHeaders = [], mappings = [], result = null, totalBytes = 0;
  const status = statusNode(), mappingArea = h('div'), optionArea = h('div'), resultArea = h('div');
  const delimiter = delimiters(t), header = check(t('첫 행은 헤더', 'First row is a header'), true), fileInput = h('input', { type: 'file', accept: '.csv,.tsv,text/csv,text/tab-separated-values', multiple: true });
  const paste = h('textarea', { 'aria-label': t('CSV 붙여넣기', 'Paste CSV'), placeholder: 'id,name\n000123,홍길동', rows: 4 }); paste.style.minHeight = '100px';
  protectTextView(paste,t,error=>{metrics.fail(metrics.begin('validate_csv_input'),'validation');errorStatus(status,error,t);},()=>DATA_LIMITS.bytes);
  const inputList = h('div', { class: 'du-note' });
  const trim = check(t('1. 셀 앞뒤 공백 제거', '1. Trim cell whitespace')), removeEmpty = check(t('3. 모든 셀이 빈 행 제외', '3. Exclude all-empty rows'));
  const replace = check(t('2. 선택 열의 고정 문자열 치환', '2. Literal replacement in selected columns')), findInput = h('input', { type: 'text' }), withInput = h('input', { type: 'text' }), replaceColumns = h('div'), keyColumns = h('div'); let replaceChecks = [], keyChecks = [];
  const dedupPolicy = h('select', {}, h('option', { value: 'all' }, t('모두 유지', 'Keep all')), h('option', { value: 'first' }, t('첫 행 유지', 'Keep first')), h('option', { value: 'last' }, t('마지막 행 유지', 'Keep last'))), dedupCase = check(t('중복 키 대소문자 무시', 'Ignore case in duplicate keys'));
  const invalidate = () => {if (reading) { result = null; resultArea.replaceChildren(); execute.disabled = true; return; } metrics.cancelAll();version++; work.cancel(); result = null; resultArea.replaceChildren(); status.textContent = ''; execute.disabled = !sources.length; cancel.disabled = true; parseButton.disabled = false; };
  [trim.input, removeEmpty.input, replace.input, dedupPolicy, dedupCase.input].forEach(node => node.addEventListener('change', invalidate)); [findInput, withInput].forEach(node => node.addEventListener('input', invalidate));
  const mappingDefaults = (inputs = sources, offset = 0) => inputs.map((source, s) => targetHeaders.map((name, c) => {
    if (s + offset === 0) return { index: c };
    const found = source.table.headers.flatMap((header, i) => header === name ? [i] : []);
    return found.length === 1 ? { index: found[0] } : { value: '' };
  }));
  const showColumns = preserve => {
    replaceChecks = targetHeaders.map((name, i) => { const item = check(`${i + 1}. ${name}`, preserve && !!replaceChecks[i]?.input.checked, invalidate); replaceColumns.append(item.node); return item; });
    keyChecks = targetHeaders.map((name, i) => { const item = check(`${i + 1}. ${name}`, preserve && !!keyChecks[i]?.input.checked, invalidate); keyColumns.append(item.node); return item; });
  };
  function renderMappings(preserveColumns = true) {
    mappingArea.replaceChildren(); replaceColumns.replaceChildren(); keyColumns.replaceChildren(); showColumns(preserveColumns); optionArea.hidden = !sources.length;
    if (!sources.length) return;
    const names = h('div', { class: 'du-mapping' }, ...targetHeaders.map((name, c) => field(t(`출력 열 ${c + 1}`, `Output column ${c + 1}`), h('input', { type: 'text', value: name, onInput: event => { targetHeaders[c] = event.target.value; invalidate(); } }))));
    const addColumn = button(t('출력 열 추가', 'Add output column'), () => { if (targetHeaders.length >= DATA_LIMITS.columns) return; targetHeaders.push(`Column ${targetHeaders.length + 1}`); mappings.forEach(row => row.push({ value: '' })); invalidate(); renderMappings(); }, true);
    const reset = button(t('매핑·규칙 초기화', 'Reset mapping & rules'), () => { targetHeaders = [...sources[0].table.headers]; mappings = mappingDefaults(); sources.forEach(source => { source.excluded = false; }); trim.input.checked = removeEmpty.input.checked = replace.input.checked = dedupCase.input.checked = false; findInput.value = withInput.value = ''; dedupPolicy.value = 'all'; invalidate(); renderMappings(false); }, true);
    mappingArea.append(h('div', { class: 'panel' }, h('h3', { class: 'du-subhead' }, t('출력 열과 파일별 매핑', 'Output columns & per-file mapping')), h('p', { class: 'du-note' }, t('첫 파일의 열을 기준으로 제안합니다. 같은 이름도 위치로 구분하며, 제안 매핑을 확인한 후 실행하세요. 누락 열은 빈 값 또는 지정값으로 채웁니다.', 'The first file suggests the target columns. Duplicate names remain distinct by position. Review every suggested mapping before running. Missing columns use an empty or custom value.')), names, h('div', { class: 'toolbar' }, addColumn, reset), ...sources.map((source, s) => {
      const exclude = check(t('이 파일 제외', 'Exclude this file'), !!source.excluded, () => { source.excluded = exclude.input.checked; invalidate(); });
      return h('details', { open: true }, h('summary', {}, `${s + 1}. ${source.name} · ${source.table.rows.length.toLocaleString()} ${t('행', 'rows')} · ${source.table.headers.length} ${t('열', 'columns')}`), exclude.node, h('div', { class: 'du-mapping' }, targetHeaders.map((name, c) => {
        const current = mappings[s][c]; const select = h('select', { 'aria-label': `${source.name}: ${name}` }, h('option', { value: 'constant' }, t('빈 값 / 지정값', 'Empty / custom value')), ...source.table.headers.map((header, i) => h('option', { value: String(i) }, `${i + 1}. ${header || t('(빈 헤더)', '(empty header)')}`)));
        select.value = Number.isInteger(current.index) ? String(current.index) : 'constant';
        const constant = h('input', { type: 'text', value: current.value || '', 'aria-label': t(`${name} 누락 시 값`, `Default for ${name}`), placeholder: t('기본값 (빈 값 가능)', 'Default (may be empty)'), disabled: select.value !== 'constant', onInput: event => { mappings[s][c] = { value: event.target.value }; invalidate(); } });
        select.addEventListener('change', () => { constant.disabled = select.value !== 'constant'; mappings[s][c] = select.value === 'constant' ? { value: constant.value } : { index: Number(select.value) }; invalidate(); });
        return h('div', { class: 'du-mapping-row' }, h('span', {}, `${c + 1}. ${name}`), select, constant);
      })));
    })));
  }
  async function parseInputs(inputs, append = false) {
    reading = false;
    const current=++version,measurement=metrics.begin('csv_parse');work.cancel();result=null; resultArea.replaceChildren(); status.className = 'du-status'; status.textContent = t('UTF-8·CSV 검사 중…', 'Checking UTF-8 and CSV…'); parseButton.disabled = true; execute.disabled = true; cancel.disabled = false;
    try {
      const bytes = inputs.reduce((sum, input) => sum + (input.bytes?.byteLength ?? utf8Bytes(input.text)), 0);
      if (inputs.length + (append ? sources.length : 0) > DATA_LIMITS.files || bytes + (append ? totalBytes : 0) > DATA_LIMITS.bytes) throw new Error(t('최대 3파일·합계 2 MiB입니다. 나누어 처리하세요.', 'Maximum 3 files and 2 MiB combined. Split the input.'));
      const parsed = await work.run({ task: 'parse', inputs, options: { delimiter: delimiter.value, header: header.input.checked } });
      if (!alive || current !== version) return;
      const next = append ? [...sources, ...parsed] : parsed;
      if (next.reduce((sum, source) => sum + source.table.rows.length, 0) > DATA_LIMITS.rows) throw new Error(t('총 데이터 행은 최대 10,000행입니다.', 'Maximum 10,000 total data rows.'));
      if (parsed.some(source => !source.table.headers.length)) throw new Error(t('빈 파일은 열 구조가 없습니다. 내용을 추가하세요.', 'An empty file has no columns. Add content first.'));
      const preserveMappings = append && sources.length > 0, previousCount = sources.length;
      sources = next; setDirty(true); totalBytes = bytes + (append ? totalBytes : 0);
      if (preserveMappings) mappings.push(...mappingDefaults(parsed, previousCount));
      else { targetHeaders = [...sources[0].table.headers]; mappings = mappingDefaults(); }
      renderMappings(preserveMappings);
      inputList.textContent = `${sources.length} ${t('파일', 'files')} · ${totalBytes.toLocaleString()} B · ${sources.reduce((sum, source) => sum + source.table.rows.length, 0).toLocaleString()} ${t('데이터 행', 'data rows')}`;
      metrics.success(measurement);status.textContent=t('검사 완료. 열 매핑을 확인하고 정리·병합 미리보기를 만드세요.', 'Validated. Review the column mapping, then generate a cleanup and merge preview.');
    }catch(error){if (!alive || current !== version) return; if(error.name==='AbortError')metrics.cancel(measurement);else metrics.fail(measurement,'validation');errorStatus(status,error,t);}
    finally { if (alive && current === version) { parseButton.disabled = false; execute.disabled = !sources.length; cancel.disabled = true; } }
  }
  const parseButton = button(t('선택 파일 검사', 'Validate selected files'), async () => {
    const files = [...fileInput.files], current = ++version;
    metrics.cancelAll('superseded');
    const measurement = metrics.begin('csv_import');
    work.cancel(); reading = true; result = null; resultArea.replaceChildren();
    execute.disabled = true; cancel.disabled = false; status.className = 'du-status';
    status.textContent = t('선택 파일 읽는 중…', 'Reading selected files…');
    try {
      if (!files.length) throw new Error(t('CSV 또는 TSV 파일을 먼저 선택하세요.', 'Choose CSV or TSV files first.'));
      if (files.some(file => !/\.(csv|tsv)$/i.test(file.name))) throw new Error(t('CSV 또는 TSV 확장자 파일만 지원합니다. XLSX는 지원하지 않습니다.', 'Only .csv and .tsv files are supported. XLSX is not supported.'));
      if (files.length > DATA_LIMITS.files || files.reduce((sum, file) => sum + file.size, 0) > DATA_LIMITS.bytes) throw new Error(t('최대 3파일·합계 2 MiB입니다.', 'Maximum 3 files and 2 MiB combined.'));
      const inputs = await Promise.all(files.map(async file => ({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) })));
      if (!alive || current !== version) return;
      metrics.success(measurement); await parseInputs(inputs);
    } catch (error) {
      if (!alive || current !== version) return;
      metrics.fail(measurement); errorStatus(status,error,t);
    } finally {
      if (alive && current === version) { reading = false; parseButton.disabled = false; execute.disabled = !sources.length; cancel.disabled = true; }
    }
  });
  const sampleButton = button(t('예제 2파일 불러오기', 'Load two sample files'), () => { delimiter.value = ','; header.input.checked = true; parseInputs([{ name: 'sample-a.csv', text: 'id,name,note\r\n000123,한글,"쉼표, 보존"\r\n12345678901234567890,민수,"첫 줄\n둘째 줄"\r\n,빈 키,=1+1\r\n000123,중복,확인 필요' }, { name: 'sample-b.csv', text: 'name,id,note\n지수,000124,원문 유지\n마지막,000123,중복 후보' }]); }, true);
  const cancel = button(t('취소', 'Cancel'), ()=>{reading = false;metrics.cancelAll('user_cancel');version++;work.cancel();parseButton.disabled = false; execute.disabled = !sources.length; cancel.disabled = true; status.textContent = t('취소됨. 검사 완료한 입력은 유지됩니다.', 'Cancelled. Previously validated inputs are preserved.'); }, true); cancel.disabled = true;
  function showResult() {
    if (!result) return;
    const duplicated = result.excluded.filter(item => item.reason.startsWith('duplicate')).length;
    const approveDedup = check(t(`제안된 중복 ${duplicated}행 제외를 확인했습니다`, `I confirm excluding ${duplicated} proposed duplicate rows`), duplicated === 0);
    const exportMode = h('select', {}, h('option', { value: 'raw' }, t('원문값 보존 (데이터 교환용)', 'Preserve values (data exchange)')), h('option', { value: 'protected' }, t('수식 접두어 변형 (실험적·검증 전)', 'Formula-prefix mitigation (experimental, unvalidated)')));
    const outputDelimiter = delimiters(t); outputDelimiter.value = delimiter.value;
    const bom = check(t('UTF-8 BOM 포함', 'Include UTF-8 BOM'), true), acknowledge = check(t('수식 실행·자동 형 변환 위험을 이해하고 원문값 CSV를 저장합니다', 'I understand formula execution and auto-formatting risks and want the raw-value CSV'));
    const exportPreview = h('div'), exportStatus = statusNode(); let exported = null;
    const outputButton = button(t('CSV 저장', 'Download CSV'), () => { if (!exported) return; save(exported.text, 'merged.csv', 'text/csv;charset=utf-8'); exportStatus.textContent = t('다운로드 요청됨. 저장 파일을 텍스트 편집기로 확인하세요. 스프레드시트 가져오기는 모든 열을 텍스트로 지정하세요.', 'Download requested. Inspect it in a text editor. When importing into a spreadsheet, set every column to text.'); });
    const updateExport = () => {
      exported = serializeCSV([result.headers, ...result.rows], { mode: exportMode.value, delimiter: outputDelimiter.value, bom: bom.input.checked });
      acknowledge.node.hidden = exportMode.value !== 'raw' || !exported.riskyCells.length;
      outputButton.disabled = !approveDedup.input.checked || (exportMode.value === 'raw' && exported.riskyCells.length > 0 && !acknowledge.input.checked);
      exportPreview.replaceChildren(...[h('p', {}, `${t('위험 접두어 셀', 'Potential formula cells')}: ${exported.riskyCells.length} · ${t('내보내기 변형 셀', 'Export-transformed cells')}: ${exported.changes.length} · UTF-8${bom.input.checked ? ' + BOM' : ''} · CRLF · ${t('모든 셀 인용', 'All cells quoted')}`), exported.changes.length ? table([t('출력 행 (헤더 포함)', 'Output row (including header)'), t('열', 'Column'), t('전', 'Before'), t('후', 'After'), t('이유', 'Reason')], exported.changes.slice(0, 100).map(cell => [cell.row, cell.column, cell.before, cell.after, t('수식 접두어 앞에 작은따옴표 추가', 'Apostrophe prefix added')])) : null, exported.changes.length > 100 ? h('p', {}, t('변형 목록 첫 100건 표시. 전체 목록은 변경내역 JSON에 포함됩니다.', 'First 100 export changes shown. Full list is included in the audit JSON.')) : null].filter(Boolean));
    };
    [exportMode, outputDelimiter, bom.input, acknowledge.input, approveDedup.input].forEach(node => node.addEventListener('change', () => { exportStatus.textContent = ''; updateExport(); }));
    const audit = button(t('전체 변경내역 JSON 저장', 'Download full audit JSON'), () => { save(JSON.stringify({ headers: result.headers, mappings, sources: sources.map(source => source.name), inputRows: result.inputRows, outputRows: result.outputRows, changes: result.changes, excluded: result.excluded, emptyKeys: result.emptyKeys, duplicateCandidates: result.duplicateCandidates, exportMode: exportMode.value, exportChanges: exported.changes }, null, 2), 'csv-change-audit.json','application/json','csv_audit'); exportStatus.textContent = t('변경내역 다운로드 요청됨. 파일명·원문값이 포함된 로컬 파일입니다.', 'Audit download requested. This local file contains source names and original values.'); }, true);
    resultArea.replaceChildren(h('div', { class: 'panel' }, h('h3', {}, t('전체 실행 집계와 결과 미리보기', 'Full-run summary & output preview')), h('div', { class: 'du-stats' }, h('div', { class: 'du-stat' }, `${t('입력', 'Input')} ${result.inputRows}`), h('div', { class: 'du-stat' }, `${t('출력', 'Output')} ${result.outputRows}`), h('div', { class: 'du-stat' }, `${t('명시 제외', 'Excluded')} ${result.excluded.length}`), h('div', { class: 'du-stat' }, `${t('변경 셀', 'Changed cells')} ${result.changes.length}`)), h('p', {}, `${result.inputRows} = ${result.outputRows} + ${result.excluded.length} · ${t('입력행 = 출력행 + 제외행', 'Input = output + excluded')}`), h('p', { class: 'du-note' }, t(`전체 ${result.outputRows}행 중 첫 ${Math.min(100, result.outputRows)}행만 표본 표시합니다. 위 집계는 전체 실행 결과입니다.`, `Showing the first ${Math.min(100, result.outputRows)} of ${result.outputRows} rows. Counts above cover the complete run.`)), table(result.headers, result.rows.slice(0, 100)), result.emptyKeys.length ? h('div', { class: 'du-risk' }, t(`빈 값·공백 키 ${result.emptyKeys.length}행은 중복 삭제하지 않고 유지했습니다. 원본 위치: `, `${result.emptyKeys.length} rows with empty/whitespace-only keys were preserved. Source positions: `), result.emptyKeys.slice(0, 30).map(item => `${sources[item.source].name} #${item.row}`).join(', ')) : null, h('details', {}, h('summary', {}, t(`변경 셀 ${result.changes.length}건 (첫 100건)`, `${result.changes.length} cell changes (first 100)`)), table([t('파일', 'File'), t('데이터 행', 'Data row'), t('열', 'Column'), t('전', 'Before'), t('후', 'After'), t('이유', 'Reason')], result.changes.slice(0, 100).map(item => [sources[item.source].name, item.row, item.column, item.before, item.after, item.reason]))), h('details', {}, h('summary', {}, t(`제외 제안 ${result.excluded.length}행 (첫 100건)`, `${result.excluded.length} proposed excluded rows (first 100)`)), table([t('파일', 'File'), t('데이터 행', 'Data row'), t('이유', 'Reason')], result.excluded.slice(0, 100).map(item => [sources[item.source].name, item.row, item.reason]))), duplicated ? approveDedup.node : null), h('div', { class: 'panel' }, h('h3', {}, t('용도별 내보내기', 'Export for your intended use')), h('div', { class: 'du-risk' }, t('CSV 인용만으로 수식 실행을 막을 수 없습니다. Excel·LibreOffice 열기→저장→재열기 시험은 아직 수행하지 않았습니다. 실험적 변형은 위험 접두어 셀에 작은따옴표를 추가해 값이 바뀌며 어느 프로그램에서도 안전을 보장하지 않습니다. 선행 0·긴 숫자는 스프레드시트의 자동 변환으로 달라질 수 있으므로 모든 열을 텍스트로 가져오세요.', 'CSV quoting alone does not prevent formulas. Excel/LibreOffice open → save → reopen tests have not been performed. Experimental mitigation adds an apostrophe to potentially dangerous cells, changes values, and is not a safety guarantee in any program. Import every column as text to avoid spreadsheet conversion of leading zeros and long numbers.')), h('div', { class: 'grid-2' }, field(t('출력 모드', 'Export mode'), exportMode), field(t('출력 구분자', 'Output delimiter'), outputDelimiter)), bom.node, h('p', { class: 'du-note' }, t('원문값 보존은 선택한 정리 후의 셀값 보존입니다. 원본 파일의 바이트·줄바꿈·인용 방식과 같다는 뜻은 아닙니다.', 'Value preservation applies after your chosen cleanup rules. It does not promise the same bytes, line endings, or quoting as the original file.')), exportPreview, acknowledge.node, h('div', { class: 'toolbar' }, outputButton, audit), exportStatus));
    updateExport();
  }
  const execute = button(t('정리·병합 미리보기', 'Preview cleanup & merge'), async () => {
    if (reading || execute.disabled || !sources.length) return;
    const current=++version,measurement=metrics.begin('csv_merge');execute.disabled = true; cancel.disabled = false; status.className = 'du-status'; status.textContent = t('전체 행 처리 중…', 'Processing every row…');
    try { const value = await work.run({ task: 'merge', sources, options: { headers: targetHeaders, mappings, rules: { trim: trim.input.checked, removeEmpty: removeEmpty.input.checked, replace: { enabled: replace.input.checked, columns: replaceChecks.flatMap((item, i) => item.input.checked ? [i] : []), find: findInput.value, with: withInput.value } }, dedup: { policy: dedupPolicy.value, keys: keyChecks.flatMap((item, i) => item.input.checked ? [i] : []), ignoreCase: dedupCase.input.checked } } });
      if (!alive || current !== version) return; result=value;showResult();metrics.success(measurement);metrics.artifact(measurement);status.textContent = t('전체 검사 완료. 변경·제외 제안과 출력 경고를 확인하세요.', 'Full check complete. Review changes, proposed exclusions, and export warnings.');
    }catch(error){if (!alive || current !== version) return; if(error.name==='AbortError')metrics.cancel(measurement);else metrics.fail(measurement);errorStatus(status,error,t);}
    finally { if (alive && current === version) { execute.disabled = false; cancel.disabled = true; } }
  }); execute.disabled = true;
  const discardParsed = ()=>{reading = false;metrics.cancelAll('user_cancel');invalidate();sources=[]; targetHeaders = []; mappings = []; totalBytes = 0; mappingArea.replaceChildren(); optionArea.hidden = true; inputList.textContent = ''; execute.disabled = true; status.textContent = t('입력 형식이 바뀌었습니다. 선택 파일을 다시 검사하거나 붙여넣은 CSV를 다시 추가하세요.', 'Input format changed. Validate selected files again or add the pasted CSV again.'); };
  delimiter.addEventListener('change', discardParsed); header.input.addEventListener('change', discardParsed);
  optionArea.hidden = true;
  optionArea.append(h('div', { class: 'panel' }, h('h3', { class: 'du-subhead' }, t('정리 규칙과 중복 정책', 'Cleanup rules & duplicate policy')), h('p', { class: 'du-note' }, t('순서: 매핑 → 1 공백 → 2 고정 문자열 치환 → 3 빈 행 → 4 중복. 숫자·날짜·Unicode 정규화는 자동 적용하지 않습니다.', 'Order: mapping → 1 whitespace → 2 literal replacement → 3 empty rows → 4 duplicates. No automatic numeric, date, or Unicode normalization.')), trim.node, replace.node, h('div', { class: 'grid-2' }, field(t('찾을 문자열 (정규식 아님)', 'Find (literal, not regex)'), findInput), field(t('바꿀 문자열', 'Replace with'), withInput)), h('details', {}, h('summary', {}, t('치환 대상 열 선택', 'Choose replacement columns')), replaceColumns), removeEmpty.node, field(t('4. 중복 처리', '4. Duplicate policy'), dedupPolicy), h('details', { open: true }, h('summary', {}, t('중복 판정 키 열 (선택해야 판정)', 'Duplicate key columns (explicit selection required)')), keyColumns), dedupCase.node, h('p', { class: 'du-note' }, t('키 셀 중 하나라도 빈 값·공백뿐이면 중복 삭제하지 않습니다. 중복 행 제외는 미리보기 후 확인해야 저장할 수 있습니다.', 'If any key cell is empty or whitespace-only, the row is not removed as a duplicate. Confirm proposed duplicate exclusions before downloading.')), execute));
  body.append(h('div', { class: 'panel' }, h('h3', { class: 'du-subhead' }, t('1. 입력 확인', '1. Validate input')), h('div', { class: 'grid-2' }, field(t('CSV·TSV 파일 선택 (기존 입력 교체)', 'Choose CSV/TSV files (replaces current input)'), fileInput), field(t('명시적 구분자 선택', 'Choose the delimiter explicitly'), delimiter)), header.node, h('p', { class: 'du-note' }, t('UTF-8/BOM만 지원합니다. 인코딩 추측, XLSX, 행별 열 수 불일치, 닫히지 않은 따옴표는 허용하지 않습니다. CSV 셀 안 줄바꿈은 보존합니다.', 'UTF-8/BOM only. No encoding guesses or XLSX. Uneven record widths and unclosed quotes are errors. Newlines inside quoted cells are preserved.')), h('div', { class: 'toolbar' }, parseButton, sampleButton), h('details', {}, h('summary', {}, t('CSV 붙여넣기로 추가', 'Append pasted CSV')), paste, button(t('붙여넣은 CSV 추가', 'Append pasted CSV'), () => parseInputs([{ name: `pasted-${sources.length + 1}.csv`, text: paste.value }], true), true)), inputList), mappingArea, optionArea, h('div', { class: 'toolbar' }, cancel, button(t('전체 지우기', 'Clear all'), () => { reading = false; invalidate(); sources = []; targetHeaders = []; mappings = []; totalBytes = 0; fileInput.value = paste.value = ''; mappingArea.replaceChildren(); optionArea.hidden = true; inputList.textContent = ''; execute.disabled = true; setDirty(false); }, true)), status, resultArea);
  return () => { metrics.dispose();alive = false; version++; work.cancel(); sources = []; targetHeaders = []; mappings = []; result = null; paste.value = ''; fileInput.value = ''; setDirty(false); };
}
