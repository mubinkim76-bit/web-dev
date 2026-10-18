export const copy = {
  "ko": {
    "title": "견적·청구서",
    "description": "품목·수량·단가와 할인·세금을 입력해 견적서나 일반 청구서를 만들고 인쇄하세요.",
    "steps": [
      "문서 종류와 발행·수신 정보를 입력하세요.",
      "품목·수량·단가와 할인·세금을 확인하세요.",
      "합계를 검토하고 인쇄하거나 브라우저에서 PDF로 저장하세요."
    ],
    "scope": "소수 계산을 반영한 품목별 금액·합계와 인쇄용 문서를 제공합니다.",
    "limits": "품목 1–100개, 숫자 입력 소수점 이하 최대 6자리. 전자세금계산서 발급·결제 수금·회계 적합성 판단은 하지 않습니다.",
    "start": "문서 정보와 첫 품목을 입력하세요. 표시된 초기 값은 실제 거래 정보로 확인·수정하세요.",
    "recovery": "숫자 형식과 허용 범위를 확인하세요. 인쇄가 열리지 않으면 브라우저 인쇄 설정을 확인하고 다시 시도하세요."
  },
  "en": {
    "title": "Estimates & invoices",
    "description": "Create and print an estimate or general invoice from items, quantities, prices, discounts and tax.",
    "steps": [
      "Choose the document type and enter sender and recipient details.",
      "Enter items, quantities and prices; check discount and tax.",
      "Review totals, then print or use the browser’s Save as PDF."
    ],
    "scope": "Provides decimal-based line amounts, totals and a print-ready document.",
    "limits": "1–100 items and up to six decimal places in numeric inputs. No electronic tax invoice issuance, payment collection or accounting compliance assessment.",
    "start": "Enter document details and the first item. Check and replace initial values with your actual transaction details.",
    "recovery": "Check numeric formats and allowed ranges. If printing does not open, check browser print settings and try again."
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
