/** GAME11: pure, immutable 15×15 freestyle rules. No network or storage. */
export const SIZE = 15;
export const RULES_VERSION = 'freestyle-15-v1';
export const BLACK = 1;
export const WHITE = 2;
export const other = color => color === BLACK ? WHITE : BLACK;
export const coordinate = (row, col) => `${String.fromCharCode(65 + col)}${row + 1}`;
export const validCoordinate = (row, col) => Number.isInteger(row) && Number.isInteger(col) && row >= 0 && row < SIZE && col >= 0 && col < SIZE;
export function newId() {
  return globalThis.crypto?.randomUUID?.() ?? `g-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
export function validSettings(value) {
  return value && ['ai', 'local2p'].includes(value.mode) && [BLACK, WHITE].includes(value.humanColor) && ['easy', 'normal'].includes(value.difficulty);
}
export function createGame(settings = { mode: 'ai', humanColor: BLACK, difficulty: 'easy' }, id = newId()) {
  if (!validSettings(settings)) throw new Error('Invalid game settings');
  return { gameId: id, revision: 0, settings: { mode: settings.mode, humanColor: settings.humanColor, difficulty: settings.difficulty }, board: Array(SIZE * SIZE).fill(0), moves: [], turn: BLACK, status: 'playing', winner: null, winningLines: [] };
}
export function winningLines(board, row, col, color) {
  if (!validCoordinate(row, col) || board[row * SIZE + col] !== color) return [];
  const lines = [];
  for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
    const before = [], after = [];
    for (const sign of [-1, 1]) {
      let r = row + sign * dr, c = col + sign * dc;
      while (validCoordinate(r, c) && board[r * SIZE + c] === color) {
        (sign === -1 ? before : after).push({ row: r, col: c });
        r += sign * dr; c += sign * dc;
      }
    }
    const line = [...before.reverse(), { row, col }, ...after];
    if (line.length >= 5) lines.push(line);
  }
  return lines;
}
export function moveError(game, row, col, color = game.turn, expectedRevision = game.revision) {
  if (expectedRevision !== game.revision) return 'stale';
  if (game.status !== 'playing') return 'finished';
  if (color !== game.turn) return 'turn';
  if (!validCoordinate(row, col)) return 'bounds';
  if (game.board[row * SIZE + col] !== 0) return 'occupied';
  return null;
}
export function playMove(game, row, col, color = game.turn, expectedRevision = game.revision) {
  if (moveError(game, row, col, color, expectedRevision)) return game;
  const board = game.board.slice();
  board[row * SIZE + col] = color;
  const moves = [...game.moves, { row, col }];
  const lines = winningLines(board, row, col, color);
  const status = lines.length ? 'won' : moves.length === SIZE * SIZE ? 'draw' : 'playing';
  return { ...game, board, moves, turn: other(color), revision: game.revision + 1, status, winner: lines.length ? color : null, winningLines: lines };
}
export function replayMoves(moves, settings, id = newId()) {
  if (!Array.isArray(moves) || moves.length > SIZE * SIZE) throw new Error('Invalid move list');
  let game = createGame(settings, id);
  for (const move of moves) {
    if (!move || !validCoordinate(move.row, move.col)) throw new Error('Invalid coordinate');
    const next = playMove(game, move.row, move.col);
    if (next === game) throw new Error('Illegal move sequence');
    game = next;
  }
  return game;
}
export function undoCount(game) {
  if (game.settings.mode === 'local2p') return game.moves.length ? 1 : 0;
  // Undo to the decision immediately before the most recent human move.
  for (let i = game.moves.length - 1; i >= 0; i--) {
    if ((i % 2 === 0 ? BLACK : WHITE) === game.settings.humanColor) return game.moves.length - i;
  }
  return 0;
}
export function undoMove(game) {
  const count = undoCount(game);
  if (!count) return game;
  const replay = replayMoves(game.moves.slice(0, -count), game.settings, game.gameId);
  return { ...replay, revision: game.revision + 1 };
}
