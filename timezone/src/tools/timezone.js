import {el,field,button,select,download,tFor,setDirty} from '../shared.js';
import {resolveLocal,localStamp,findOverlaps,makeIcs} from '../lib/timezone-engine.js';
import {errorBox,showError,toolbar} from './auxiliary-ui.js';
const COMMON=['Asia/Seoul','Asia/Tokyo','Asia/Shanghai','Asia/Singapore','Asia/Kolkata','Asia/Dubai','Europe/London','Europe/Paris','Europe/Berlin','America/New_York','America/Chicago','America/Denver','America/Los_Angeles','America/Toronto','America/Sao_Paulo','Australia/Sydney','Pacific/Auckland','UTC'];
import {toolMetrics} from '../measurement.js';
export function mount(root,{lang='ko',t=tFor(lang),toast=()=>{}}={}){
 const metrics=toolMetrics('timezone');let selected=null,revision=0,alive=true;const error=errorBox(),rows=el('div',{class:'aux-rows'}),output=el('section',{class:'panel','aria-live':'polite'}),slots=el('section',{class:'panel','aria-live':'polite'});
 const baseZone=el('input',{value:'Asia/Seoul',list:'aux-timezone-list',maxlength:80}),local=el('input',{type:'datetime-local',value:localStamp(Date.now(),'Asia/Seoul').replace(' ','T'),min:'1970-01-01T00:00',max:'2100-12-31T23:59'});
 const duration=select([['30',t('30분','30 minutes')],['60',t('60분','60 minutes')],['90',t('90분','90 minutes')],['120',t('120분','120 minutes')]],'60');
 const days=select([['1',t('24시간','24 hours')],['3',t('72시간','72 hours')],['7',t('168시간','168 hours')]],'7');
 const title=el('input',{value:t('회의','Meeting'),maxlength:200});
 const ambiguity=select([['',t('어느 시각인지 선택하세요','Choose which occurrence')]],''),ambiguityWrap=field(t('DST 중복 시각 선택','Choose the DST occurrence'),ambiguity);ambiguityWrap.hidden=true;
 const ics=button(t('선택 시각 ICS 저장','Save selected time as ICS'),()=>saveIcs(selected));ics.disabled=true;
 function saveIcs(ms){if(ms===null)return;const measurement=metrics.begin('calendar_export');try{const uid=typeof crypto.randomUUID==='function'?crypto.randomUUID():`meeting-${Date.now()}-${Math.floor(Math.random()*1000000)}`;const blob=new Blob([makeIcs(ms,Number(duration.value),title.value,uid)],{type:'text/calendar;charset=utf-8'});metrics.success(measurement);metrics.artifact(measurement);metrics.download('calendar_export',measurement);download(blob,'meeting.ics');toast(t('UTC 시각이 담긴 ICS를 저장했습니다. 자동 초대는 하지 않습니다.','ICS saved with UTC times. No invitations are sent.'));}catch(e){metrics.fail(measurement,'validation');showError(error,e,t);}}
 function dirty(){metrics.cancelAction('timezone_resolve');revision++;selected=null;ics.disabled=true;error.hidden=true;output.replaceChildren(el('p',{class:'aux-muted'},t('시각과 지역을 입력하고 변환하세요.','Enter a date, time, and zones, then convert.')));slots.replaceChildren();setDirty();}
 function clearAmbiguity(){ambiguity.value='';ambiguityWrap.hidden=true;dirty();}
 local.addEventListener('input',clearAmbiguity);baseZone.addEventListener('input',clearAmbiguity);
 const add=button(t('+ 지역 추가','+ Add zone'),()=>{addZone();dirty();},true);
 function addZone(zone='UTC',start='09:00',end='17:00'){if(rows.children.length>=6)return;const row=el('div',{class:'aux-zone-row'},field(t('IANA 시간대','IANA time zone'),el('input',{value:zone,list:'aux-timezone-list',maxlength:80,'data-key':'zone'})),field(t('가능 시작','Available from'),el('input',{type:'time',value:start,'data-key':'start'})),field(t('가능 종료','Available until'),el('input',{type:'time',value:end,'data-key':'end'})),button(t('삭제','Remove'),()=>{row.remove();add.disabled=false;dirty();},true));row.addEventListener('input',dirty);rows.append(row);add.disabled=rows.children.length>=6;}
 const format=(ms,zone)=>new Intl.DateTimeFormat(lang==='en'?'en-GB':'ko-KR',{timeZone:zone,dateStyle:'full',timeStyle:'short'}).format(new Date(ms));
 const convert=button(t('변환 / 공통 시간 찾기','Convert / Find overlap'),calculate);
 async function calculate(){error.hidden=true;const own=++revision,measurement=metrics.begin('timezone_resolve');convert.disabled=true;try{
  const candidates=resolveLocal(local.value,baseZone.value.trim());
  if(!candidates.length){error.textContent=t('이 지역에서 DST 전환으로 존재하지 않는 시각입니다. 다른 시각을 선택하세요.','This local time does not exist because of a DST transition. Choose another time.');error.hidden=false;metrics.fail(measurement,'validation');return;}
  if(candidates.length>1){const old=ambiguity.value;ambiguity.replaceChildren(el('option',{value:''},t('어느 시각인지 선택하세요','Choose which occurrence')),...candidates.map((ms,i)=>el('option',{value:String(ms)},`${i+1}. ${new Date(ms).toISOString()} (UTC)`)));ambiguity.value=candidates.map(String).includes(old)?old:'';ambiguityWrap.hidden=false;if(!ambiguity.value){error.textContent=t('DST 종료로 같은 현지 시각이 두 번 있습니다. UTC 시각을 보고 하나를 명시적으로 선택하세요.','The local time occurs twice at the end of DST. Explicitly choose one UTC occurrence.');error.hidden=false;ambiguity.focus();metrics.cancel(measurement,'needs_choice');return;}}
  else{ambiguityWrap.hidden=true;ambiguity.value='';}
  const when=candidates.length>1?Number(ambiguity.value):candidates[0];
  const zones=[...rows.children].map(r=>Object.fromEntries([...r.querySelectorAll('[data-key]')].map(x=>[x.dataset.key,x.value.trim()])));
  if(!zones.length)throw new Error('ZONE_LIMIT');
  output.replaceChildren(el('p',{},t('시간대를 계산하고 있습니다…','Calculating time zones…')));slots.replaceChildren();
  await new Promise(resolve=>setTimeout(resolve,20));if(!alive||own!==revision)return;
  const overlaps=findOverlaps(when,zones,Number(duration.value),Number(days.value));
  selected=when;ics.disabled=false;
  const table=el('table',{class:'result-table'},el('thead',{},el('tr',{},el('th',{},t('지역','Zone')),el('th',{},t('현지 날짜 / 시각','Local date / time')))),el('tbody',{},zones.map(z=>el('tr',{},el('td',{},z.zone),el('td',{},format(when,z.zone))))));
  output.replaceChildren(el('h3',{},t('선택 시각의 지역별 시간','Selected time in each zone')),el('p',{class:'aux-muted'},`${new Date(when).toISOString()} · UTC`),el('div',{class:'aux-table-wrap'},table));
  slots.replaceChildren(el('h3',{},t('공통 가능 시간','Shared available times')),el('p',{class:'aux-muted'},t(`선택 시각부터 ${Number(days.value)*24}시간 동안 30분 간격으로 검색 · 최대 30개 표시 · 주말 포함`,`30-minute start intervals over the next ${Number(days.value)*24} hours · up to 30 results · weekends included`)));
  if(!overlaps.length)slots.append(el('p',{},t('겹치는 시간이 없습니다. 가능 시간이나 검색 기간을 넓혀 보세요.','No overlap found. Widen availability or the search period.')));
  else for(const ms of overlaps){slots.append(el('div',{class:'aux-slot'},el('div',{},zones.map(z=>el('p',{},`${z.zone}: ${localStamp(ms,z.zone)} → ${localStamp(ms+Number(duration.value)*60000,z.zone)}`))),button(t('이 시간 ICS','Save this time'),()=>saveIcs(ms),true)));}
 metrics.success(measurement);metrics.artifact(measurement);
 }catch(e){metrics.fail(measurement,'validation');selected=null;ics.disabled=true;output.replaceChildren();slots.replaceChildren();showError(error,e,t);}finally{if(alive)convert.disabled=false;}}
 for(const input of [duration,days])input.addEventListener('change',dirty);ambiguity.addEventListener('change',()=>{dirty();calculate();});title.addEventListener('input',()=>setDirty());
 root.replaceChildren(el('div',{class:'aux-tool'},el('datalist',{id:'aux-timezone-list'},COMMON.map(z=>el('option',{value:z}))),el('div',{class:'notice'},t('최대 6개 시간대. 브라우저 Intl의 시간대 규칙을 사용합니다. DST의 없는 시각은 차단하고, 중복 시각은 직접 선택합니다. 캘린더 연결·초대·외부 전송은 없습니다.','Up to 6 time zones using browser Intl rules. Nonexistent DST times are blocked; repeated times require your choice. No calendar connection, invitations, or external transmission.')),el('section',{class:'panel'},el('div',{class:'grid-2'},field(t('기준 지역 (IANA)','Reference zone (IANA)'),baseZone),field(t('기준 지역의 날짜 / 시각','Local reference date / time'),local)),ambiguityWrap,rows,toolbar(add),el('p',{class:'aux-muted'},t('가능 종료가 시작보다 이르면 자정을 넘는 구간입니다. 시작=종료는 허용하지 않습니다. 실제 일정·공휴일을 조회하지 않습니다.','An end before the start means overnight availability. Equal start/end times are not allowed. Actual calendars and holidays are not checked.')),el('div',{class:'grid-2'},field(t('회의 길이','Meeting duration'),duration),field(t('검색 범위','Search horizon'),days)),field(t('ICS 제목 (로컬 파일에만 포함)','ICS title (local file only)'),title),toolbar(convert,ics),error),output,slots));
 addZone('Asia/Seoul');addZone('Europe/London');addZone('America/New_York');dirty();setDirty(false);return()=>{metrics.dispose();alive=false;revision++;};
}
