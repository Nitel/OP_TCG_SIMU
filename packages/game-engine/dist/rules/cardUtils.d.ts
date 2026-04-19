import type { CardId, GameState, PlayerId } from '../types/index.js';
/**
 * Total power of a card = base power + 1 000 per DON!! attached + powerModifier.
 */
export declare function calculatePower(cardId: CardId, state: GameState): number;
/**
 * Clear `powerModifier` on a set of card IDs (e.g. at end of battle or turn).
 */
export declare function clearPowerModifiers(state: GameState, cardIds: readonly CardId[]): GameState;
/**
 * Move a card to its owner's trash.
 * Any DON attached to it are detached and returned to donArea (untapped).
 * Does NOT trigger OnKO effects — callers must do that separately.
 */
export declare function sendToTrash(state: GameState, cardId: CardId): GameState;
/**
 * Draw up to `count` cards from the given player's deck to hand.
 * If deck runs out, draws what remains (no error — callers handle empty deck separately).
 */
export declare function drawCards(state: GameState, playerId: PlayerId, count: number): GameState;
/**
 * Return a board card to its owner's hand.
 * Detaches any DON attached to it.
 */
export declare function returnToHand(state: GameState, cardId: CardId): GameState;
//# sourceMappingURL=cardUtils.d.ts.map