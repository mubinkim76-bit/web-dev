export const copy = {
  "ko": {
    "title": "로컬 오목",
    "description": "15×15 자유룰 오목을 컴퓨터와 두거나 한 기기에서 두 사람이 번갈아 즐기세요.",
    "steps": [
      "컴퓨터 대전 또는 같은 기기 2인용을 선택하세요.",
      "교차점을 선택한 뒤 착수 버튼으로 돌을 놓으세요.",
      "다섯 개 이상을 연결하세요. 필요하면 힌트·무르기를 사용하세요."
    ],
    "scope": "힌트·무르기·판 확대와 선택적 현재 판 저장을 지원합니다. 6목도 승리하며 3·3과 4·4는 금지하지 않습니다.",
    "limits": "온라인 대전·계정·클라우드 저장·기보 내보내기는 없습니다. 기본은 메모리 저장이며 브라우저 저장은 선택 사항입니다.",
    "start": "대전 방식을 선택하고 게임을 시작하세요. 온라인 상대를 찾는 대기실은 없습니다.",
    "recovery": "컴퓨터 응답 오류는 다시 시도를 사용하세요. 저장 복원이 실패하면 새 판으로 시작할 수 있습니다. 다른 탭의 저장 충돌 안내가 나오면 계속할 판을 선택하세요."
  },
  "en": {
    "title": "Local Gomoku",
    "description": "Play 15×15 freestyle Gomoku against the computer or take turns with a friend on one device.",
    "steps": [
      "Choose a computer opponent or two players on one device.",
      "Select an intersection, then confirm with the Place button.",
      "Connect five or more stones; use hints or undo when needed."
    ],
    "scope": "Supports hints, undo, board zoom and optional current-game saving. Overlines win; double-three and double-four moves are allowed.",
    "limits": "No online multiplayer, accounts, cloud saves or game-record export. Play stays in memory by default; browser saving is optional.",
    "start": "Choose a mode and start a game. There is no online matchmaking lobby.",
    "recovery": "Use Retry after a computer-response error. Start a new game if a save cannot be restored. If another tab changes the save, follow the conflict notice to choose how to continue."
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
