import {el,field,button,select,escapeHtml,tFor,setDirty} from '../shared.js';
import {CURRENCIES,calculateInvoice,money} from '../lib/invoice-engine.js';
import {errorBox,showError,toolbar,printDocument} from './auxiliary-ui.js';
function localDate(date=new Date()){
 return `${String(date.getFullYear()).padStart(4,'0')}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
import {toolMetrics} from '../measurement.js';
export function mount(root,{lang='ko',t=tFor(lang),toast=()=>{}}={}){
 const metrics=toolMetrics('invoice');const cleanups=[];let rendered='';const error=errorBox(),rows=el('div',{class:'aux-rows'}),preview=el('div',{class:'aux-preview','aria-live':'polite'});
 const kind=select([['quote',t('견적서','Quote')],['invoice',t('일반 청구서','Invoice')]],'quote');
 const currency=select(Object.keys(CURRENCIES).map(x=>[x,x]),'KRW');
 const number=el('input',{value:'DOC-001',maxlength:60}),date=el('input',{type:'date',value:localDate(),min:'1970-01-01',max:'2100-12-31'});
 const seller=el('textarea',{rows:3,maxlength:1000,placeholder:t('발행자 이름과 연락처','Issuer name and contact details')});
 const buyer=el('textarea',{rows:3,maxlength:1000,placeholder:t('수신자 이름과 연락처','Recipient name and contact details')});
 const discount=el('input',{type:'number',value:0,min:0,max:100,step:'any'}),tax=el('input',{type:'number',value:0,min:0,max:100,step:'any'});
 const notes=el('textarea',{rows:2,maxlength:2000,placeholder:t('납기, 결제 조건 등','Delivery or payment terms')});
 const print=button(t('인쇄 / PDF로 저장','Print / Save as PDF'),()=>{if(rendered){metrics.print('invoice_print');cleanups.push(printDocument(rendered,number.value||'Document',t));}});print.disabled=true;
 function dirty(){rendered='';print.disabled=true;preview.replaceChildren(el('p',{class:'aux-muted'},t('내용을 수정했습니다. 미리보기를 다시 계산하세요.','Inputs changed. Recalculate the preview.')));error.hidden=true;setDirty();}
 const add=button(t('+ 품목 추가','+ Add item'),()=>{addRow();dirty();});
 function addRow(name='',qty='1',price='0'){if(rows.children.length>=100)return;const n=el('input',{value:name,maxlength:200,'data-key':'name'}),q=el('input',{type:'number',value:qty,min:0.000001,max:1000000,step:'any','data-key':'quantity'}),p=el('input',{type:'number',value:price,min:0,max:1000000000,step:'any','data-key':'price'});const row=el('div',{class:'aux-item-row'},field(t('품목','Item'),n),field(t('수량','Quantity'),q),field(t('단가','Unit price'),p),button(t('삭제','Remove'),()=>{row.remove();add.disabled=false;dirty();},true));rows.append(row);add.disabled=rows.children.length>=100;}
 function generate(track=true){const measurement=track===false?null:metrics.begin('invoice_calculate');error.hidden=true;try{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date.value)||date.value<'1970-01-01'||date.value>'2100-12-31')throw new Error('LOCAL_RANGE');
  const items=[...rows.children].map(row=>Object.fromEntries([...row.querySelectorAll('[data-key]')].map(x=>[x.dataset.key,x.value])));
  const result=calculateInvoice(items,{currency:currency.value,discountPercent:discount.value,taxPercent:tax.value}),m=n=>escapeHtml(money(n,result.currency));
  rendered=`<h1>${kind.value==='quote'?t('견적서','Quote'):t('일반 청구서','Invoice')}</h1><p>${escapeHtml(number.value)} · ${escapeHtml(date.value)}</p><div class="meta"><div><strong>${t('발행자','From')}</strong><br>${escapeHtml(seller.value||'—')}</div><div><strong>${t('수신자','To')}</strong><br>${escapeHtml(buyer.value||'—')}</div></div><table><thead><tr><th>${t('품목','Item')}</th><th>${t('수량','Qty')}</th><th class="right">${t('단가','Unit price')}</th><th class="right">${t('금액','Amount')}</th></tr></thead><tbody>${result.lines.map(x=>`<tr><td>${escapeHtml(x.name)}</td><td>${escapeHtml(x.quantity)}</td><td class="right">${escapeHtml(x.price)} ${result.currency}</td><td class="right">${m(x.amount)}</td></tr>`).join('')}</tbody></table><table><tbody><tr><th>${t('소계','Subtotal')}</th><td class="right">${m(result.subtotal)}</td></tr><tr><th>${t('할인','Discount')} (${escapeHtml(discount.value)}%)</th><td class="right">− ${m(result.discount)}</td></tr><tr><th>${t('입력한 세율의 세액','Tax at entered rate')} (${escapeHtml(tax.value)}%)</th><td class="right">${m(result.tax)}</td></tr><tr><th>${t('합계','Total')}</th><td class="right aux-total">${m(result.total)}</td></tr></tbody></table><p class="note">${escapeHtml(notes.value)}</p><p class="note">${t('계산: 품목별 수량×단가를 통화 소수 자릿수로 반올림 → 소계 → 할인액 반올림 → 할인 후 금액에 세율 적용·반올림. 사사오입. 세율은 사용자 입력값이며 전자세금계산서나 세무 조언이 아닙니다.','Calculation: round each quantity × unit price to currency precision; sum; round discount; calculate and round tax on the discounted subtotal. Half-up rounding. Tax is user-entered; this is not a statutory tax invoice or tax advice.')}</p>`;
  preview.innerHTML=rendered;print.disabled=false;metrics.success(measurement);metrics.artifact(measurement);toast(t('합계를 계산했습니다. PDF는 인쇄 창에서 저장하세요.','Totals calculated. Save PDF through the print dialog.'));
 }catch(e){metrics.fail(measurement,'validation');rendered='';print.disabled=true;showError(error,e,t);}}
 const settings=el('section',{class:'panel'},el('div',{class:'grid-2'},field(t('문서 종류','Document'),kind),field(t('통화','Currency'),currency),field(t('문서 번호','Document number'),number),field(t('발행일','Date'),date),field(t('발행자','From'),seller),field(t('수신자','To'),buyer)),rows,toolbar(add),el('div',{class:'grid-2'},field(t('전체 할인율 (%)','Document discount (%)'),discount),field(t('사용자 세율 (%)','User-entered tax (%)'),tax)),field(t('비고','Notes'),notes),toolbar(button(t('계산 / 미리보기','Calculate / Preview'),generate),print),error);
 settings.addEventListener('input',dirty);settings.addEventListener('change',dirty);
 root.replaceChildren(el('div',{class:'aux-tool'},el('div',{class:'notice'},t('1문서 · 1통화 · 최대 100품목. 입력값은 이 탭에만 남습니다. 계정 저장·발송·세무 신고 기능은 없습니다. PDF 저장 시 인쇄 창에서 “PDF로 저장”을 선택하세요.','One document, one currency, up to 100 items. Inputs stay in this tab. No account storage, sending, or tax filing. Choose “Save as PDF” in the print dialog.')),settings,preview));
 addRow(t('서비스','Service'),'3','10000');generate(false);setDirty(false);return()=>{metrics.dispose();cleanups.forEach(fn=>fn());};
}
