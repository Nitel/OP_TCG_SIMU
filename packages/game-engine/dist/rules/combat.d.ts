import type { GameState, PlayerId } from '../types/index.js';
export { calculatePower, sendToTrash } from './cardUtils.js';
/**
 * Apply one damage to the defending leader:
 * - If life is already empty → set winner to the attacking player.
 * - Otherwise reveal the top life card (move to defending player's hand).
 * - If the revealed life card has a Trigger effect, resolve it immediately.
 */
export declare function applyLeaderDamage(state: GameState, attackingPlayerId: PlayerId): GameState;
/**
 * Resolve the pending combat in `state.activeCombat`.
 * Returns a new GameState with activeCombat cleared and all outcomes applied.
 * Power modifiers (EndOfBattle) on the attacker are cleared after resolution.
 */
export declare function resolveCombat(state: GameState): GameState;
//# sourceMappingURL=combat.d.ts.map