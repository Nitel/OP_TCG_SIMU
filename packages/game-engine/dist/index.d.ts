export type { CardId, PlayerId, Zone, CardColor, CardType, GamePhase, Card, CombatState, PlayerState, PlayerSetup, GameState, GameAction, DrawCardAction, StartGameAction, DrawPhaseAction, PlayCharacterFromHandAction, AssignDonAction, EndPhaseAction, MulliganAction, DeclareAttackAction, DeclareBlockAction, ResolveCombatAction, PlayCounterAction, GameError, ActionResult, } from './types/index.js';
export { makeCardId, makePlayerId, makeGameError, makeEmptyState, isGameError, } from './types/index.js';
export { applyAction } from './core/applyAction.js';
export { calculatePower, sendToTrash, applyLeaderDamage, resolveCombat } from './rules/combat.js';
export { checkVictoryCondition } from './rules/victory.js';
//# sourceMappingURL=index.d.ts.map