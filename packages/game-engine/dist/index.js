export { makeCardId, makePlayerId, makeGameError, makeEmptyState, isGameError, } from './types/index.js';
export { applyAction } from './core/applyAction.js';
// cardUtils — primary source for these functions
export { calculatePower, sendToTrash, drawCards, returnToHand, clearPowerModifiers } from './rules/cardUtils.js';
// combat — re-exports calculatePower and sendToTrash from cardUtils for backwards compat
export { applyLeaderDamage, resolveCombat } from './rules/combat.js';
export { checkVictoryCondition } from './rules/victory.js';
export { greedyBotDecide } from './ai/greedyBot.js';
export { resolveEffects } from './effects/effectResolver.js';
//# sourceMappingURL=index.js.map