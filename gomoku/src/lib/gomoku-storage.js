import { RULES_VERSION, replayMoves, validSettings } from './gomoku-engine.js';
export const CURRENT_KEY = 'game11.current.v1';
export const SETTINGS_KEY = 'game11.settings.v1';
export const MAX_SAVE_BYTES = 64 * 1024;
const identifier = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value);
export function parseSave(raw) {
  if (typeof raw !== 'string' || new TextEncoder().encode(raw).length > MAX_SAVE_BYTES) throw new Error('Save too large');
  const value = JSON.parse(raw);
  if (!value || value.schemaVersion !== 1 || value.rulesVersion !== RULES_VERSION) throw new Error('Unsupported save version');
  if (!identifier(value.gameId) || !identifier(value.ownerId) || !identifier(value.saveId)) throw new Error('Invalid save identity');
  if (!Number.isSafeInteger(value.revision) || value.revision < 0 || value.revision > 1_000_000_000) throw new Error('Invalid revision');
  if (!validSettings(value) || typeof value.savedAt !== 'string' || !Number.isFinite(Date.parse(value.savedAt))) throw new Error('Invalid settings');
  if (!value.uiSettings || typeof value.uiSettings.showNumbers !== 'boolean') throw new Error('Invalid UI settings');
  const game = replayMoves(value.moves, value, value.gameId);
  if (value.revision < game.moves.length) throw new Error('Invalid revision sequence');
  game.revision = value.revision;
  return { game, ownerId: value.ownerId, saveId: value.saveId, savedAt: value.savedAt, uiSettings: { showNumbers: value.uiSettings.showNumbers } };
}
export function serializeSave(game, ownerId, saveId, showNumbers = false) {
  const value = { schemaVersion: 1, rulesVersion: RULES_VERSION, gameId: game.gameId, revision: game.revision, ...game.settings, moves: game.moves.map(({ row, col }) => ({ row, col })), savedAt: new Date().toISOString(), ownerId, saveId, uiSettings: { showNumbers } };
  const raw = JSON.stringify(value);
  parseSave(raw); // Use precisely the same validation path before and after persistence.
  return raw;
}
export function readCurrent(storage) {
  try {
    const raw = storage.getItem(CURRENT_KEY);
    if (!raw) return { raw: null, saved: null, enabled: false };
    const saved = parseSave(raw);
    let enabled = false;
    try { enabled = JSON.parse(storage.getItem(SETTINGS_KEY) || 'null')?.enabled === true; } catch { /* Never infer consent from an invalid preference. */ }
    return { raw, saved, enabled };
  } catch { return { raw: null, saved: null, enabled: false, error: true }; }
}
/** Compare-and-write detects another tab's latest write before replacing it. */
export function writeCurrent(storage, raw, expectedRaw) {
  try {
    parseSave(raw);
    if (storage.getItem(CURRENT_KEY) !== expectedRaw) return { ok: false, conflict: true };
    storage.setItem(SETTINGS_KEY, JSON.stringify({ schemaVersion: 1, enabled: true }));
    storage.setItem(CURRENT_KEY, raw);
    return { ok: true, raw };
  } catch { return { ok: false, unavailable: true }; }
}
export function clearCurrent(storage) {
  try { storage.removeItem(CURRENT_KEY); storage.removeItem(SETTINGS_KEY); return true; }
  catch { return false; }
}
