export const copy = {
  "ko": {
    "title": "정적 QR 코드",
    "description": "주소나 텍스트를 정적 QR 코드 하나로 만들고 PNG·SVG로 저장하세요.",
    "steps": [
      "주소 또는 텍스트 종류를 선택하고 내용을 입력하세요.",
      "출력 크기를 선택하고 QR을 생성하세요.",
      "PNG·SVG를 저장한 뒤 실제 스캔으로 확인하세요."
    ],
    "scope": "UTF-8 텍스트, PNG·SVG 저장과 인쇄용 문서를 지원합니다.",
    "limits": "최대 UTF-8 500바이트. HTTP·HTTPS 주소에 사용자 인증정보를 넣을 수 없습니다. 일괄·동적 QR, 주소 단축, 스캔 통계는 없습니다.",
    "start": "QR에 넣을 주소나 텍스트를 입력하세요. 생성하기 전에는 저장 버튼이 비활성화됩니다.",
    "recovery": "빈 입력·URL 형식·UTF-8 바이트 수를 확인하세요. 스캔이 어려우면 여백을 유지하고 출력 크기를 늘리세요."
  },
  "en": {
    "title": "Static QR code",
    "description": "Turn a URL or text into one static QR code and save it as PNG or SVG.",
    "steps": [
      "Choose URL or text and enter the content.",
      "Choose an output size and generate the QR code.",
      "Save PNG or SVG and verify it with a real scan."
    ],
    "scope": "Supports UTF-8 text, PNG/SVG export and a print document.",
    "limits": "Up to 500 UTF-8 bytes. HTTP/HTTPS URLs cannot contain credentials. No batch or dynamic QR, URL shortening or scan analytics.",
    "start": "Enter the URL or text to encode. Save buttons stay disabled until a QR is generated.",
    "recovery": "Check empty input, URL format and UTF-8 byte count. If scanning is difficult, keep the quiet zone and increase output size."
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
