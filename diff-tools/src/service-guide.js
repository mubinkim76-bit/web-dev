export const copy = {
  "ko": {
    "title": "텍스트·CSV 비교",
    "description": "두 텍스트의 변경 사항이나 키로 연결한 CSV 행의 차이를 비교하세요.",
    "steps": [
      "텍스트 또는 CSV 비교를 선택하고 양쪽 내용을 입력하세요.",
      "공백·대소문자 옵션이나 CSV 키 열을 선택하세요.",
      "차이와 비교 범위 안내를 확인하고 JSON을 저장하세요."
    ],
    "scope": "원문 문자열을 유지하며 정확 비교 또는 큰 입력의 구간 비교 여부를 표시합니다.",
    "limits": "텍스트 한쪽당 1 MiB·입력창 실제 줄 2,000개. CSV 한쪽당 10,000행·100열이며 중복·누락 키는 허용하지 않습니다.",
    "start": "왼쪽과 오른쪽에 비교할 내용을 넣으세요. CSV 모드에서는 행을 연결할 키 열이 필요합니다.",
    "recovery": "CSV 키가 비어 있거나 중복되는지 확인하세요. 큰 텍스트가 구간 비교로 표시되면 작은 범위로 나눠 다시 비교하세요."
  },
  "en": {
    "title": "Text & CSV comparison",
    "description": "Compare changes between two texts or differences between CSV rows matched by key.",
    "steps": [
      "Choose text or CSV comparison and enter both sides.",
      "Select whitespace/case options or the CSV key column.",
      "Review differences and scope notices, then save JSON."
    ],
    "scope": "Preserves original strings and indicates exact comparison or coarse fallback for large inputs.",
    "limits": "Text: 1 MiB and 2,000 physical textarea lines per side. CSV: 10,000 rows and 100 columns per side; duplicate or missing keys are rejected.",
    "start": "Enter content on both sides. CSV mode requires a key column to match rows.",
    "recovery": "Check for missing or duplicate CSV keys. If large text uses coarse comparison, compare smaller sections for finer detail."
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
