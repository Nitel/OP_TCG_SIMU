import type { GameState, CardId, PlayerId, CardEffect, EffectTrigger } from '../types/index.js';
export interface EffectContext {
    /** The card whose effect is being resolved */
    readonly sourceCardId: CardId;
    /** The player who controls the source card */
    readonly sourcePlayerId: PlayerId;
}
/**
 * Filter and resolve all effects matching `trigger` from the given list.
 * Returns the updated GameState after all matching effects are applied in order.
 */
export declare function resolveEffects(effects: readonly CardEffect[], trigger: EffectTrigger, context: EffectContext, state: GameState): GameState;
//# sourceMappingURL=effectResolver.d.ts.map