import {el,field,button,download,select,setDirty} from '../shared.js';import {decodeImage} from '../lib/image-browser.js';import {createReportPages,pagesToPDF} from '../lib/report-browser.js';import {isISODate} from '../lib/report-core.js';import {CURRENCIES,parseMoney,receiptTotals} from '../lib/receipt-core.js';
import {toolMetrics} from '../measurement.js';
export function mount(root,{t,toast}){const metrics=toolMetrics('receipts');let items=[],busy=false,disposed=false,token=0;const input=el('input',{type:'file',multiple:true,accept:'image/jpeg,image/png,image/webp','aria-label':t('영수증 이미지 선택','Choose receipt images')});const list=el('div'),status=el('p',{class:'notice',role:'status','aria-live':'polite'}),summary=el('div');function render(){list.replaceChildren(...items.map((item,i)=>{const date=el('input',{type:'date',value:item.workDate}),amount=el('input',{type:'text',inputmode:'decimal',value:item.amount,placeholder:'0.00',maxLength:16}),currency=select(Object.keys(CURRENCIES).map(c=>[c,c]),item.currency),confirmed=el('input',{type:'checkbox',checked:item.confirmed}),note=el('input',{type:'text',value:item.note,maxLength:100});function change(){item.workDate=date.value;item.amount=amount.value;item.currency=currency.value;item.note=note.value;item.confirmed=false;confirmed.checked=false;summary.replaceChildren();}for(const node of [date,amount,currency,note])node.addEventListener('input',change);confirmed.addEventListener('change',()=>{summary.replaceChildren();const measurement=confirmed.checked?metrics.begin('receipt_confirm'):null;try{if(confirmed.checked){if(!date.value||!isISODate(date.value))throw new Error(t('실제 거래일을 입력하세요','Enter the actual transaction date'));parseMoney(amount.value,currency.value);}item.confirmed=confirmed.checked;metrics.success(measurement);status.textContent='';}catch(e){metrics.fail(measurement,'validation');confirmed.checked=false;item.confirmed=false;status.textContent=e.message;}});return el('section',{class:'panel photo-row'},el('img',{src:item.url,alt:item.file.name}),el('div',{class:'photo-content'},el('h3',{},`${i+1}. ${item.file.name}`),el('div',{class:'grid-2'},field(t('거래일 · 직접 입력','Transaction date · manual'),date),field(t('최종 결제 금액','Final paid amount'),amount),field(t('통화','Currency'),currency),field(t('메모 (선택)','Note (optional)'),note)),field(t('원본과 날짜·금액·통화를 대조했습니다','I checked the date, amount and currency against the source'),confirmed)));}));}
 input.addEventListener('change',async()=>{
  if(busy)return;
  const files=Array.from(input.files||[]);
  if(!files.length)return;
  const measurement=metrics.begin('receipt_validate');
  if(files.length>10||files.reduce((n,f)=>n+f.size,0)>30*1048576){
   status.textContent=t('최대 10장 / 30 MiB','Maximum 10 images / 30 MiB');
   input.value='';metrics.fail(measurement,'validation');return;
  }
  busy=true;const load=++token;input.disabled=true;
  const pending=[],errors=[];
  try{
   for(const file of files){
    if(disposed||load!==token)return;
    try{
     const d=await decodeImage(file,12000000);d.bitmap.close();
     if(disposed||load!==token)return;
     pending.push({file,url:URL.createObjectURL(file),workDate:'',amount:'',currency:'KRW',confirmed:false,note:''});
    }catch(e){errors.push(`${file.name}: ${e.message}`);}
   }
   if(disposed||load!==token)return;
   if(errors.length){
    metrics.fail(measurement);
    status.textContent=t(`0장 준비. 기존 영수증 ${items.length}건을 유지했습니다. `,`0 images ready. Kept ${items.length} existing receipts. `)+errors.join(' / ');
    return;
   }
   // Replace the current workspace only after the entire batch validates.
   items.forEach(i=>URL.revokeObjectURL(i.url));items=pending.splice(0);
   summary.replaceChildren();setDirty(items.length>0);render();metrics.success(measurement);
   status.textContent=t(`${items.length}장 준비. 모든 값을 직접 입력·확인하세요. `,`${items.length} images ready. Manually enter and verify every field. `);
  }finally{
   pending.forEach(i=>URL.revokeObjectURL(i.url));
   if(!disposed&&load===token){busy=false;input.disabled=false;input.value='';}
  }
 });
 function selected(){const checked=items.filter(i=>i.confirmed);if(!checked.length)throw new Error(t('확인된 영수증이 없습니다','No receipts have been confirmed'));for(const i of checked){if(!i.workDate||!isISODate(i.workDate))throw new Error('Invalid date');parseMoney(i.amount,i.currency);}return checked.toSorted((a,b)=>a.workDate.localeCompare(b.workDate));}
 const csv=button(t('확인분 통화별 합계 CSV','Confirmed totals by currency CSV'),()=>{const measurement=metrics.begin('receipt_totals');try{const checked=selected(),totals=receiptTotals(checked);const data='\uFEFFcurrency,total,confirmed_receipts\r\n'+totals.map(x=>`${x.currency},${x.amount},${checked.filter(i=>i.currency===x.currency).length}`).join('\r\n')+'\r\n';const blob=new Blob([data],{type:'text/csv;charset=utf-8'});metrics.success(measurement);metrics.artifact(measurement);metrics.download('receipt_totals',measurement);download(blob,'receipt-totals.csv');summary.replaceChildren(el('p',{class:'notice'},t(`확인 ${checked.length}건 / 제외 ${items.length-checked.length}건. `,`${checked.length} confirmed / ${items.length-checked.length} excluded. `)+totals.map(x=>`${x.currency} ${x.amount}`).join(' · ')));}catch(e){metrics.fail(measurement,'validation');status.textContent=e.message;}},true);
 const pdf=button(t('확인한 값으로 증빙 PDF 생성','Create evidence PDF from confirmed values'),async()=>{if(busy)return;const measurement=metrics.begin('receipt_pdf');try{const checked=selected();busy=true;const run=++token;root.querySelectorAll('input,select,button').forEach(n=>n.disabled=true);const pages=await createReportPages(checked.map(i=>({file:i.file,workDate:i.workDate,caption:`${i.currency} ${i.amount}${i.note?' · '+i.note:''}`})),{title:t('영수증 증빙 · 수동 확인','Receipt evidence · manually verified'),author:t(`확인 ${checked.length}건 · 미확인 제외 ${items.length-checked.length}건`,`${checked.length} confirmed · ${items.length-checked.length} unconfirmed excluded`),paper:'A4',perPage:2,maxPixels:12000000,footer:'LOCAL / 11 · MANUAL RECEIPT RECORD'},()=>disposed||token!==run,(p,n)=>status.textContent=`${p}/${n}`);const blob=await pagesToPDF(pages);if(disposed||token!==run)return;metrics.success(measurement);metrics.artifact(measurement);metrics.download('receipt_pdf',measurement);download(blob,'receipt-evidence.pdf');status.textContent=t('날짜순 증빙 PDF 생성 완료. 미확인 항목은 제외했습니다','Evidence PDF created in date order. Unconfirmed items were excluded.');toast(t('PDF 생성 완료','PDF created'));}catch(e){metrics.fail(measurement);status.textContent=e.message;}finally{busy=false;if(!disposed)root.querySelectorAll('input,select,button').forEach(n=>n.disabled=false);}});
 root.append(el('div',{class:'notice warning'},el('strong',{},t('수동 입력 베타 · 자동 OCR 미구현','Manual entry beta · automatic OCR is not implemented')),el('p',{},t('영수증을 기기 밖으로 보내지 않습니다. 날짜·금액·통화를 직접 입력하고 원본과 대조하세요. 외부 OCR, 자동 회전·원근 보정, 실제 크기 출력은 제공하지 않습니다','Receipts never leave your device. Enter the date, amount and currency and compare them with the source. External OCR, automatic perspective correction and true-size printing are not provided.'))),el('section',{class:'panel'},el('h2',{},t('증빙 이미지','Receipt images')),el('div',{class:'dropzone'},input),el('p',{class:'muted'},t('10장 · 합계 30 MiB · 장당 12MP. 새로고침 시 지워집니다','10 images · 30 MiB total · 12 MP per image. Refresh clears the workspace.'))),list,status,el('div',{class:'toolbar'},pdf,csv,button(t('전체 지우기','Clear all'),()=>{metrics.cancelAll('user_cancel');token++;busy=false;input.disabled=false;items.forEach(i=>URL.revokeObjectURL(i.url));items=[];input.value='';render();summary.replaceChildren();status.textContent='';setDirty(false);},true)),summary,el('p',{class:'muted'},t('혼합 통화는 별도 합산합니다. PDF는 144dpi 이미지 기반으로 글자 검색이 불가하며 회계·세무 적합성을 판정하지 않습니다','Currencies are summed separately. PDF uses 144 dpi page images and has no searchable text. This does not determine accounting or tax compliance.')));return()=>{metrics.dispose();disposed=true;token++;items.forEach(i=>URL.revokeObjectURL(i.url));items=[];};}
