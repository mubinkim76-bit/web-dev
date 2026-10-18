export const copy = {
  "ko": {
    "title": "사진 보고서",
    "description": "사진과 직접 입력한 설명을 A4 또는 Letter 보고서로 배치하고 PDF로 저장하세요.",
    "steps": [
      "사진을 추가하고 순서를 정하세요.",
      "제목·설명·날짜와 페이지 배치를 입력하세요.",
      "모든 페이지를 확인하고 PDF를 저장하세요."
    ],
    "scope": "페이지당 2·4·6장 배치와 파일명이 정확히 일치하는 설명 CSV를 지원합니다.",
    "limits": "데스크톱 최대 30장·100 MiB·사진당 24 MP, 좁은 화면 최대 10장·40 MiB·12 MP. 설명은 300자까지. OCR·날짜 자동 추출은 없습니다.",
    "start": "사진을 추가하면 보고서 구성을 시작할 수 있습니다. 설명과 날짜는 직접 확인해 입력하세요.",
    "recovery": "사진 한도를 확인하세요. CSV 설명이 연결되지 않으면 파일명과 열 형식을 확인하고 다시 가져오세요."
  },
  "en": {
    "title": "Photo report",
    "description": "Arrange photos and manually entered captions into an A4 or Letter report and save a PDF.",
    "steps": [
      "Add photos and arrange their order.",
      "Enter the title, captions and dates; choose a layout.",
      "Review every page and save the PDF."
    ],
    "scope": "Supports two, four or six photos per page and caption CSV imports matched by exact file name.",
    "limits": "Desktop: up to 30 photos, 100 MiB total and 24 MP per photo. Narrow screens: 10 photos, 40 MiB and 12 MP. Captions: 300 characters. No OCR or automatic date extraction.",
    "start": "Add photos to begin the report. Check and enter captions and dates yourself.",
    "recovery": "Check photo limits. If CSV captions do not match, check file names and column format before importing again."
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
