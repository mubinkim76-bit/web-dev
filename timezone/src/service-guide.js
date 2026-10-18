export const copy = {
  "ko": {
    "title": "시간대와 회의 시간",
    "description": "여러 지역의 시각을 변환하고 가능한 회의 시간과 ICS 파일을 확인하세요.",
    "steps": [
      "기준 지역의 날짜·시각과 비교할 시간대를 입력하세요.",
      "각 지역의 가능 시간과 회의 길이를 정하고 변환하세요.",
      "겹치는 시간과 DST 안내를 확인하고 ICS를 저장하세요."
    ],
    "scope": "브라우저 Intl의 IANA 시간대 규칙과 UTC 기반 ICS를 사용합니다.",
    "limits": "1–6개 시간대, 1970–2100년 날짜. 실제 일정·공휴일 조회, 캘린더 계정 연결과 자동 초대는 없습니다.",
    "start": "기준 날짜·시각과 지역을 확인하고 변환하세요. 초기 값은 확정된 회의 일정이 아닙니다.",
    "recovery": "DST로 존재하지 않는 시각은 다른 시각을 선택하세요. 두 번 존재하는 시각은 UTC 후보 중 하나를 고르세요. 겹치는 시간이 없으면 가능 범위를 넓히세요."
  },
  "en": {
    "title": "Time zones & meetings",
    "description": "Convert times across regions, find overlapping availability and export an ICS file.",
    "steps": [
      "Enter a reference date/time and the time zones to compare.",
      "Set availability and meeting duration, then convert.",
      "Review overlaps and DST notices, then save an ICS file."
    ],
    "scope": "Uses browser Intl IANA time-zone rules and UTC-based ICS files.",
    "limits": "1–6 time zones and dates from 1970–2100. No actual calendar/holiday lookup, account connection or automatic invitations.",
    "start": "Check the reference date/time and zones, then convert. Initial values are not a confirmed meeting.",
    "recovery": "For a nonexistent DST time, choose another time. For a repeated time, select one UTC occurrence. Widen availability if no overlap is found."
  }
};

export function createGuide(lang){
 const c=copy[lang], d=document, node=(tag,text)=>{const n=d.createElement(tag);n.textContent=text;return n;};
 const details=d.createElement('details');details.className='service-guide';
 details.append(node('summary',lang==='en'?'How to use · scope · troubleshooting':'사용법 · 지원 범위 · 문제 해결'));
 const body=d.createElement('div');body.className='service-guide-content';
 body.append(node('h2',lang==='en'?'Three steps':'3단계 사용법'));
 const list=d.createElement('ol');for(const step of c.steps)list.append(node('li',step));body.append(list);
 for(const [label,key] of [[lang==='en'?'Supported features':'지원 기능','scope'],[lang==='en'?'Limits':'지원 제한','limits'],[lang==='en'?'If something goes wrong':'문제가 생기면','recovery']])body.append(node('h2',label),node('p',c[key]));
 details.append(body);return details;
}
export function updateMetadata(lang){
 const c=copy[lang];document.title=c.title;document.documentElement.lang=lang;
 const canonical=document.querySelector('link[rel="canonical"]'),alternate=document.querySelector('link[hreflang="'+lang+'"]');if(canonical&&alternate)canonical.href=alternate.href;
 for(const [selector,value] of [['meta[name="description"]',c.description],['meta[property="og:title"]',c.title],['meta[property="og:description"]',c.description],['meta[property="og:locale"]',lang==='en'?'en_US':'ko_KR']]){const n=document.querySelector(selector);if(n)n.content=value;}
}
