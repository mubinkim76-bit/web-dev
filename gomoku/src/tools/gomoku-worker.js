import { chooseMove } from '../lib/gomoku-ai.js';
self.onmessage = ({ data }) => {
  const { gameId, revision, requestId, purpose, board, color, difficulty } = data;
  const token = { gameId, revision, requestId, purpose };
  try {
    const result = chooseMove(board, color, difficulty);
    self.postMessage(result ? { ...token, ...result } : { ...token, error: 'No legal move' });
  } catch { self.postMessage({ ...token, error: 'Calculation failed' }); }
};
