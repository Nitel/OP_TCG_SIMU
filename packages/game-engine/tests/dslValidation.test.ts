/**
 * DSL Schema Validation — all 304 effect files in packages/data/effects/*.json
 *
 * Catches: typos in type names, invalid keywords/scopes/durations, unknown action/condition types.
 * Does NOT catch semantic bugs (wrong condition type that is syntactically valid).
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EFFECTS_DIR = path.join(__dirname, '../../data/effects');

const VALID_TRIGGERS = new Set([
  'Activated', 'OnPlay', 'OnAttack', 'OnAttacked', 'OnBlock', 'OnKO', 'OnLeaveField', 'Counter', 'Trigger',
  'StartOfTurn', 'StartOfOpponentTurn', 'StartOfMainPhase', 'EndOfTurn', 'OnOpponentBlock',
  'OnOpponentPlaysEvent', 'YourTurn',
  // Static / passive abilities
  'Permanent',
  // DON-return trigger
  'OnReturnDonToDeck',
  // Damage and trash triggers
  'OnDamage', 'OnTrash',
  // KO substitution trigger
  'OnWouldBeKOByEffect',
  // Rest substitution trigger
  'OnWouldBeRestedByEffect',
  // Rested trigger
  'OnRested',
  // End-of-battle trigger
  'EndOfBattle',
]);
const VALID_CONDITIONS = new Set([
  'Always', 'TurnCount', 'HasRestingDon', 'HasAttachedDon', 'LeaderHasAttachedDon', 'TrashCount', 'HasCardOnBoard',
  'AnyPlayerHasNoLife', 'LeaderHasType', 'LeaderHasAnyType', 'LeaderIsName',
  // Phase OP01 additions
  'HasTotalAttachedDon', 'HasBoardCount', 'HasHandCount',
  // Phase ST21 additions
  'HasCharacterWithMinPower',
  // Phase ST22 additions
  'RevealedCardHasType',
  // Group 2: logical composition
  'OR', 'And',
  // Power threshold check
  'HasPowerThreshold',
  // Group 3: cost reduction conditions
  'DonDifference', 'LeaderPowerAtMost',
  // Life / hand count comparisons
  'LifeCount', 'OpponentLifeCount', 'HasLife', 'HasLifeCards', 'FlipCount',
  'HandCount', 'OpponentHandCount',
  // Power / type checks
  'HasPower', 'HasType', 'HasAnyType',
  // Comparative life checks
  'PlayerLifeLessThanOpponent', 'HasFewerLifeThanOpponent',
  // Once-per-turn restriction
  'OncePerTurn',
  // Power/life comparison conditions
  'CardPower', 'OpponentLife', 'KOByOpponentEffect', 'HasLifeOrLess',
  'LeaderHasLife', 'LifeComparison', 'PlayedThisTurn',
  // Rested card counts
  'HasRestedCharacters', 'HasRestedCards',
  // DON count conditions
  'TotalDonCount', 'AllDonRested', 'DonCountVsOpponent',
  // New conditions
  'OnlyTypeOnBoard', 'Not', 'FaceUpLifeCard', 'MulticoloredLeader', 'OpponentDonCount',
  // Dynamic DON conditions
  'CostEqualsAttachedDon',
]);
const VALID_ACTIONS = new Set([
  'DrawCard', 'KO', 'ReturnToHand', 'PowerBoost', 'ForceDiscard', 'AddLife',
  'GiveDon', 'FlipLife', 'AttachDon', 'GiveKeyword', 'Rest',
  'RemoveLife', 'PlaySelf', 'SearchDeck', 'PlayFromHand', 'RevealFromHand',
  'TrashFromHand', 'Win',
  // Phase 2 types
  'TrashFromDeck', 'PlayFromTrash', 'RevealFromDeck', 'PlaceAtBottomOfDeck',
  'SearchTrash', 'Activate',
  // Phase OP01 additions
  'DynamicPowerBoost', 'ReduceEventCost', 'TakeFromLife',
  // Phase ST21 additions
  'ForceAttack', 'DisableBlocker', 'SuppressBlockerForAttacker',
  // Deck manipulation (not yet fully implemented — engine returns state unchanged)
  'ShuffleDeck', 'ScryDeck', 'ArrangeDeck', 'ArrangeFromDeck', 'ReorderLifeCards',
  'PlaceCardOnTopOfDeck', 'OrderDeckBottom', 'ReturnToTopOrBottomOfDeck',
  // Trash / protection actions
  'TrashFromLife', 'TrashFromPlay', 'TrashSelf', 'PreventKO', 'BlockPlay',
  // DON management
  'ActivateDon', 'AddDon',
  // Conditional branching
  'ConditionalAction',
  // Additional deck/trash manipulation
  'PreventBlocker', 'PlaceDecksBottom', 'ReorderDeck', 'AddRestriction', 'ModifyCost',
  'ProportionalPowerBoost',
  'GiveTemporaryCostModifier',
  'SetAllDonActive',
  // New: choice, base power, refresh prevention
  'ChooseOne', 'SetBasePower', 'PreventRefresh',
  // New: opponent trash recovery, hand-to-deck, trash recovery
  'RecoverOpponentTrash', 'HandToDeck', 'RecoverTrashToDeck',
  // Life card manipulation
  'LookAtLife', 'RearrangeLife', 'TakeLifeToHand', 'MoveLifeCard',
  // DON cost actions and steal
  'RestDon', 'ReturnDonToDeck', 'StealCard',
  // Negate effects
  'NegateEffect',
  // New actions
  'SetCostToZero', 'SwapBasePower', 'SetBasePowerToLeader',
  'PlaceAllCharactersAtBottom', 'AddToLife', 'PlaceOwnCharacterAtBottom',
  'SetActive', 'CannotAddLifeToHand',
  // Extra turn and cost reduction
  'ExtraTurn', 'SetNextPlayCostReduction',
]);
const VALID_KEYWORDS = new Set([
  'Rush', 'Blocker', 'DoubleAttack', 'Banish', 'Unblockable', 'Trigger',
  // Engine-enforced keywords
  'CannotAttack', 'CannotBeKOdByEffect', 'CannotBeKOdInBattle', 'CannotBeRested',
  // Extended keywords (legacy / partial — stored on card)
  'CannotBeKOd',
  'CantBeKOdByOpponentEffects', 'CannotBeKOdByEffects', 'CannotBeKOdByOpponentEffects',
  'CanAttackActive', 'CannotBeRemoved', 'CannotBeRemovedByOpponentEffects', 'Unremovable',
  'DirectAttack', 'DoesNotBecomeActiveInRefreshPhase', 'Protection', 'Restricted',
  'Active', 'CannotAddLifeThisTurn', 'CannotBeActive', 'CanAttackSameTurn',
  "Cannot be K.O.'d in battle by <Slash> attribute cards",
]);
const VALID_SCOPES = new Set([
  'Self', 'Attacker', 'OriginalTarget',
  'AllOwnCharacters', 'AllOwnCharactersAndLeader',
  'AllOpponentCharacters',
  'OpponentLeader', 'OwnLeader',
  'ChooseOwnCharacter', 'ChooseOpponentCharacter', 'ChooseOwnCharacterOrLeader', 'ChooseOpponentCharacterOrLeader',
  // DON!! targeting
  'ChooseOpponentDon', 'ChooseOpponentCharacterOrDon', 'ChooseOwnCharacterOrDon',
]);
const VALID_DURATIONS = new Set(['EndOfTurn', 'DuringYourTurn', 'EndOfBattle', 'EndOfOpponentTurn', 'Permanent', 'UntilOpponentRefresh', 'UntilOpponentRefreshPhase']);
const VALID_FILTER_KINDS = new Set(['Any', 'ByType', 'ByCost', 'ByName', 'ByNames', 'BySubType', 'ByTypeOrName', 'ByCardType', 'ByDonCount']);
const VALID_CARD_TYPES = new Set(['Character', 'Event', 'Stage']);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function validateActions(actions: any[], lbl: string): void {
  for (const [ai, action] of actions.entries()) {
    const albl = `${lbl} actions[${ai}]`;
    expect(VALID_ACTIONS, `${albl}.type "${action.type}"`).toContain(action.type);
    if (action.keyword != null) {
      expect(VALID_KEYWORDS, `${albl}.keyword "${action.keyword}"`).toContain(action.keyword);
    }
    if (action.duration != null) {
      expect(VALID_DURATIONS, `${albl}.duration "${action.duration}"`).toContain(action.duration);
    }
    if (action.target?.scope != null) {
      expect(VALID_SCOPES, `${albl}.target.scope "${action.target.scope}"`).toContain(action.target.scope);
    }
    if (action.filter?.kind != null) {
      expect(VALID_FILTER_KINDS, `${albl}.filter.kind "${action.filter.kind}"`).toContain(action.filter.kind);
    }
    if (action.filter?.cardType != null) {
      expect(VALID_CARD_TYPES, `${albl}.filter.cardType "${action.filter.cardType}"`).toContain(action.filter.cardType);
    }
    if (Array.isArray(action.thenActions)) {
      validateActions(action.thenActions, `${albl}.thenActions`);
    }
  }
}

describe('DSL Schema Validation', () => {
  const files = fs.readdirSync(EFFECTS_DIR).filter((f) => f.endsWith('.json')).sort();

  it('at least 300 effect files found', () => {
    expect(files.length).toBeGreaterThanOrEqual(300);
  });

  for (const file of files) {
    it(file, () => {
      const raw = fs.readFileSync(path.join(EFFECTS_DIR, file), 'utf-8');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const def = JSON.parse(raw) as any;

      for (const [ei, effect] of (def.effects ?? []).entries()) {
        const lbl = `${file} effects[${ei}]`;

        expect(VALID_TRIGGERS, `${lbl}.trigger "${effect.trigger}"`).toContain(effect.trigger);

        if (effect.condition != null) {
          expect(VALID_CONDITIONS, `${lbl}.condition.type "${effect.condition.type}"`).toContain(
            effect.condition.type,
          );
        }

        validateActions(effect.actions ?? [], lbl);
      }
    });
  }
});
