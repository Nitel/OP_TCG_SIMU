// ─── Keywords ─────────────────────────────────────────────────────────────────

export type CardKeyword =
  | 'Rush'          // Can attack the turn it is played (default in OPTCG, kept for DSL completeness)
  | 'Blocker'       // Can intercept attacks targeting other cards (tap to redirect)
  | 'Banish'        // KO'd cards are removed from game instead of going to trash
  | 'DoubleAttack'  // Unblocked attacks on the leader deal 2 damage instead of 1
  | 'Unblockable';  // Cannot be blocked

// ─── Target selectors ─────────────────────────────────────────────────────────

export type TargetSelector =
  | { readonly scope: 'Self' }
  | { readonly scope: 'Attacker' }
  | { readonly scope: 'OriginalTarget' }                         // target declared in DeclareAttack
  | { readonly scope: 'AllOpponentCharacters' }
  | { readonly scope: 'AllOwnCharacters' }
  | { readonly scope: 'OpponentLeader' }
  | { readonly scope: 'OwnLeader' }
  | { readonly scope: 'ChooseOpponentCharacter'; readonly maxCost?: number; readonly maxPower?: number }
  | { readonly scope: 'ChooseOwnCharacter'; readonly maxCost?: number; readonly maxPower?: number };

// ─── Duration ─────────────────────────────────────────────────────────────────

export type EffectDuration = 'EndOfTurn' | 'EndOfBattle' | 'Permanent';

// ─── Deck filter ──────────────────────────────────────────────────────────────

export type DeckFilter =
  | { readonly kind: 'Any' }
  | { readonly kind: 'ByType'; readonly cardType: 'Character' | 'Event' | 'Stage' }
  | { readonly kind: 'ByCost'; readonly maxCost: number }
  | { readonly kind: 'ByName'; readonly name: string };

// ─── Effect actions ───────────────────────────────────────────────────────────

export type EffectAction =
  /** Draw count cards */
  | { readonly type: 'Draw'; readonly count: number }
  /** KO the selected target (move to trash) */
  | { readonly type: 'KO'; readonly target: TargetSelector }
  /** Return target card to its owner's hand */
  | { readonly type: 'ReturnToHand'; readonly target: TargetSelector }
  /** Give +amount power to target for the given duration */
  | { readonly type: 'PowerBoost'; readonly amount: number; readonly target: TargetSelector; readonly duration: EffectDuration }
  /** Force a player to discard count cards at random */
  | { readonly type: 'TrashCard'; readonly count: number; readonly from: 'OpponentHand' | 'OwnHand' }
  /** Add count life cards from top of deck to life zone */
  | { readonly type: 'AddLife'; readonly count: number }
  /** Give count DON!! cards to the opponent (from their donDeck) */
  | { readonly type: 'GiveDon'; readonly count: number }
  /** Search the deck for a card matching filter and put it in destination */
  | { readonly type: 'SearchDeck'; readonly filter: DeckFilter; readonly destination: 'hand' | 'board' };

// ─── Trigger ──────────────────────────────────────────────────────────────────

export type EffectTrigger =
  | 'OnPlay'      // When this card is played from hand to the board
  | 'OnAttack'    // When this card declares an attack
  | 'OnKO'        // When this card is KO'd (sent to trash or removed)
  | 'OnBlock'     // When this card becomes a blocker
  | 'Trigger'     // When this card is revealed from the Life zone
  | 'Activated';  // Activated ability (future: costs DON during Main phase)

// ─── Optional condition ───────────────────────────────────────────────────────

export type EffectCondition =
  | { readonly type: 'Always' }
  | { readonly type: 'TurnCount'; readonly min?: number; readonly max?: number }
  | { readonly type: 'HasRestingDon'; readonly count: number };

// ─── CardEffect ───────────────────────────────────────────────────────────────

export interface CardEffect {
  readonly trigger: EffectTrigger;
  readonly condition?: EffectCondition;
  readonly actions: readonly EffectAction[];
}

// ─── Card definition (DSL) ────────────────────────────────────────────────────

export interface CardDefinition {
  readonly id: string;
  readonly name: string;
  readonly cost: number;
  readonly power: number;
  readonly color: string;
  readonly cardType: 'Leader' | 'Character' | 'Event' | 'Stage';
  readonly keywords: readonly CardKeyword[];
  readonly effects: readonly CardEffect[];
  readonly counter?: number;
}
