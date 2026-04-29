export type { CardId, PlayerId, Zone, CardColor, CardType, GamePhase, Card, CombatState, PlayerState, PlayerSetup, GameState, GameAction, DrawCardAction, StartGameAction, DrawPhaseAction, PlayCharacterFromHandAction, AssignDonAction, EndPhaseAction, MulliganAction, DeclareAttackAction, DeclareBlockAction, ResolveCombatAction, PlayCounterAction, PlayEventAction, ActivatedAbilityAction, GameError, ActionResult, CardKeyword, CardEffect, EffectTrigger, EffectAction, TargetSelector, EffectDuration, EffectCondition, DeckFilter, } from './types/index.js';
export { makeCardId, makePlayerId, makeGameError, makeEmptyState, isGameError, } from './types/index.js';
export { applyAction } from './core/applyAction.js';
export { calculatePower, sendToTrash, drawCards, returnToHand, clearPowerModifiers } from './rules/cardUtils.js';
export { applyLeaderDamage, resolveCombat } from './rules/combat.js';
export { checkVictoryCondition } from './rules/victory.js';
export { greedyBotDecide } from './ai/greedyBot.js';
export { resolveEffects } from './effects/effectResolver.js';
export type { EffectContext } from './effects/effectResolver.js';
//# sourceMappingURL=index.d.ts.map