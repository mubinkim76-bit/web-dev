export const copy = {
  "ko": {
    "title": "이미지 일괄 변환",
    "description": "사진 여러 장의 크기·형식·파일명을 바꾸고 개별 파일이나 ZIP으로 저장하세요.",
    "steps": [
      "JPEG·PNG·정적 WebP 이미지를 추가하세요.",
      "출력 크기·형식·파일명을 설정하세요.",
      "미리보기와 결과를 확인한 뒤 내려받으세요."
    ],
    "scope": "최대 3개 출력 프리셋과 JSON 설정 가져오기·저장을 지원합니다.",
    "limits": "데스크톱 최대 20장·100 MiB·이미지당 24 MP, 좁은 화면 최대 10장·40 MiB·12 MP. 출력 크기 16–4096px. HEIC·RAW·SVG·애니메이션은 지원하지 않습니다.",
    "start": "먼저 지원 형식의 이미지를 추가하세요. 파일 추가만으로 변환 결과가 저장되지는 않습니다.",
    "recovery": "파일 형식·용량·픽셀 수를 확인하세요. 처리에 실패하면 해당 파일을 제외하거나 더 작은 이미지로 다시 시도하세요."
  },
  "en": {
    "title": "Batch image converter",
    "description": "Resize, convert and rename multiple images, then save individual files or a ZIP.",
    "steps": [
      "Add JPEG, PNG or static WebP images.",
      "Set output dimensions, format and file names.",
      "Review the preview and results, then download."
    ],
    "scope": "Supports up to three output presets and importing or saving settings as JSON.",
    "limits": "Desktop: up to 20 images, 100 MiB total and 24 MP per image. Narrow screens: 10 images, 40 MiB and 12 MP. Output dimensions: 16–4096px. HEIC, RAW, SVG and animation are unsupported.",
    "start": "Start by adding a supported image. Adding a file does not save converted results.",
    "recovery": "Check file format, size and pixel count. Remove a failing file or retry with a smaller image."
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
