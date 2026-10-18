export const copy = {
  "ko": {
    "title": "영수증 수동 정리",
    "description": "영수증 이미지에 날짜·금액·통화를 직접 입력하고 확인한 항목의 CSV와 증빙 PDF를 만드세요.",
    "steps": [
      "영수증 이미지를 추가하세요.",
      "날짜·금액·통화를 직접 입력하고 항목을 확인 처리하세요.",
      "통화별 합계를 검토하고 CSV·증빙 PDF를 저장하세요."
    ],
    "scope": "확인한 항목만 통화별 합계와 내보내기에 포함됩니다.",
    "limits": "최대 10장·합계 30 MiB·이미지당 12 MP. OCR·환율 변환·세무 또는 회계 판단은 없습니다.",
    "start": "영수증을 추가한 뒤 내용을 직접 입력하세요. 이미지만 추가한 항목은 확인된 거래가 아닙니다.",
    "recovery": "이미지 한도와 입력값을 확인하세요. 내보낼 항목이 없으면 각 거래의 확인 여부를 점검하세요."
  },
  "en": {
    "title": "Manual receipt organizer",
    "description": "Manually enter dates, amounts and currencies for receipt images, then export confirmed records as CSV and evidence PDF.",
    "steps": [
      "Add receipt images.",
      "Manually enter dates, amounts and currencies, then confirm each record.",
      "Review totals by currency and save CSV or evidence PDF."
    ],
    "scope": "Only confirmed records are included in totals by currency and exports.",
    "limits": "Up to 10 images, 30 MiB total and 12 MP per image. No OCR, currency conversion, tax advice or accounting decisions.",
    "start": "Add receipts and enter their details manually. An uploaded image alone is not a confirmed transaction.",
    "recovery": "Check image limits and entered values. If there is nothing to export, check whether each transaction is confirmed."
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
