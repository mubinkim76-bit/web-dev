export const copy = {
  "ko": {
    "title": "CSV·TSV 정리와 병합",
    "description": "CSV·TSV 파일의 열을 맞추고 정리 규칙을 적용해 병합 결과를 저장하세요.",
    "steps": [
      "UTF-8 CSV·TSV 파일을 추가하거나 내용을 붙여 넣으세요.",
      "구분자·헤더·열 매핑과 정리 규칙을 확인하세요.",
      "미리보기와 내보내기 경고를 검토하고 저장하세요."
    ],
    "scope": "위치 기반 열 매핑, 문자열 치환, 빈 행 정리와 변환 셀 검토를 지원합니다.",
    "limits": "최대 3파일·합계 2 MiB·10,000행·100열. 붙여넣기 입력창은 실제 줄 2,000개까지. 셀은 문자열이며 스프레드시트 재열기 결과를 보장하지 않습니다.",
    "start": "파일을 추가하거나 CSV 내용을 붙여 넣으세요. 파일 읽기가 끝난 뒤 열 매핑을 확인하세요.",
    "recovery": "UTF-8 인코딩·구분자·따옴표 형식과 한도를 확인하세요. 수식처럼 해석될 수 있는 셀은 내보내기 경고를 읽고 처리 방식을 선택하세요."
  },
  "en": {
    "title": "CSV & TSV cleanup",
    "description": "Map columns in CSV or TSV files, apply cleanup rules and save the merged result.",
    "steps": [
      "Add UTF-8 CSV/TSV files or paste their contents.",
      "Check delimiters, headers, column mapping and cleanup rules.",
      "Review the preview and export warnings, then save."
    ],
    "scope": "Supports positional column mapping, literal replacement, empty-row cleanup and transformed-cell review.",
    "limits": "Up to three files, 2 MiB combined, 10,000 rows and 100 columns. Pasted text: 2,000 physical lines. Cells remain strings; spreadsheet round trips are not guaranteed.",
    "start": "Add a file or paste CSV content. Wait for reading to finish before checking column mapping.",
    "recovery": "Check UTF-8 encoding, delimiters, quoting and limits. Read export warnings for formula-like cells and choose how to handle them."
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
