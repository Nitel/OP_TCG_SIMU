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
  | { readonly scope: 'AllOwnCharactersAndLeader' }
  | { readonly scope: 'OpponentLeader' }
  | { readonly scope: 'OwnLeader' }
  | { readonly scope: 'ChooseOpponentCharacter'; readonly maxCost?: number; readonly maxPower?: number }
  | { readonly scope: 'ChooseOwnCharacter'; readonly maxCost?: number; readonly maxPower?: number }
  | { readonly scope: 'ChooseOwnCharacterOrLeader'; readonly maxCost?: number; readonly maxPower?: number }
  | { readonly scope: 'ChooseOpponentCharacterOrLeader'; readonly maxCost?: number; readonly maxPower?: number };

// ─── Duration ─────────────────────────────────────────────────────────────────

export type EffectDuration = 'EndOfTurn' | 'EndOfBattle' | 'Permanent';

// ─── Deck filter ──────────────────────────────────────────────────────────────

export type DeckFilter =
  | { readonly kind: 'Any' }
  | { readonly kind: 'ByType'; readonly cardType: 'Character' | 'Event' | 'Stage' }
  | { readonly kind: 'ByCost'; readonly maxCost: number }
  | { readonly kind: 'ByName'; readonly name: string };

// ─── Hand filter (used by PlayFromHand / RevealFromHand) ──────────────────────

export interface HandFilter {
  readonly color?: string;
  readonly cardType?: 'Character' | 'Event' | 'Stage';
  /** OR filter: matches cards whose type is any of these values */
  readonly cardTypes?: readonly ('Character' | 'Event' | 'Stage')[];
  readonly maxPower?: number;
  readonly excludeSelf?: boolean;
  /** Affiliation substring match, e.g. "Whitebeard Pirates" */
  readonly subType?: string;
}

// ─── Effect actions ───────────────────────────────────────────────────────────

export type EffectAction =
  /** Draw count cards */
  | { readonly type: 'Draw'; readonly count: number }
  /** KO the selected target (move to trash) */
  | { readonly type: 'KO'; readonly target: TargetSelector }
  /** Return target card to its owner's hand */
  | { readonly type: 'ReturnToHand'; readonly target: TargetSelector }
  /** Give +amount power to target for the given duration. If perTrashedCard is true, amount is multiplied by the number of cards trashed in the preceding TrashFromHand action. */
  | { readonly type: 'PowerBoost'; readonly amount: number; readonly perTrashedCard?: true; readonly target: TargetSelector; readonly duration: EffectDuration }
  /** Force a player to discard count cards at random */
  | { readonly type: 'TrashCard'; readonly count: number; readonly from: 'OpponentHand' | 'OwnHand' }
  /** Add count life cards from top of deck to life zone */
  | { readonly type: 'AddLife'; readonly count: number }
  /** Remove count life cards from a player's life zone (trash them) */
  | { readonly type: 'RemoveLife'; readonly count: number }
  /** Give count DON!! cards to the opponent (from their donDeck) */
  | { readonly type: 'GiveDon'; readonly count: number }
  /** Search the deck for a card matching filter and put it in destination */
  | { readonly type: 'SearchDeck'; readonly filter: DeckFilter; readonly destination: 'hand' | 'board' }
  /** Rest (tap) a target character — it cannot attack next turn */
  | { readonly type: 'Rest'; readonly target: TargetSelector }
  /** Play this card onto the board for free (used in Trigger effects) */
  | { readonly type: 'PlaySelf' }
  /** Take count life cards from own life zone and put them into hand (life zone shrinks, hand grows) */
  | { readonly type: 'TakeLifeToHand'; readonly count: number }
  /** Attach count DON!! cards to target character, boosting its power (+1000 per DON) */
  | { readonly type: 'AttachDon'; readonly count: number; readonly target: TargetSelector }
  /** Target character gains the given keyword for the specified duration */
  | { readonly type: 'GainKeyword'; readonly keyword: CardKeyword; readonly target: TargetSelector; readonly duration: EffectDuration }
  /** Play a card from hand for free matching filter (OnKO "you may play" effects) */
  | { readonly type: 'PlayFromHand'; readonly filter: HandFilter }
  /** Reveal N cards from hand matching filter; if successful, apply thenActions */
  | { readonly type: 'RevealFromHand'; readonly count: number; readonly filter: HandFilter; readonly thenActions: readonly EffectAction[] }
  /**
   * Player chooses any number of cards matching filter from their hand and trashes them.
   * thenActions are executed after, with PowerBoost(perTrashedCard) scaled by the trashed count.
   */
  | { readonly type: 'TrashFromHand'; readonly filter: HandFilter; readonly thenActions: readonly EffectAction[] };

// ─── Trigger ──────────────────────────────────────────────────────────────────

export type EffectTrigger =
  | 'OnPlay'      // When this card is played from hand to the board
  | 'OnAttack'    // When this card declares an attack
  | 'OnAttacked'  // When this card is the declared target of an attack
  | 'OnKO'        // When this card is KO'd (sent to trash or removed)
  | 'OnBlock'     // When this card becomes a blocker
  | 'Counter'     // When this card is played during the opponent's attack window
  | 'Trigger'     // When this card is revealed from the Life zone
  | 'Activated'   // Activated ability (costs DON during Main phase)
  | 'EndOfTurn'
  | 'StartOfTurn';

// ─── Optional condition ───────────────────────────────────────────────────────

export type EffectCondition =
  | { readonly type: 'Always' }
  | { readonly type: 'TurnCount'; readonly min?: number; readonly max?: number }
  | { readonly type: 'HasRestingDon'; readonly count: number }
  | { readonly type: 'HasCardOnBoard'; readonly name: string };

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
