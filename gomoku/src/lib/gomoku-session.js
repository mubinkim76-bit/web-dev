import { createGame, other, playMove, undoMove, newId, validCoordinate } from './gomoku-engine.js';
/** Single synchronous owner of rules state; every asynchronous reply is version checked. */
export class GomokuSession {
  constructor(settings) { this.game = createGame(settings); this.request = null; this.sequence = 0; }
  cancel() { this.request = null; this.sequence++; }
  reset(settings = this.game.settings) { this.cancel(); this.game = createGame(settings); return this.game; }
  restore(game) { this.cancel(); this.game = game; return game; }
  play(row, col, expectedRevision = this.game.revision) {
    if (this.game.settings.mode === 'ai' && this.game.turn !== this.game.settings.humanColor) return false;
    const next = playMove(this.game, row, col, this.game.turn, expectedRevision);
    if (next === this.game) return false;
    this.cancel(); this.game = next; return true;
  }
  undo() {
    const next = undoMove(this.game);
    if (next === this.game) return false;
    this.cancel(); this.game = next; return true;
  }
  begin(purpose) {
    const game = this.game;
    if (game.status !== 'playing' || !['ai', 'hint'].includes(purpose)) return null;
    if (purpose === 'ai' && (game.settings.mode !== 'ai' || game.turn !== other(game.settings.humanColor))) return null;
    if (purpose === 'hint' && game.settings.mode === 'ai' && game.turn !== game.settings.humanColor) return null;
    const token = { gameId: game.gameId, revision: game.revision, requestId: `${++this.sequence}-${newId()}`, purpose };
    this.request = token;
    return { ...token, board: game.board.slice(), color: game.turn, difficulty: game.settings.difficulty };
  }
  accepts(response) {
    const request = this.request;
    return request && response && ['gameId', 'revision', 'requestId', 'purpose'].every(key => request[key] === response[key]) && this.game.gameId === response.gameId && this.game.revision === response.revision && this.game.status === 'playing';
  }
  receive(response) {
    if (!this.accepts(response)) return { ok: false, stale: true };
    const purpose = this.request.purpose;
    this.request = null;
    const move = response.move;
    if (response.error || !move || !validCoordinate(move.row, move.col) || this.game.board[move.row * 15 + move.col]) return { ok: false, error: true };
    if (purpose === 'hint') return { ok: true, hint: move, reason: response.reason };
    if (this.game.settings.mode !== 'ai' || this.game.turn !== other(this.game.settings.humanColor)) return { ok: false, stale: true };
    const next = playMove(this.game, move.row, move.col, this.game.turn, response.revision);
    if (next === this.game) return { ok: false, error: true };
    this.game = next;
    return { ok: true, moved: true };
  }
}
