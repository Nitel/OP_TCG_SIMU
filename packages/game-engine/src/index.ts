export type {
  CardId,
  PlayerId,
  Zone,
  CardColor,
  CardType,
  GamePhase,
  Card,
  CombatState,
  PlayerState,
  PlayerSetup,
  GameState,
  GameAction,
  DrawCardAction,
  StartGameAction,
  DrawPhaseAction,
  PlayCharacterFromHandAction,
  AssignDonAction,
  EndPhaseAction,
  MulliganAction,
  DeclareAttackAction,
  DeclareBlockAction,
  ResolveCombatAction,
  PlayCounterAction,
  PlayEventAction,
  ActivatedAbilityAction,
  GameError,
  ActionResult,
  // DSL types
  CardKeyword,
  CardEffect,
  EffectTrigger,
  EffectAction,
  TargetSelector,
  EffectDuration,
  EffectCondition,
  DeckFilter,
} from './types/index.js';

export {
  makeCardId,
  makePlayerId,
  makeGameError,
  makeEmptyState,
  isGameError,
} from './types/index.js';

export { applyAction } from './core/applyAction.js';

// cardUtils — primary source for these functions
export { calculatePower, sendToTrash, drawCards, returnToHand, clearPowerModifiers } from './rules/cardUtils.js';

// combat — re-exports calculatePower and sendToTrash from cardUtils for backwards compat
export { applyLeaderDamage, resolveCombat } from './rules/combat.js';

export { checkVictoryCondition } from './rules/victory.js';

export { resolveEffects } from './effects/effectResolver.js';
export type { EffectContext } from './effects/effectResolver.js';
