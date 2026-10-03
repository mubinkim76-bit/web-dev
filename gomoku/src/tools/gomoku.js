import { setDirty } from '../shared.js';
import { BLACK, WHITE, SIZE, coordinate, newId, undoCount } from '../lib/gomoku-engine.js';
import { GomokuSession } from '../lib/gomoku-session.js';
import { CURRENT_KEY, SETTINGS_KEY, parseSave, readCurrent, serializeSave, writeCurrent, clearCurrent } from '../lib/gomoku-storage.js';

/** Local-only GAME11. The caller must call cleanup when changing routes. */
import {toolMetrics} from '../measurement.js';
export function mount(root,context={}){
  const metrics=toolMetrics('gomoku');let gameMeasurement=null,calculationMeasurement=null,completedGame=null;
  const lang = context.lang === 'en' ? 'en' : 'ko';
  const t = context.t || ((ko, en) => lang === 'en' ? en : ko);
  const esc = text => String(text).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const colorName = color => color === BLACK ? t('흑', 'Black') : t('백', 'White');
  let settings = { mode: 'ai', humanColor: BLACK, difficulty: 'easy' };
  const session = new GomokuSession(settings);
  const ownerId = newId();
  let phase = 'setup', selected = { row: 7, col: 7 }, showNumbers = false, zoom = false;
  let saveEnabled = false, activeSave = false, storage = null, expectedRaw = null, saved = null;
  let storageNotice = '', conflict = false, pending = null, hint = null, message = '';
  let worker = null, watchdog = null, busy = null, aiError = false, destroyed = false, liveGame = false;
  try {
    storage = window.localStorage;
    const current = readCurrent(storage);
    expectedRaw = storage.getItem(CURRENT_KEY);
    saved = current.saved;
    saveEnabled = current.enabled;
    if (current.error) storageNotice = t('저장된 게임을 복구할 수 없습니다. 새 게임으로 시작할 수 있습니다.', 'The saved game could not be restored. You can start a new game.');
  } catch { storageNotice = t('이 브라우저에서는 저장을 사용할 수 없습니다. 탭을 닫으면 게임이 사라집니다.', 'Storage is unavailable in this browser. The game will be lost when this tab closes.'); }

  function stopCalculation(){
    metrics.cancel(calculationMeasurement);calculationMeasurement=null;
    if (worker) worker.terminate();
    worker = null;
    if (watchdog) clearTimeout(watchdog);
    watchdog = null; busy = null;
    session.cancel();
  }
  function persist() {
    if (!activeSave || conflict || !storage) return;
    const raw = serializeSave(session.game, ownerId, newId(), showNumbers);
    const result = writeCurrent(storage, raw, expectedRaw);
    if (result.ok) { expectedRaw = result.raw; saved = parseSave(result.raw); }
    else if (result.conflict) { conflict = true; stopCalculation(); }
    else {
      activeSave = false; saveEnabled = false;
      storageNotice = t('저장하지 못했습니다. 현재 게임은 계속할 수 있지만 탭을 닫으면 이어할 수 없습니다.', 'The game could not be saved. You can keep playing, but cannot resume after this tab closes.');
    }
  }
  function failCalculation(){
    metrics.fail(calculationMeasurement);stopCalculation(); aiError = true;
    message = t('기기에서 계산을 완료하지 못했습니다. 다시 시도하거나 모드 선택에서 한 기기 2인으로 새 게임을 시작하세요.', 'This device could not complete the calculation. Retry, or choose same-device two-player mode for a new game.');
    render();
  }
  function calculate(purpose) {
    if (destroyed || conflict || pending || busy) return;
    const request = session.begin(purpose);
    if (!request) return;
    calculationMeasurement=metrics.begin(purpose==='ai'?'ai_move':'hint');
    aiError=false;busy=purpose; hint = null; message = '';
    try {
      worker = new Worker(new URL('./gomoku-worker.js', import.meta.url), { type: 'module' });
      const thisWorker = worker;
      watchdog = setTimeout(() => { if (worker === thisWorker) failCalculation(); }, 1500);
      thisWorker.onerror = () => { if (worker === thisWorker) failCalculation(); };
      thisWorker.onmessage = ({ data }) => {
        if (worker !== thisWorker || destroyed) return;
        // An unrelated or out-of-date message must not retire the live request.
        // Keep its watchdog running until a matching response or explicit cancellation.
        if (!session.accepts(data)) return;
        const accepted = session.receive(data);
        thisWorker.terminate(); worker = null;
        clearTimeout(watchdog); watchdog = null; busy = null;
        if(accepted.stale){metrics.cancel(calculationMeasurement,'superseded');calculationMeasurement=null;render();return;}
        if (!accepted.ok) { failCalculation(); return; }
        metrics.success(calculationMeasurement);calculationMeasurement=null;finishGame();
        if(accepted.hint){
          hint = { ...accepted.hint, revision: session.game.revision, reason: accepted.reason };
          selected = { row: hint.row, col: hint.col };
          message = t('힌트는 추천일 뿐 승리를 보장하지 않습니다. 선택 위치를 확인한 뒤 놓으세요.', 'A hint is a suggestion, not a guaranteed win. Check the selected point before placing a stone.');
        } else { hint = null; persist(); }
        render();
      };
      thisWorker.postMessage(request);
    } catch { failCalculation(); return; }
    render();
  }
  function syncAI() {
    const game = session.game;
    if (phase === 'play' && !pending && !conflict && !busy && !aiError && game.status === 'playing' && game.settings.mode === 'ai' && game.turn !== game.settings.humanColor) calculate('ai');
  }
  function finishGame(){const g=session.game;if(['won','draw'].includes(g.status)&&completedGame!==g.gameId&&gameMeasurement){metrics.success(gameMeasurement,g.status);completedGame=g.gameId;gameMeasurement=null;}}
  function changed(){finishGame();hint=null; aiError = false; message = ''; persist(); render(); syncAI(); }
  function confirmAction(text, action) {
    stopCalculation(); pending = { text, action }; render();
    root.querySelector('[data-action="confirm-yes"]')?.focus();
  }
  function startGame(nextSettings = settings) {
    let saveNewGame = saveEnabled && Boolean(storage), latestRaw = expectedRaw, latestSaved = null;
    const storageUnavailable = () => {
      activeSave = false; saveEnabled = false;
      storageNotice = t('저장 상태를 확인하지 못해 저장을 껐습니다. 기존 저장은 바꾸지 않으며 현재 탭에서만 게임을 계속할 수 있습니다.', 'Storage could not be checked, so saving is off. The existing save is unchanged; you can keep playing in this tab.');
    };
    if (saveNewGame) {
      try {
        latestRaw = storage.getItem(CURRENT_KEY);
        try { latestSaved = latestRaw ? parseSave(latestRaw) : null; } catch { /* Unknown saves also require explicit replacement approval. */ }
      } catch { storageUnavailable(); saveNewGame = false; }
    }
    const begin = () => {
      // Approval applies only to the save inspected before the confirmation opened.
      // Keep the local game too if another write arrives before the user confirms.
      if (saveNewGame) {
        try {
          if (storage.getItem(CURRENT_KEY) !== latestRaw) { conflict = true; stopCalculation(); hint = null; render(); return; }
        } catch { storageUnavailable(); render(); syncAI(); return; }
      }
      metrics.cancel(gameMeasurement,'superseded');gameMeasurement=metrics.begin('game');
      stopCalculation();session.reset(nextSettings); settings = { ...nextSettings };
      phase = 'play'; liveGame = true; selected = { row: 7, col: 7 }; hint = null; message = ''; aiError = false; conflict = false;
      activeSave = saveNewGame;
      if (activeSave) expectedRaw = latestRaw;
      changed();
      root.querySelector('.gm-board')?.focus();
    };
    const unfinished = liveGame && session.game.status === 'playing' && session.game.moves.length > 0;
    const savedUnfinished = saveNewGame && latestSaved?.game.status === 'playing' && latestSaved.game.moves.length > 0;
    const savedChanged = saveNewGame && (conflict || latestRaw !== expectedRaw || (latestRaw && !latestSaved));
    if (savedChanged) confirmAction(t('기기의 최신 저장을 새 게임으로 바꿀까요? 이 탭의 현재 게임도 끝납니다.', 'Replace the latest game saved on this device with a new game? This tab’s current game will also end.'), begin);
    else if (unfinished || savedUnfinished) confirmAction(t('진행 중인 게임을 끝내고 새 게임을 시작할까요?', 'End the current game and start a new one?'), begin);
    else begin();
  }
  function resumeSaved() {
    if (!storage) return;
    try {
      const raw = storage.getItem(CURRENT_KEY), current = parseSave(raw);
      metrics.cancel(gameMeasurement,'superseded');gameMeasurement=current.game.status==='playing'?metrics.begin('game'):null;
      stopCalculation();session.restore(current.game); settings = { ...current.game.settings };
      expectedRaw = raw; saved = current; activeSave = saveEnabled && Boolean(storage); conflict = false;
      showNumbers = current.uiSettings.showNumbers; phase = 'play'; liveGame = true;
      selected = { row: 7, col: 7 }; changed();
    } catch {
      storageNotice = t('저장된 게임을 복구할 수 없습니다. 새 게임을 시작해 주세요.', 'The saved game could not be restored. Please start a new game.');
      conflict = false; activeSave = false; saved = null; render();
    }
  }
  function place() {
    if (phase !== 'play' || conflict || pending) return;
    const revision = session.game.revision;
    // Confirmation stays on the occupied point after a move: repeat clicks cannot place twice.
    if (session.play(selected.row, selected.col, revision)) { stopCalculation(); changed(); }
    else { message = t('빈 교차점을 선택하고 자신의 차례에 놓으세요.', 'Choose an empty intersection on your turn.'); render(); }
  }
  function statusText() {
    const game = session.game;
    if (game.status === 'won') return t(`${colorName(game.winner)} 승리`, `${colorName(game.winner)} wins`);
    if (game.status === 'draw') return t('무승부', 'Draw');
    if (conflict) return t('다른 탭의 저장을 확인해 주세요', 'Another tab changed the saved game');
    if (busy === 'ai') return t(`${colorName(game.turn)} · AI 계산 중`, `${colorName(game.turn)} · AI thinking`);
    if (busy === 'hint') return t('힌트 계산 중', 'Finding a hint');
    return t(`${colorName(game.turn)} 차례`, `${colorName(game.turn)} to play`);
  }
  function button(action, text, options = '') { return `<button type="button" class="button secondary" data-action="${action}" ${options}>${esc(text)}</button>`; }
  function renderSetup() {
    return `<div class="panel gm-setup"><div class="gm-eyebrow">GAME11 · ${t('로컬 게임', 'LOCAL GAME')}</div><h2>${t('가볍게, 오목 한 판', 'A little pause. A game of Gomoku.')}</h2><p>${t('가입 없이 즐기는 오목. 모든 수와 AI 계산은 이 기기 안에서 처리됩니다.', 'Gomoku without an account. Every move and AI calculation stays on this device.')}</p>
      ${(liveGame || saved) ? `<div class="gm-resume notice"><strong>${liveGame ? t('이 탭의 게임', 'Game in this tab') : t('저장된 게임', 'Saved game')} · ${(liveGame ? session.game : saved.game).moves.length}${t('수', ' moves')}</strong>${button(liveGame ? 'continue' : 'resume', t('이어하기', 'Continue'))}</div>` : ''}
      <fieldset><legend>${t('대국 방식', 'Play mode')}</legend><div class="gm-choice-grid"><label class="gm-choice"><input name="gm-mode" type="radio" value="ai" ${settings.mode === 'ai' ? 'checked' : ''}><span><strong>${t('컴퓨터와', 'Play the computer')}</strong><small>${t('기기에서 계산하는 입문용 AI', 'A beginner-friendly local AI')}</small></span></label><label class="gm-choice"><input name="gm-mode" type="radio" value="local2p" ${settings.mode === 'local2p' ? 'checked' : ''}><span><strong>${t('한 기기 2인', 'Two on one device')}</strong><small>${t('같은 화면에서 번갈아 두세요', 'Take turns on the same screen')}</small></span></label></div></fieldset>
      ${settings.mode === 'ai' ? `<div class="grid-2"><label class="field">${t('내 돌', 'Your stones')}<select name="gm-color"><option value="1" ${settings.humanColor === 1 ? 'selected' : ''}>${t('흑 · 먼저 두기', 'Black · move first')}</option><option value="2" ${settings.humanColor === 2 ? 'selected' : ''}>${t('백 · 나중에 두기', 'White · move second')}</option></select></label><label class="field">${t('AI 탐색', 'AI search')}<select name="gm-difficulty"><option value="easy" ${settings.difficulty === 'easy' ? 'selected' : ''}>${t('쉬움 · 기본 패턴', 'Easy · basic patterns')}</option><option value="normal" ${settings.difficulty === 'normal' ? 'selected' : ''}>${t('보통 · 제한된 수읽기', 'Normal · limited look-ahead')}</option></select></label></div><p class="gm-small">${t('난이도는 계산 범위의 차이입니다. 공식 기력이나 승률을 보장하지 않습니다.', 'Difficulty changes the search budget. No official skill rating or win rate is promised.')}</p>` : ''}
      <label class="gm-check"><input name="gm-save" type="checkbox" ${saveEnabled ? 'checked' : ''} ${!storage ? 'disabled' : ''}>${t('이 기기에 현재 게임 저장', 'Save the current game on this device')}</label><p class="gm-small">${t('선택 사항 · 현재 1국만 브라우저에 저장합니다. 다른 기기와 동기화되지 않으며 언제든 끄거나 삭제할 수 있습니다.', 'Optional · stores only the current game in this browser. No cross-device sync. Turn it off or delete it anytime.')}</p>
      <p class="gm-rule-summary">${t('자유룰 · 15×15 · 흑/백 모두 5개 이상이면 승리 · 금수 없음', 'Freestyle · 15×15 · five or more wins for either color · no forbidden moves')}</p><button type="button" class="button gm-primary" data-action="start">${t('새 게임 시작', 'Start a new game')} <span aria-hidden="true">↗</span></button></div>`;
  }
  function renderBoard() {
    const game = session.game;
    const moveOrder = new Map(game.moves.map((move, index) => [move.row * SIZE + move.col, index + 1]));
    const last = game.moves.at(-1);
    const winners = new Set(game.winningLines.flat().map(move => move.row * SIZE + move.col));
    let grid = '';
    for (let row = 0; row < SIZE; row++) {
      grid += '<div class="gm-row" role="row">';
      for (let col = 0; col < SIZE; col++) {
        const index = row * SIZE + col, color = game.board[index], picked = selected.row === row && selected.col === col;
        const isLast = last?.row === row && last.col === col;
        const isHint = hint?.revision === game.revision && hint.row === row && hint.col === col;
        const label = `${coordinate(row, col)} · ${color ? colorName(color) : t('빈 교차점', 'empty')}${isLast ? t(' · 마지막 수', ' · last move') : ''}`;
        grid += `<div role="gridcell" id="gm-cell-${row}-${col}" class="gm-cell${picked ? ' is-selected' : ''}${isHint ? ' is-hint' : ''}" data-row="${row}" data-col="${col}" aria-label="${esc(label)}" aria-selected="${picked}" aria-rowindex="${row + 1}" aria-colindex="${col + 1}">${color ? `<span aria-hidden="true" class="gm-stone ${color === BLACK ? 'black' : 'white'}${isLast ? ' is-last' : ''}${winners.has(index) ? ' is-winner' : ''}">${showNumbers ? moveOrder.get(index) : isLast ? '<i></i>' : ''}</span>` : ''}</div>`;
      }
      grid += '</div>';
    }
    let lines = '';
    for (let i = 0; i < SIZE; i++) lines += `<path d="M50 ${50 + i * 100}H1450 M${50 + i * 100} 50V1450"/>`;
    let stars = '';
    for (const [r, c] of [[3, 3], [3, 11], [7, 7], [11, 3], [11, 11]]) stars += `<circle cx="${50 + c * 100}" cy="${50 + r * 100}" r="9"/>`;
    const wins = game.winningLines.map(line => `<line x1="${50 + line[0].col * 100}" y1="${50 + line[0].row * 100}" x2="${50 + line.at(-1).col * 100}" y2="${50 + line.at(-1).row * 100}"/>`).join('');
    return `<div class="gm-board-scroll${zoom ? ' is-zoomed' : ''}"><div class="gm-board-wrap"><div class="gm-column-labels" aria-hidden="true">${Array.from({ length: SIZE }, (_, i) => `<span>${String.fromCharCode(65 + i)}</span>`).join('')}</div><div class="gm-row-labels" aria-hidden="true">${Array.from({ length: SIZE }, (_, i) => `<span>${i + 1}</span>`).join('')}</div><div class="gm-board" role="grid" tabindex="0" aria-label="${t('오목판. 방향키로 선택, Enter 또는 Space로 착수', 'Gomoku board. Arrow keys select; Enter or Space places a stone')}" aria-describedby="gm-board-help" aria-rowcount="15" aria-colcount="15" aria-activedescendant="gm-cell-${selected.row}-${selected.col}"><svg class="gm-lines" viewBox="0 0 1500 1500" aria-hidden="true"><g>${lines}</g><g class="gm-stars">${stars}</g></svg>${grid}<svg class="gm-winning-lines" viewBox="0 0 1500 1500" aria-hidden="true">${wins}</svg></div></div></div>`;
  }
  function renderPlay() {
    const game = session.game, color = game.board[selected.row * SIZE + selected.col];
    const humanTurn = game.settings.mode === 'local2p' || game.turn === game.settings.humanColor;
    const canPlace = game.status === 'playing' && humanTurn && !color && !conflict && !pending;
    const modeLabel = game.settings.mode === 'ai' ? t('컴퓨터와', 'Against the computer') : t('한 기기 2인', 'Two on one device');
    const reason = hint?.reason === 'win' ? t('5개 이상 연결할 수 있는 자리', 'A point that connects five or more') : hint?.reason === 'block' ? t('상대의 즉시 승리를 막는 자리', 'A point that blocks an immediate win') : t('주변 연결과 방어를 고려한 자리', 'A suggestion based on connections and defense');
    return `<div class="gm-game-header"><div><div class="gm-eyebrow">${modeLabel} · ${t('15×15 자유룰', '15×15 freestyle')}</div><h2 id="gm-status" role="status" aria-live="polite">${esc(statusText())}</h2></div><div class="gm-counts"><span><i class="gm-mini black"></i>${t('흑', 'Black')} <b>${Math.ceil(game.moves.length / 2)}</b></span><span><i class="gm-mini white"></i>${t('백', 'White')} <b>${Math.floor(game.moves.length / 2)}</b></span><span>${t('총', 'Total')} <b>${game.moves.length}</b>${t('수', ' moves')}</span></div></div>
      <div class="gm-play-layout"><section class="gm-board-panel">${renderBoard()}<div class="gm-board-options"><label class="gm-check"><input name="gm-numbers" type="checkbox" ${showNumbers ? 'checked' : ''}>${t('돌 순서 보기', 'Move numbers')}</label>${button('zoom', zoom ? t('기본 크기', 'Fit board') : t('확대 보기', 'Enlarge board'), `aria-pressed="${zoom}"`)}</div><p id="gm-board-help" class="gm-small">${t('터치/클릭: 위치 선택 → 놓기 · 키보드: 방향키 이동, Enter/Space 착수, Tab으로 판 나가기', 'Tap/click: select, then Place · Keyboard: arrows to move, Enter/Space to place, Tab to leave the board')}</p></section>
      <aside class="panel gm-controls"><div class="gm-selection"><small>${t('선택 위치', 'Selected point')}</small><strong>${coordinate(selected.row, selected.col)}</strong><span>${color ? colorName(color) + t(' 돌 있음', ' stone') : t('빈 교차점', 'Empty intersection')}</span></div><button type="button" class="button gm-primary" data-action="place" ${canPlace ? '' : 'disabled'}>${t('선택 위치에 놓기', 'Place at selected point')}</button>
      ${hint && hint.revision === game.revision ? `<p class="notice gm-hint">${t('힌트', 'Hint')} ${coordinate(hint.row, hint.col)} · ${reason}</p>` : ''}
      <div class="gm-control-buttons">${button('undo', t('되돌리기', 'Undo'), undoCount(game) && !conflict ? '' : 'disabled')}${button('hint', busy === 'hint' ? t('힌트 취소', 'Cancel hint') : t('힌트 보기', 'Get a hint'), (game.status === 'playing' && humanTurn && !conflict && busy !== 'ai') ? '' : 'disabled')}${button('restart', t('새 게임', 'New game'))}${button('setup', t('모드 선택', 'Choose mode'))}</div>
      ${aiError ? `<div class="notice gm-error">${esc(message)}${button('retry', t('계산 다시 시도', 'Retry calculation'))}</div>` : ''}
      <p class="gm-small">${game.settings.mode === 'ai' ? t(`나는 ${colorName(game.settings.humanColor)} · ${game.settings.difficulty === 'easy' ? '쉬움' : '보통'} AI`, `You are ${colorName(game.settings.humanColor)} · ${game.settings.difficulty === 'easy' ? 'Easy' : 'Normal'} AI`) : t('두 사람이 함께 확인한 뒤 번갈아 두세요.', 'Take turns after checking the board together.')}</p>
      <label class="gm-check"><input name="gm-save" type="checkbox" ${activeSave ? 'checked' : ''} ${!storage || conflict ? 'disabled' : ''}>${t('이 기기에 현재 게임 저장', 'Save current game on this device')}</label><p class="gm-small">${activeSave ? t('현재 1국만 브라우저에 저장 중', 'Saving only this game in this browser') : t('저장 꺼짐 · 탭을 닫으면 게임이 사라집니다', 'Saving is off · closing this tab loses the game')}</p></aside></div>
      ${game.status !== 'playing' ? `<section class="gm-result panel" aria-label="${t('대국 결과', 'Game result')}"><h3>${esc(statusText())} · ${game.moves.length}${t('수', ' moves')}</h3><p>${game.status === 'won' ? t('연속 5개 이상을 완성했습니다. 승리한 연결선을 판에 표시했습니다.', 'Five or more connected stones. The winning lines are marked on the board.') : t('225칸이 모두 찼고 5개 이상의 연결이 없어 무승부입니다.', 'All 225 intersections are filled without a line of five or more.')}</p><div class="toolbar">${button('restart', t('다시 하기', 'Play again'))}${button('swap', game.settings.mode === 'ai' ? t('내 돌 색 바꾸고 다시 하기', 'Switch my color and replay') : t('두 사람이 자리 바꾸고 다시 하기', 'Swap player roles and replay'))}</div></section>` : ''}`;
  }
  function render() {
    if (destroyed) return;
    setDirty(liveGame && session.game.moves.length > 0 && session.game.status === 'playing' && (!activeSave || conflict));
    const active = document.activeElement;
    const focusAction = root.contains(active) ? active?.dataset?.action : null;
    const focusName = root.contains(active) ? active?.name : null;
    const boardFocused = active?.classList.contains('gm-board');
    const scroll = root.querySelector('.gm-board-scroll');
    const scrollPosition = scroll ? { x: scroll.scrollLeft, y: scroll.scrollTop } : null;
    root.innerHTML = `<div class="gomoku">${phase === 'setup' ? renderSetup() : renderPlay()}
      ${pending ? `<section class="gm-confirm notice" role="alertdialog" aria-label="${t('확인', 'Confirm')}" aria-describedby="gm-confirm-text"><p id="gm-confirm-text">${esc(pending.text)}</p><div class="toolbar">${button('confirm-yes', t('확인', 'Confirm'))}${button('confirm-no', t('취소', 'Cancel'))}</div></section>` : ''}
      ${conflict ? `<section class="gm-conflict notice" role="alert"><strong>${t('다른 탭에서 현재 게임이 바뀌었습니다.', 'The saved game changed in another tab.')}</strong><p>${t('이 탭의 계산과 저장을 멈췄습니다. 최신 저장을 이어가거나, 저장 없이 별도 게임을 시작하세요.', 'Calculation and saving are paused here. Continue the latest save, or start a separate game without saving.')}</p><div class="toolbar">${button('takeover', t('이 탭에서 최신 저장 이어하기', 'Continue the latest save in this tab'))}${button('separate', t('저장 없이 새 게임', 'New game without saving'))}</div></section>` : ''}
      ${storageNotice ? `<p class="notice gm-warning" role="status">${esc(storageNotice)}</p>` : ''}${message && !aiError ? `<p class="notice" role="status">${esc(message)}</p>` : ''}
      <details class="panel gm-rules"><summary>${t('규칙 · 접근성 · 기기 내 저장', 'Rules · accessibility · local saving')}</summary><p>${t('자유룰 · 15×15 · 흑/백 모두 5개 이상이면 승리 · 금수 없음', 'Freestyle · 15×15 · five or more wins for either color · no forbidden moves')}</p><p>${t('흑이 먼저 두며 빈 교차점에 번갈아 놓습니다. 가로, 세로, 두 대각선의 연속 5개 이상이 승리입니다. 6개 이상도 양쪽 모두 승리하며 삼삼·사사도 허용합니다. 렌주와 다릅니다. 선공 이점이 있으므로 재대결에는 선공을 바꾸어 보세요.', 'Black moves first. Place one stone on an empty intersection each turn. Five or more in a row horizontally, vertically or diagonally wins, including overlines for either color. Double-threes and double-fours are allowed. These rules differ from Renju. Black has a first-move advantage; switch roles for a rematch.')}</p><p>${t('작은 화면에서는 좌표를 고른 뒤 별도 놓기 버튼을 누르세요. 확대 판은 안쪽에서 스크롤할 수 있습니다. 방향키와 Enter/Space로도 둘 수 있으며 Tab으로 판에서 나갑니다. 효과음·진동은 없습니다.', 'On small screens, select a coordinate and use the separate Place button. The enlarged board scrolls inside its frame. Arrow keys and Enter/Space also work; Tab leaves the board. No sound or vibration is required.')}</p><p>${t('AI는 기기에서 제한된 시간과 수읽기로 계산하는 입문용입니다. 힌트는 추천이며 승리를 보장하지 않습니다. 온라인 대전·회원·랭킹·광고는 없습니다.', 'AI runs locally with bounded time and search depth. Hints are suggestions, not guaranteed wins. There is no online multiplayer, account, leaderboard or advertising.')}</p><p>${t('저장은 선택 사항이며 기본 꺼짐입니다. 켜면 현재 1국과 설정만 이 브라우저에 저장합니다. 브라우저 초기화로 사라질 수 있고 계정 복구나 다른 기기 동기화는 없습니다. 이름·이메일을 저장하거나 기보를 서버로 보내지 않습니다.', 'Saving is optional and off by default. When enabled, only the current game and settings are stored in this browser. Browser resets can erase it; there is no account recovery or cross-device sync. No name or email is stored, and no moves are sent to a server.')}</p>${button('delete-save', t('기기에 저장된 게임 삭제', 'Delete the saved game'))}</details></div>`;
    if (boardFocused) root.querySelector('.gm-board')?.focus({ preventScroll: true });
    else if (focusAction) root.querySelector(`[data-action="${focusAction}"]`)?.focus({ preventScroll: true });
    else if (focusName) root.querySelector(`[name="${focusName}"]`)?.focus({ preventScroll: true });
    if (scrollPosition) { const el = root.querySelector('.gm-board-scroll'); if (el) { el.scrollLeft = scrollPosition.x; el.scrollTop = scrollPosition.y; } }
  }
  function onClick(event) {
    const cell = event.target.closest('.gm-cell');
    if (cell && !pending) { selected = { row: Number(cell.dataset.row), col: Number(cell.dataset.col) }; render(); root.querySelector('.gm-board')?.focus({ preventScroll: true }); return; }
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (!action) return;
    if (pending && !['confirm-yes', 'confirm-no'].includes(action)) return;
    switch (action) {
      case 'start': startGame(); break;
      case 'continue': if(session.game.status==='playing'&&!gameMeasurement)gameMeasurement=metrics.begin('game');phase='play'; render(); syncAI(); break;
      case 'resume': case 'takeover': resumeSaved(); break;
      case 'place': place(); break;
      case 'undo': {
        const undo = () => { stopCalculation(); session.undo(); changed(); };
        if (session.game.settings.mode === 'local2p') confirmAction(t('두 사람 모두 마지막 1수를 되돌리는 데 동의하나요?', 'Do both players agree to undo the last move?'), undo);
        else undo();
        break;
      }
      case 'hint': if (busy === 'hint') { stopCalculation(); render(); } else calculate('hint'); break;
      case 'restart': startGame(session.game.settings); break;
      case 'swap': startGame({ ...session.game.settings, humanColor: session.game.settings.humanColor === BLACK ? WHITE : BLACK }); break;
      case 'setup': metrics.cancel(gameMeasurement,'user_cancel');gameMeasurement=null;stopCalculation(); phase = 'setup'; settings = { ...session.game.settings }; render(); break;
      case 'zoom': zoom = !zoom; render(); break;
      case 'retry': aiError = false; message = ''; if (session.game.settings.mode === 'ai' && session.game.turn !== session.game.settings.humanColor) syncAI(); else calculate('hint'); break;
      case 'confirm-yes': { const actionToRun = pending?.action; pending = null; actionToRun?.(); break; }
      case 'confirm-no': pending = null; render(); syncAI(); break;
      case 'separate': metrics.cancel(gameMeasurement,'superseded');gameMeasurement=metrics.begin('game');stopCalculation(); activeSave = false; saveEnabled = false; conflict = false; session.reset(settings); liveGame = true; phase = 'play'; changed(); break;
      case 'delete-save': confirmAction(t('이 브라우저에 저장한 현재 게임을 삭제할까요? 열린 탭의 게임은 계속할 수 있습니다.', 'Delete the current game saved in this browser? You can keep playing in the open tab.'), () => {
        const ok = storage && clearCurrent(storage);
        activeSave = false; saveEnabled = false; saved = null; expectedRaw = null; conflict = false;
        storageNotice = ok ? t('기기 저장을 끄고 저장된 게임을 삭제했습니다.', 'Local saving is off and the saved game was deleted.') : t('저장된 게임을 삭제하지 못했습니다. 브라우저 설정을 확인하세요.', 'Could not delete the saved game. Check your browser settings.');
        render(); syncAI();
      }); break;
    }
  }
  function onChange(event) {
    const target = event.target;
    if (target.name === 'gm-mode') { settings.mode = target.value; render(); }
    if (target.name === 'gm-color') settings.humanColor = Number(target.value);
    if (target.name === 'gm-difficulty') settings.difficulty = target.value;
    if (target.name === 'gm-numbers') { showNumbers = target.checked; persist(); render(); }
    if (target.name === 'gm-save') {
      if (!target.checked) {
        // Turning storage off has identical meaning on setup and play screens.
        activeSave = false; saveEnabled = false;
        const ok = storage && clearCurrent(storage); expectedRaw = null; saved = null;
        storageNotice = ok ? t('기기 저장을 끄고 저장된 게임을 삭제했습니다.', 'Local saving is off and the saved game was deleted.') : t('저장을 껐지만 기존 저장 삭제에 실패했습니다. 브라우저 설정을 확인하세요.', 'Saving is off, but deleting the previous save failed. Check browser settings.');
        render(); return;
      }
      if (!liveGame) { saveEnabled = true; storageNotice = ''; render(); return; }
      let current;
      try { expectedRaw = storage.getItem(CURRENT_KEY); current = expectedRaw ? parseSave(expectedRaw) : null; }
      catch { current = null; }
      const enable = () => { activeSave = true; saveEnabled = true; storageNotice = ''; persist(); render(); syncAI(); };
      if (current && current.game.gameId !== session.game.gameId && current.game.status === 'playing' && current.game.moves.length) {
        saveEnabled = false;
        confirmAction(t('기기에 저장된 다른 진행 중인 게임을 현재 게임으로 바꿀까요?', 'Replace the other unfinished game saved on this device with this game?'), enable);
      } else enable();
    }
  }
  function onKeyDown(event) {
    if (!event.target.classList.contains('gm-board') || pending) return;
    const directions = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    if (directions[event.key]) {
      event.preventDefault(); const [dr, dc] = directions[event.key];
      selected = { row: Math.max(0, Math.min(14, selected.row + dr)), col: Math.max(0, Math.min(14, selected.col + dc)) };
      render(); root.querySelector(`#gm-cell-${selected.row}-${selected.col}`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    } else if (['Enter', ' '].includes(event.key)) { event.preventDefault(); if (!event.repeat) place(); }
  }
  function onStorage(event) {
    if (event.key !== CURRENT_KEY && event.key !== SETTINGS_KEY) return;
    if (activeSave && event.key === CURRENT_KEY && event.newValue !== expectedRaw) {
      conflict = true; stopCalculation(); hint = null; render();
    } else if (!activeSave && phase === 'setup') {
      const current = readCurrent(storage); saved = current.saved;
      if (event.key === CURRENT_KEY) expectedRaw = event.newValue;
      render();
    }
  }
  root.addEventListener('click', onClick); root.addEventListener('change', onChange); root.addEventListener('keydown', onKeyDown); window.addEventListener('storage', onStorage);
  render();
  return () => {
    metrics.dispose();destroyed=true;stopCalculation(); setDirty(false);
    root.removeEventListener('click', onClick); root.removeEventListener('change', onChange); root.removeEventListener('keydown', onKeyDown); window.removeEventListener('storage', onStorage);
    root.replaceChildren();
  };
}
export default mount;
