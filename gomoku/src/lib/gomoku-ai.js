import { SIZE, other, validCoordinate, winningLines } from './gomoku-engine.js';
const AXES = [[0, 1], [1, 0], [1, 1], [1, -1]];
const VALUE = [0, 2, 14, 160, 8000, 1000000];
const EXHAUSTED = Symbol('budget');
const now = () => globalThis.performance?.now?.() ?? Date.now();
function candidates(board) {
  const occupied = board.some(Boolean);
  if (!occupied) return [112];
  const found = new Set();
  for (let i = 0; i < board.length; i++) if (board[i]) {
    const row = Math.floor(i / SIZE), col = i % SIZE;
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
      const r = row + dr, c = col + dc;
      if (validCoordinate(r, c) && !board[r * SIZE + c]) found.add(r * SIZE + c);
    }
  }
  return [...found].sort((a, b) => a - b);
}
function pattern(board, index, color) {
  const row = Math.floor(index / SIZE), col = index % SIZE;
  let score = 0;
  for (const [dr, dc] of AXES) {
    let length = 1, open = 0;
    for (const sign of [-1, 1]) {
      let r = row + sign * dr, c = col + sign * dc;
      while (validCoordinate(r, c) && board[r * SIZE + c] === color) { length++; r += sign * dr; c += sign * dc; }
      if (validCoordinate(r, c) && !board[r * SIZE + c]) open++;
    }
    if (length >= 5) score += VALUE[5];
    else if (open) score += VALUE[length] * (open === 2 ? 4 : 1);
  }
  return score;
}
/** Deterministic tactical search, bounded by nodes and deadline. Intended for a Worker. */
export function chooseMove(inputBoard, color, difficulty = 'easy', options = {}) {
  if (!Array.isArray(inputBoard) || inputBoard.length !== 225 || inputBoard.some(x => ![0, 1, 2].includes(x)) || ![1, 2].includes(color)) throw new Error('Invalid AI input');
  const board = inputBoard.slice();
  const available = candidates(board);
  if (!available.length) return null;
  const started = now(), deadline = started + Math.min(800, Math.max(1, options.maxMs ?? 800));
  const maxNodes = Math.min(difficulty === 'normal' ? 30000 : 5000, options.maxNodes ?? Infinity);
  let nodes = 0;
  function tick() { if (++nodes > maxNodes || now() >= deadline) throw EXHAUSTED; }
  function rank(side, limit = Infinity) {
    const list = [];
    for (const index of candidates(board)) {
      tick();
      const attack = pattern(board, index, side), defense = pattern(board, index, other(side));
      const center = 14 - Math.abs(Math.floor(index / SIZE) - 7) - Math.abs(index % SIZE - 7);
      list.push({ index, attack, defense, score: attack * 1.05 + defense + center });
    }
    return list.sort((a, b) => b.score - a.score || a.index - b.index).slice(0, limit);
  }
  // Keep a legal completed baseline even when a normal deadline is reached very early.
  let best = { index: available[0], score: 0 }, reason = 'pattern', completedDepth = 0;
  function negamax(side, depth, alpha, beta) {
    tick();
    const ranked = rank(side, depth > 1 ? 8 : 6);
    if (!ranked.length) return 0;
    if (depth === 0) return ranked[0].attack - ranked[0].defense;
    let result = -Infinity;
    for (const item of ranked) {
      board[item.index] = side;
      let score;
      try {
        score = winningLines(board, Math.floor(item.index / SIZE), item.index % SIZE, side).length ? 10000000 + depth : -negamax(other(side), depth - 1, -beta, -alpha);
      } finally { board[item.index] = 0; }
      result = Math.max(result, score); alpha = Math.max(alpha, score);
      if (alpha >= beta) break;
    }
    return result;
  }
  try {
    const ranked = rank(color);
    const win = ranked.find(item => item.attack >= VALUE[5]);
    const block = ranked.find(item => item.defense >= VALUE[5]);
    if (win) { best = win; reason = 'win'; }
    else if (block) { best = block; reason = 'block'; }
    else {
      best = ranked[0]; completedDepth = 1;
      if (difficulty === 'normal') {
        for (const depth of [2, 3]) {
          let iteration = null;
          for (const item of ranked.slice(0, 10)) {
            tick(); board[item.index] = color;
            let score;
            try { score = -negamax(other(color), depth - 1, -Infinity, Infinity); }
            finally { board[item.index] = 0; }
            // Stable ordering retains the tactical preference on equal search scores.
            if (!iteration || score > iteration.score) iteration = { index: item.index, score };
          }
          if (iteration) { best = iteration; completedDepth = depth; }
        }
      }
    }
  } catch (error) { if (error !== EXHAUSTED) throw error; }
  return { move: { row: Math.floor(best.index / SIZE), col: best.index % SIZE }, reason, nodes: Math.min(nodes, maxNodes), completedDepth, elapsedMs: now() - started };
}
