export const copy = {
  "ko": {
    "title": "텍스트 정리와 글자 수",
    "description": "공백·빈 줄·중복 줄을 정리하고 글자 수와 UTF-8 크기를 확인하세요.",
    "steps": [
      "정리할 텍스트를 붙여 넣으세요.",
      "필요한 정리 규칙과 순서를 선택하세요.",
      "결과를 확인하고 TXT로 내려받으세요."
    ],
    "scope": "문자열 기반 치환, 글자·단어·줄 집계, 작업 취소와 원본 복원을 지원합니다.",
    "limits": "UTF-8 1 MiB·입력창 실제 줄 2,000개까지. 문장 의미를 다시 쓰거나 문서 파일 형식을 변환하지 않습니다.",
    "start": "텍스트를 붙여 넣고 필요한 규칙만 선택하세요. 결과를 원문과 비교한 뒤 저장하세요.",
    "recovery": "용량이나 줄 수 한도를 넘으면 텍스트를 나눠 처리하세요. 원치 않는 결과는 원본을 복원하고 규칙을 조정하세요."
  },
  "en": {
    "title": "Text cleanup & counts",
    "description": "Clean up whitespace, blank lines and duplicate lines; check character counts and UTF-8 size.",
    "steps": [
      "Paste the text to clean.",
      "Choose the cleanup rules and their order.",
      "Review the result and download a TXT file."
    ],
    "scope": "Supports literal replacement, character/word/line counts, cancellation and restoring the original.",
    "limits": "Up to 1 MiB of UTF-8 text and 2,000 physical textarea lines. No semantic rewriting or document-format conversion.",
    "start": "Paste text and select only the rules you need. Compare the result with the original before saving.",
    "recovery": "Split text that exceeds size or line limits. Restore the original and adjust rules if the result is not what you intended."
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
