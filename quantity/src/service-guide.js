export const copy = {
  "ko": {
    "title": "자재 수량 계산",
    "description": "면적·여유분·포장 단위를 바탕으로 타일이나 페인트의 예상 구매 수량을 계산하세요.",
    "steps": [
      "타일 또는 페인트를 선택하고 공간별 면적을 입력하세요.",
      "포장당 면적·여유분·도장 횟수와 가격을 확인하세요.",
      "필요 수량·비용을 검토하고 CSV로 저장하거나 인쇄하세요."
    ],
    "scope": "공간 면적을 합산한 뒤 포장 수를 올림하고 예상 비용을 계산합니다.",
    "limits": "1–20개 공간, 면적·포장당 면적은 양수, 도장 횟수 1–10회. 추정치이며 현장 조건이나 구조 적합성을 판단하지 않습니다.",
    "start": "첫 공간의 면적과 제품 포장 정보를 입력하세요. 초기 값은 실제 현장에 맞게 수정하세요.",
    "recovery": "단위·양수 입력·도장 횟수를 확인하세요. 결과가 예상과 다르면 포장당 면적과 여유분을 다시 확인하세요."
  },
  "en": {
    "title": "Material quantity calculator",
    "description": "Estimate tile or paint purchase quantities from area, waste allowance and package coverage.",
    "steps": [
      "Choose tile or paint and enter each room’s area.",
      "Check package coverage, waste, coats and price.",
      "Review quantities and cost, then save CSV or print."
    ],
    "scope": "Adds room areas before rounding up package counts and estimating cost.",
    "limits": "1–20 rooms; area and coverage must be positive; 1–10 paint coats. Estimates do not assess site conditions or structural suitability.",
    "start": "Enter the first room’s area and product coverage. Replace initial values with your actual site measurements.",
    "recovery": "Check units, positive values and coat count. If results look unexpected, recheck package coverage and waste allowance."
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
