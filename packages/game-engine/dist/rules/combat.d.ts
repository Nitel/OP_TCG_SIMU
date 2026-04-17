import type { CardId, GameState } from '../types/index.js';
/**
 * Total power of a card = base power + 1 000 per DON!! attached to it.
 */
export declare function calculatePower(cardId: CardId, state: GameState): number;
/**
 * Move a card to its owner's trash.
 * Any DON attached to it are detached and returned to donArea (untapped).
 */
export declare function sendToTrash(state: GameState, cardId: CardId): GameState;
/**
 * Apply one damage to the defending leader:
 * - If life is already empty → set winner to the attacking player.
 * - Otherwise reveal the top life card (move to defending player's hand).
 */
export declare function applyLeaderDamage(state: GameState, attackingPlayerId: import('../types/index.js').PlayerId): GameState;
/**
 * Resolve the pending combat in `state.activeCombat`.
 * Returns a new GameState with activeCombat cleared and all outcomes applied.
 */
export declare function resolveCombat(state: GameState): GameState;
//# sourceMappingURL=combat.d.ts.map