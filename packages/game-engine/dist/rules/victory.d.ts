import type { GameState, PlayerId } from '../types/index.js';
/**
 * Return the winning PlayerId if a victory condition is met, otherwise null.
 *
 * Victory conditions:
 * 1. `state.winner` already set (e.g. leader took damage with empty life).
 * 2. A player's deck is empty when they are required to draw (detected at draw time).
 *
 * Condition 2 is enforced directly in `applyDrawPhase`; this function covers
 * condition 1 and serves as the single query point for callers.
 */
export declare function checkVictoryCondition(state: GameState): PlayerId | null;
//# sourceMappingURL=victory.d.ts.map