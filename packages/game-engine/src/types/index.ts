// ─── Branded types ────────────────────────────────────────────────────────────

declare const __cardId: unique symbol;
export type CardId = string & { readonly [__cardId]: true };

declare const __playerId: unique symbol;
export type PlayerId = string & { readonly [__playerId]: true };

export function makeCardId(id: string): CardId {
  return id as CardId;
}

export function makePlayerId(id: string): PlayerId {
  return id as PlayerId;
}

// ─── Enumerations ─────────────────────────────────────────────────────────────

export type Zone =
  | 'deck'
  | 'hand'
  | 'board'
  | 'leader'
  | 'life'
  | 'donDeck'
  | 'donArea'
  | 'trash'
  | 'removed';

export type CardColor = 'Red' | 'Blue' | 'Green' | 'Purple' | 'Black' | 'Yellow';

export type CardType = 'Leader' | 'Character' | 'Event' | 'Stage' | 'DON';

export type GamePhase = 'Mulligan' | 'Refresh' | 'Draw' | 'DON' | 'Main' | 'End';

// ─── DSL — Keywords ───────────────────────────────────────────────────────────

export type CardKeyword =
  | 'Rush'                  // Can attack the turn it is played
  | 'Blocker'               // Can intercept attacks targeting other cards (tap to redirect)
  | 'Banish'                // KO'd cards are removed from game instead of trash
  | 'DoubleAttack'          // Unblocked attacks on the leader deal 2 damage instead of 1
  | 'Unblockable'           // Cannot be blocked
  | 'CannotBeKOdInBattle'   // Survives combat KO regardless of power comparison
  | 'CannotAttack'          // This card cannot declare attacks
  | 'CannotBeKOdByEffect'   // Cannot be KO'd by opponent's card effects (battle KO still applies)
  | 'CannotBeRested';       // Cannot be rested by opponent's card effects

// ─── DSL — Target selectors ───────────────────────────────────────────────────

export type TargetSelector =
  | { readonly scope: 'Self' }
  | { readonly scope: 'Attacker' }
  | { readonly scope: 'OriginalTarget'; readonly maxCost?: number }
  | { readonly scope: 'AllOpponentCharacters'; readonly maxPower?: number; readonly subType?: string; readonly name?: string }
  | { readonly scope: 'AllOwnCharacters'; readonly maxPower?: number; readonly subType?: string; readonly name?: string }
  | { readonly scope: 'AllOwnCharactersAndLeader'; readonly maxPower?: number; readonly subType?: string; readonly name?: string }
  | { readonly scope: 'OpponentLeader' }
  | { readonly scope: 'OwnLeader' }
  | { readonly scope: 'ChooseOpponentCharacter'; readonly maxCost?: number; readonly maxPower?: number; readonly minPower?: number; readonly subType?: string }
  | { readonly scope: 'ChooseOwnCharacter'; readonly maxCost?: number; readonly maxPower?: number; readonly minPower?: number; readonly subType?: string; readonly attribute?: string }
  | { readonly scope: 'ChooseOwnCharacterOrLeader'; readonly maxCost?: number; readonly maxPower?: number; readonly minPower?: number; readonly subType?: string }
  | { readonly scope: 'ChooseOpponentCharacterOrLeader'; readonly maxCost?: number; readonly maxPower?: number; readonly minPower?: number; readonly subType?: string }
  /** Target 1 of the opponent's DON!! cards in their donArea (unattached). */
  | { readonly scope: 'ChooseOpponentDon' }
  /** Target 1 of the opponent's Characters or unattached DON!! cards. */
  | { readonly scope: 'ChooseOpponentCharacterOrDon'; readonly maxCost?: number }
  /** Target 1 of your own Characters or unattached DON!! cards. */
  | { readonly scope: 'ChooseOwnCharacterOrDon' };

// ─── DSL — Duration ───────────────────────────────────────────────────────────

/** Duration of a temporary effect.
 * - `EndOfTurn` — expires at end of the current (active) player's turn
 * - `DuringYourTurn` — active only during the source player's turns; cleared same as EndOfTurn
 * - `EndOfBattle` — expires when the current battle resolves
 * - `EndOfOpponentTurn` — expires at end of the opponent's next turn
 * - `Permanent` — never expires
 */
export type EffectDuration = 'EndOfTurn' | 'DuringYourTurn' | 'EndOfBattle' | 'EndOfOpponentTurn' | 'Permanent';

// ─── DSL — Deck filter ────────────────────────────────────────────────────────

export type DeckFilter =
  | { readonly kind: 'Any' }
  | { readonly kind: 'ByType'; readonly cardType: 'Character' | 'Event' | 'Stage' }
  | { readonly kind: 'ByCost'; readonly maxCost: number; readonly cardType?: 'Character' | 'Event' | 'Stage' }
  | { readonly kind: 'ByName'; readonly name: string; readonly maxCost?: number }
  /** Match cards whose subTypes string includes the given affiliation/group */
  | { readonly kind: 'BySubType'; readonly subType: string; readonly cardType?: 'Character' | 'Event' | 'Stage'; readonly excludeNames?: readonly string[] };

// ─── DSL — Hand filter (used by PlayFromHand / RevealFromHand) ────────────────

export interface HandFilter {
  readonly color?: CardColor;
  readonly cardType?: 'Character' | 'Event' | 'Stage';
  /** OR filter: matches cards whose type is any of these values */
  readonly cardTypes?: readonly ('Character' | 'Event' | 'Stage')[];
  readonly maxPower?: number;
  readonly maxCost?: number;
  /** Exact card name match */
  readonly name?: string;
  /** Match any card whose name is in this list (OR semantics). */
  readonly names?: readonly string[];
  /** Exclude the source card itself (the card that triggered the OnKO) */
  readonly excludeSelf?: boolean;
  /** Exclude all cards whose name exactly matches this string (e.g. ST21-015 Zoro: "other than [Roronoa Zoro]") */
  readonly excludeName?: string;
  /**
   * Subtype/affiliation substring check — matches cards whose subTypes string
   * includes this value (e.g. "Whitebeard Pirates").
   * If the card has no subTypes data, the check is skipped (fail-open).
   */
  readonly subType?: string;
}

// ─── DSL — Effect actions ─────────────────────────────────────────────────────

export type EffectAction =
  | { readonly type: 'DrawCard'; readonly count: number; readonly condition?: EffectCondition }
  | { readonly type: 'KO'; readonly target: TargetSelector }
  | { readonly type: 'ReturnToHand'; readonly target: TargetSelector }
  | { readonly type: 'PowerBoost'; readonly amount: number; readonly perTrashedCard?: true; readonly target: TargetSelector; readonly duration: EffectDuration }
  | { readonly type: 'AddLife'; readonly count: number }
  | { readonly type: 'GiveDon'; readonly count: number }
  /**
   * Look at the top `lookCount` (or `count`) cards of the deck and let the player choose up to
   * `count` matching `filter` cards to put in `destination`. The rest go to `restTo` (default top).
   * `lookCount` = how many to reveal; `count` = how many the player may select (default 1).
   * When either is set, creates pendingSearchInteraction for player choice.
   * When neither is set, auto-picks the first matching card (bot-friendly).
   */
  | { readonly type: 'SearchDeck'; readonly filter: DeckFilter; readonly destination: 'hand' | 'board' | 'bottomOfDeck'; readonly count?: number; readonly lookCount?: number; readonly restTo?: 'top' | 'bottom' }
  /** Flip `count` Life cards face-up (player chooses); cards stay in the Life zone but become visible. */
  | { readonly type: 'FlipLife'; readonly count: number }
  /** Force the opponent to discard `count` cards from their hand (opponent chooses which). */
  | { readonly type: 'ForceDiscard'; readonly count: number; readonly condition?: EffectCondition; readonly destination?: 'bottomOfDeck' }
  | { readonly type: 'AttachDon'; readonly count: number; readonly target: TargetSelector; readonly from?: 'active' | 'rested'; readonly condition?: EffectCondition }
  | { readonly type: 'GiveKeyword'; readonly keyword: CardKeyword; readonly target: TargetSelector; readonly duration: EffectDuration }
  | { readonly type: 'Rest'; readonly target: TargetSelector }
  | { readonly type: 'RemoveLife'; readonly count: number; readonly scope?: 'own' | 'opponent' }
  /** Current source player wins the game immediately. */
  | { readonly type: 'Win' }
  /** Play the source card onto the board for free. rested=true plays it tapped (e.g. Marco resurrection). */
  | { readonly type: 'PlaySelf'; readonly rested?: boolean }
  /** Play a card from the owner's hand for free, filtered by HandFilter. Requires player choice — sets pendingOnKOInteraction. */
  | { readonly type: 'PlayFromHand'; readonly filter: HandFilter }
  /**
   * Reveal N cards from hand matching filter: if the player can (and does), apply thenActions.
   * Requires player choice — sets pendingRevealInteraction. Cards stay in hand.
   */
  | {
      readonly type: 'RevealFromHand';
      readonly count: number;
      readonly filter: HandFilter;
      /** If true, the player may skip even when they have enough matching cards ("You may"). */
      readonly optional?: true;
      readonly thenActions: readonly EffectAction[];
    }
  /**
   * Player trashes cards from their hand matching filter.
   * count: exact number required (omit = player chooses any amount).
   * optional: if true the player may skip (trash 0 cards) even if matching cards exist.
   * Sets pendingTrashInteraction. thenActions execute after; PowerBoost(perTrashedCard) is
   * scaled by the number of cards actually trashed.
   */
  | {
      readonly type: 'TrashFromHand';
      readonly filter: HandFilter;
      readonly count?: number;
      readonly optional?: true;
      readonly thenActions?: readonly EffectAction[];
    }
  /** Trash `count` cards from the top of the source player's deck, then execute thenActions. */
  | {
      readonly type: 'TrashFromDeck';
      readonly count: number;
      readonly thenActions: readonly EffectAction[];
    }
  /** Play a card from the source player's trash onto the board for free, filtered by HandFilter. Fires OnPlay. */
  | {
      readonly type: 'PlayFromTrash';
      readonly filter: HandFilter;
    }
  /**
   * Reveal `count` cards from the top of the source player's deck, execute thenActions,
   * then return the revealed cards to 'top' or 'bottom' of deck.
   */
  | {
      readonly type: 'RevealFromDeck';
      readonly count: number;
      readonly thenActions: readonly EffectAction[];
      readonly returnTo: 'top' | 'bottom';
    }
  /** Move a card (from any zone) to the bottom of its owner's deck. */
  | {
      readonly type: 'PlaceAtBottomOfDeck';
      readonly target: TargetSelector;
    }
  /** Search the source player's trash for up to `count` cards matching `filter` and add them to hand. */
  | {
      readonly type: 'SearchTrash';
      readonly filter: HandFilter;
      readonly count: number;
    }
  /** Set a card to active (tapped: false). */
  | {
      readonly type: 'Activate';
      readonly target: TargetSelector;
    }
  /**
   * Power boost whose amount is calculated dynamically at resolution time.
   * - `HandSize`: amount = player's current hand size × multiplier
   */
  | {
      readonly type: 'DynamicPowerBoost';
      readonly factor: 'HandSize';
      readonly multiplier: number;
      readonly target: TargetSelector;
      readonly duration: EffectDuration;
    }
  /**
   * Reduce the cost of Event cards the source player plays this turn by `amount` (min 0).
   * Stored on PlayerState.eventCostReduction; cleared at end of turn.
   */
  | { readonly type: 'ReduceEventCost'; readonly amount: number; readonly duration: EffectDuration }
  /**
   * Source player takes `count` cards from the top of their Life zone into their hand.
   * If optional=true the player may choose not to take any.
   */
  | { readonly type: 'TakeFromLife'; readonly count: number; readonly optional?: true }
  /**
   * Force a chosen character to immediately attack once during Main Phase.
   * (ST21-003 Sanji "[On Play] Select 1 of your Characters with 6000 power or less. Have it attack once.")
   * Engine implementation: sets forcedAttacker on game state; not yet fully wired into the combat loop.
   */
  | { readonly type: 'ForceAttack'; readonly target: TargetSelector }
  /**
   * Disable the Blocker keyword on targeted card(s) until end of turn.
   * A card with a disabled Blocker cannot intercept attacks even if it has the Blocker keyword.
   * (ST21-016 Borsalino: "[Trigger] Your opponent cannot activate [Blocker] on their Characters ≤5000 power until end of turn.")
   */
  | { readonly type: 'DisableBlocker'; readonly target: TargetSelector; readonly duration: EffectDuration }
  /**
   * Mark a chosen ally character so that, if it attacks this turn, the opponent cannot
   * activate Blocker against that specific attack.
   * (ST21-003 Sanji: "[On Play] Choose 1 of your Characters. If it attacks this turn, your opponent cannot activate [Blocker].")
   * Unlike DisableBlocker (which targets the blocker card), this marks the *attacker*.
   */
  | { readonly type: 'SuppressBlockerForAttacker'; readonly target: TargetSelector }
  /**
   * Move the source card (the card that triggered this effect) to the trash.
   * Used as an Auto cost for external KO-protection effects.
   * (e.g. OP10-032: "[If this card would be KO'd] → instead [rest/trash this card]")
   */
  | { readonly type: 'TrashSelf' }
  /**
   * Permanently reduce play cost by `amount` while this effect is active.
   * When `subType` is set, the reduction applies only when playing a Character of that type.
   * When `minCost` is set, the reduction applies only to cards with cost ≥ minCost.
   * When both are absent, applies to this card itself (self-reduction pattern).
   * (e.g. ST23-001: "-4 cost if 10000+ power on board", OP05-097: "-1 cost for Celestial Dragons ≥2")
   */
  | { readonly type: 'ModifyCost'; readonly amount: number; readonly subType?: string; readonly minCost?: number }
  /**
   * Set all of the source player's DON!! cards to active (tapped: false).
   * Used for effects like OP13-028: "[On Play] Set all of your DON!! cards as active."
   * Note: the "cannot play from hand" restriction part is not yet enforced by the engine.
   */
  | { readonly type: 'SetAllDonActive' }
  /**
   * Temporarily modify the cost value of targeted card(s) by `amount` until end of turn.
   * Negative amount = cost reduction. Typically used on opponent's characters.
   * Value is stored as card.costModifier and cleared at end of the active player's turn.
   * Affects effectiveCost() which is used in maxCost target filters.
   */
  | { readonly type: 'GiveTemporaryCostModifier'; readonly target: TargetSelector; readonly amount: number }
  /**
   * Power boost proportional to a game-state count (e.g. "+1000 for every 3 rested DON!!").
   * Computed value = floor(count / (divisor ?? 1)) * amount, capped at max if given.
   *
   * `per` choices:
   * - `CardsInTrash`  — total cards in the source player's trash
   * - `EventsInTrash` — Event cards only in source player's trash
   * - `CardsInHand`   — cards in source player's hand
   * - `RestingDon`    — rested DON!! cards in source player's DON!! area
   * - `AttachedDon`   — DON!! attached to the target card
   */
  | {
      readonly type: 'ProportionalPowerBoost';
      readonly target: TargetSelector;
      readonly amount: number;
      readonly per: 'CardsInTrash' | 'EventsInTrash' | 'CardsInHand' | 'RestingDon' | 'AttachedDon';
      readonly divisor?: number;
      readonly max?: number;
      readonly duration: EffectDuration;
    }
  /**
   * Add up to `count` DON!! cards from the source player's own DON!! deck to their DON!! area.
   * `active: true` means the DON arrives untapped; omitting or `false` means rested (tapped).
   * Used for OnReturnDonToDeck effects that add DON back from donDeck.
   */
  | { readonly type: 'AddDon'; readonly count: number; readonly active?: boolean }
  /**
   * Player must choose one option from a list. Engine pauses via pendingChoiceInteraction.
   * Resolved when the player dispatches ResolveChoiceInteraction with the chosen index.
   * Bot auto-selects index 0.
   */
  | { readonly type: 'ChooseOne'; readonly choices: readonly { readonly label: string; readonly actions: readonly EffectAction[] }[]; readonly forOpponent?: boolean }
  /**
   * Set the base power of targeted card(s) to `amount`.
   * Modifies `card.power` directly (permanent until another SetBasePower or card leaves field).
   * (e.g. OP13-084: "[Your Turn] If trash ≥10, set all Five Elder Stars to 8000 base power")
   */
  | { readonly type: 'SetBasePower'; readonly amount: number; readonly target: TargetSelector }
  /**
   * Mark targeted rested card(s) so they will NOT become active during the next Refresh phase.
   * Sets `preventNextRefresh: true` on the card; cleared after the skipped Refresh.
   * (e.g. OP08-024: "[On Attack] Up to 1 opponent rested Character cost ≤4 will not become active")
   */
  | { readonly type: 'PreventRefresh'; readonly target: TargetSelector }
  /**
   * Force the opponent to return `count` cards from their trash to the bottom of their deck.
   * Bot/opponent auto-selects the oldest cards.
   */
  | { readonly type: 'RecoverOpponentTrash'; readonly count: number }
  /**
   * Return all cards in the source player's hand to their deck, then shuffle.
   * Used by self-effects (OP04-048): empty own hand into deck, then draw `thenDraw` cards.
   */
  | { readonly type: 'HandToDeck'; readonly scope: 'own' | 'opponent'; readonly thenDraw?: number }
  /**
   * Move `count` cards from the source player's own trash to the bottom of their deck.
   * Optional filter narrows which trash cards are eligible.
   */
  | { readonly type: 'RecoverTrashToDeck'; readonly count: number; readonly filter?: { readonly subType?: string; readonly cardType?: 'Character' | 'Event' | 'Stage' } }
  /**
   * Reveal the top 1 life card of `target` player to the source player (no interaction required).
   * "target": 'own' | 'opponent' — which player's life is revealed.
   */
  | { readonly type: 'LookAtLife'; readonly target: 'own' | 'opponent'; readonly count?: number }
  /**
   * Pause and create pendingLifeInteraction mode:'Rearrange' — player sees all life cards
   * and reorders them in any order.
   */
  | { readonly type: 'RearrangeLife' }
  /**
   * Move 1 card from the top or bottom of the source player's life to their hand,
   * then create pendingLifeInteraction mode:'Rearrange' to reorder remaining life cards.
   * optional: true means the player may choose not to take the card.
   */
  | { readonly type: 'TakeLifeToHand'; readonly from: 'top' | 'bottom' | 'topOrBottom'; readonly optional?: boolean; readonly thenRearrange?: boolean }
  /**
   * Create pendingLifeInteraction mode:'MoveOne' — player picks 1 life card
   * and moves it to top or bottom.
   */
  | { readonly type: 'MoveLifeCard'; readonly target: 'own' | 'opponent' }
  /**
   * Rest (tap) `count` active DON!! cards from the source player's DON!! area.
   * Used as a substitute cost for KO protection (e.g. OP10-074).
   */
  | { readonly type: 'RestDon'; readonly count: number }
  /**
   * Return `count` DON!! cards from the source player's active DON!! area back to the DON!! deck.
   * Used as a substitute cost for KO protection (e.g. OP15-069).
   */
  | { readonly type: 'ReturnDonToDeck'; readonly count: number }
  /**
   * Move `count` cards from the opponent's board to the source player's hand.
   * Filtered by `filter` (subType and/or maxCost). Used for steal/take effects.
   * `subTypes` is an OR-matched array — card must have at least one of the listed types.
   */
  | { readonly type: 'StealCard'; readonly filter?: { readonly subType?: string; readonly subTypes?: readonly string[]; readonly maxCost?: number } }
  /**
   * Set `effectsNegated: true` on targeted card(s) for the given duration.
   * While effectsNegated is true, calls to resolveEffects with that card as source are skipped.
   * Cleared at EndOfTurn or EndOfOpponentTurn depending on duration.
   */
  | { readonly type: 'NegateEffect'; readonly target: TargetSelector; readonly duration: EffectDuration }
  /**
   * Set the effective cost of targeted card(s) to 0 for this turn.
   * Implemented by setting costModifier = -(card.cost + (card.costModifier ?? 0)).
   * Optional filter: noBaseEffect restricts to cards that have no effects.
   * Source: OP03-091.
   */
  | { readonly type: 'SetCostToZero'; readonly target: TargetSelector; readonly filter?: { readonly noBaseEffect?: boolean } }
  /**
   * Swap the base `power` field of 2 own Characters for the given duration.
   * Selects the first 2 cards from the target selector.
   * TODO: power swap reversal at end of turn is not yet implemented.
   * Source: OP14-001.
   */
  | { readonly type: 'SwapBasePower'; readonly target: TargetSelector; readonly duration: EffectDuration }
  /**
   * Set the base `power` of targeted card(s) to the source player's Leader's current power.
   * Source: OP14-053.
   */
  | { readonly type: 'SetBasePowerToLeader'; readonly target: TargetSelector }
  /**
   * Move all own Characters (except source card) from board to bottom of player's deck.
   * Detaches any attached DON!! cards.
   * Source: OP05-119.
   */
  | { readonly type: 'PlaceAllCharactersAtBottom' }
  /**
   * Add the source card (context.sourceCardId) to the top of its owner's Life zone face-down.
   * Used as a KO substitute cost action. Source: OP11-101.
   */
  | { readonly type: 'AddToLife' }
  /**
   * Move `count` own Characters (auto-picked, excluding source card) from board to bottom of player's deck.
   * Source: OP07-042.
   */
  | { readonly type: 'PlaceOwnCharacterAtBottom'; readonly count: number }
  /**
   * Untap (set tapped: false) the targeted card(s).
   * Used for "set this card as active" effects (e.g. ST12-007).
   */
  | { readonly type: 'SetActive'; readonly target: TargetSelector }
  /**
   * Prevent the source player from adding Life cards to their hand via own effects this turn.
   * Sets lifeToHandBlocked on the player state; cleared at end of turn.
   * Source: ST15-001.
   */
  | { readonly type: 'CannotAddLifeToHand' }
  /**
   * Grant the source player one extra turn: the same player takes another full turn
   * immediately after the current turn ends instead of passing to the opponent.
   * Source: OP05-119.
   */
  | { readonly type: 'ExtraTurn' }
  /**
   * Set a one-shot next-play cost reduction: the next time this player plays a card
   * matching the filter this turn, its cost is reduced by `reduction`. Consumed on use.
   * Source: OP02-025 (Kin'emon).
   */
  | { readonly type: 'SetNextPlayCostReduction'; readonly reduction: number; readonly subType?: string; readonly minCost?: number };

// ─── DSL — Triggers ───────────────────────────────────────────────────────────

export type EffectTrigger =
  | 'OnPlay'              // When this card is played from hand to the board
  | 'OnAttack'            // When this card declares an attack
  | 'OnAttacked'          // When this card is the declared target of an attack
  | 'OnKO'                // When this card is KO'd (by any means)
  | 'OnLeaveField'        // When this card leaves the board (KO or returned to hand)
  | 'OnBlock'             // When this card becomes a blocker
  | 'OnOpponentBlock'         // When the opponent activates a Blocker against this card's controller's attack
  | 'OnOpponentPlaysEvent'    // [Your Turn] When the opponent activates an Event card (requires activationCost)
  | 'Counter'                 // When this card is played from hand during the opponent's attack window
  | 'Trigger'                 // When this card is revealed from the Life zone
  | 'Activated'           // Activated ability during Main phase — [DON!! xN] cost
  | 'StartOfTurn'         // At the start of the card owner's turn (Refresh phase)
  | 'StartOfOpponentTurn' // At the start of the opponent's turn
  | 'StartOfMainPhase'       // When the active player enters Main phase
  | 'EndOfTurn'             // When the active player enters End phase
  /** Fired when this card is about to be KO'd by an opponent's effect (not battle KO).
   *  If the card has a substitution action (e.g. TrashFromHand), the engine pauses and
   *  offers the card's owner the choice to pay the cost and prevent the KO. */
  | 'OnWouldBeKOByEffect'
  /** Always-on effect evaluated every time the engine checks card state (cost reductions, keyword grants, etc.). */
  | 'Permanent'
  /** Fires at the start of the card owner's turn (same timing as StartOfTurn) and grants DuringYourTurn power buffs. */
  | 'YourTurn'
  | 'OnReturnDonToDeck'
  | 'OnDamage'
  | 'OnTrash'
  /** Fires when an opponent's effect would rest this card; owner may pay substitute cost to prevent the rest. */
  | 'OnWouldBeRestedByEffect'
  /** Fires when this card becomes rested (tapped: true) by any means. */
  | 'OnRested'
  /** Fires at the end of a battle in which this card participated (after power modifiers cleared). */
  | 'EndOfBattle';

// ─── DSL — Condition ──────────────────────────────────────────────────────────

export type EffectCondition =
  | { readonly type: 'Always' }
  | { readonly type: 'TurnCount'; readonly min?: number; readonly max?: number }
  | { readonly type: 'HasRestingDon'; readonly count: number }
  /** True when the source card (leader) has at least `count` DON!! attached to it */
  | { readonly type: 'LeaderHasAttachedDon'; readonly count: number }
  /** True when the source card itself has at least `count` DON!! attached to it */
  | { readonly type: 'HasAttachedDon'; readonly count: number }
  /** True when total DON!! attached to ALL source player's cards (leader + characters) is ≥ min */
  | { readonly type: 'HasTotalAttachedDon'; readonly min: number }
  /** True when the source player's trash contains at least `min` cards */
  | { readonly type: 'TrashCount'; readonly min: number }
  /**
   * True when the source player has a character named `name` on the board.
   * If `negate` is true, the condition is inverted (true when the card is NOT on board).
   */
  | { readonly type: 'HasCardOnBoard'; readonly name: string; readonly negate?: true }
  /**
   * True when the source player has at least `min` cards of the given type on the board.
   * If cardType is omitted, counts all characters.
   */
  | { readonly type: 'HasBoardCount'; readonly min: number; readonly cardType?: 'Character' | 'Event' | 'Stage' }
  /**
   * True when the source player's hand satisfies the given size constraint.
   * operator: '<=' (≤ count), '>=' (≥ count), '==' (exact).
   */
  | { readonly type: 'HasHandCount'; readonly operator: '<=' | '>=' | '=='; readonly count: number }
  /** True when the source player's hand size is at most `max` cards (OP07-038_p2 Boa Hancock pattern). */
  | { readonly type: 'HandCount'; readonly max?: number; readonly min?: number }
  /** True when either player has 0 Life cards (used by Gol.D.Roger OnOpponentBlock win condition) */
  | { readonly type: 'AnyPlayerHasNoLife' }
  /** True when the source player's leader card's subTypes includes `subType` */
  | { readonly type: 'LeaderHasType'; readonly subType: string }
  /** True when the source player's leader card's subTypes includes ANY of the given types */
  | { readonly type: 'LeaderHasAnyType'; readonly subTypes: readonly string[] }
  /** True when the source player's leader card's name includes `name` */
  | { readonly type: 'LeaderIsName'; readonly name: string }
  /**
   * True when the specified player has at least one Character on the board
   * with current power (base + DON!! + modifiers) >= minPower.
   * controller: 'Self' (default) = source player's board; 'Opponent' = opponent's board.
   * Leader is excluded — only Character-type cards count.
   * (ST21-017 Gum-Gum Mole Pistol: "if you have a Character with 6000 power or more")
   */
  | { readonly type: 'HasCharacterWithMinPower'; readonly minPower: number; readonly controller?: 'Self' | 'Opponent'; readonly includeLeader?: boolean; readonly minCount?: number }
  | { readonly type: 'RevealedCardHasType'; readonly cardType: string }
  /** True when the logic OR of all child conditions is true */
  | { readonly type: 'OR'; readonly conditions: readonly EffectCondition[] }
  /** True when ALL child conditions are true (logical AND) */
  | { readonly type: 'And'; readonly conditions: readonly EffectCondition[] }
  /**
   * True when the source card's current power meets the threshold.
   * comparison: 'GreaterOrEqual' (≥), 'LessOrEqual' (≤), 'Equal' (==).
   */
  | { readonly type: 'HasPowerThreshold'; readonly power: number; readonly comparison: 'GreaterOrEqual' | 'LessOrEqual' | 'Equal' }
  /**
   * True when own total DON!! count on field is at least `gap` less than opponent's total DON!! count.
   * (e.g. OP07-064: "if DON!! count is at least 2 less than opponent's")
   */
  | { readonly type: 'DonDifference'; readonly gap: number }
  /**
   * True when the source player's leader's current power (base + mods) is ≤ `max`.
   * (e.g. OP15-013: "if your Leader has 0 power or less")
   */
  | { readonly type: 'LeaderPowerAtMost'; readonly max: number }
  /** True when source player's Life count satisfies the constraint (EB03-058, OP07-105 patterns). */
  | { readonly type: 'LifeCount'; readonly max?: number; readonly min?: number; readonly value?: number; readonly comparison?: 'LessOrEqual' | 'GreaterOrEqual' | 'Equal' }
  /** True when opponent's Life count satisfies the constraint (EB01-003, OP06-022 patterns). */
  | { readonly type: 'OpponentLifeCount'; readonly max?: number; readonly min?: number; readonly value?: number; readonly comparison?: 'LessThanOrEqual' | 'GreaterThanOrEqual' | 'LessOrEqual' | 'GreaterOrEqual' | 'Equal' }
  /** True when opponent's Life count satisfies the constraint (alias for OpponentLifeCount — OP05-118 pattern). */
  | { readonly type: 'OpponentLife'; readonly value?: number; readonly comparison?: 'LessOrEqual' | 'GreaterOrEqual' | 'LessThanOrEqual' }
  /** True when source player's Life is strictly fewer than opponent's (OP03-119, OP15-104 patterns). */
  | { readonly type: 'HasFewerLifeThanOpponent' }
  /** True when source player's Life is strictly fewer than opponent's (alias — OP15-104 pattern). */
  | { readonly type: 'PlayerLifeLessThanOpponent' }
  /** True when source player's life count satisfies the constraint (EB04-053 pattern). */
  | { readonly type: 'HasLife'; readonly value?: number; readonly comparison?: 'LessThanOrEqual' | 'GreaterThanOrEqual' | 'less'; readonly opponent?: boolean }
  /** True when source player's life count satisfies the constraint (OP05-101 HasLifeCards pattern). */
  | { readonly type: 'HasLifeCards'; readonly value?: number; readonly operator?: 'LessOrEqual' | 'GreaterOrEqual' | 'Equal' }
  /** True when opponent's hand count satisfies the constraint (ST10-010 pattern). */
  | { readonly type: 'OpponentHandCount'; readonly value?: number; readonly operator?: 'GreaterThanOrEqual' | 'LessThanOrEqual' | 'Equal' }
  /** True when source card's current power satisfies the constraint (OP05-004, OP05-005 patterns). */
  | { readonly type: 'HasPower'; readonly minPower?: number; readonly maxPower?: number }
  /** True when source card's current power satisfies the constraint (CardPower alias). */
  | { readonly type: 'CardPower'; readonly amount?: number; readonly comparison?: 'GreaterThanOrEqual' | 'LessOrEqual' | 'Equal' }
  /** True when source player's leader's life (owner's life) satisfies the constraint (OP13-092). */
  | { readonly type: 'LeaderHasLife'; readonly value?: number; readonly comparison?: 'LessOrEqual' | 'GreaterOrEqual' | 'Equal' }
  /** True when source player's life satisfies a comparison vs opponent (OP13-102). */
  | { readonly type: 'LifeComparison'; readonly operator?: 'LessOrEqual' | 'GreaterOrEqual'; readonly yourSide?: boolean }
  /**
   * True when source player has at least `count` rested Character cards on the board.
   * Only counts rested Characters (not DON!! cards). Optional `subType` filters by affiliation.
   */
  | { readonly type: 'HasRestedCharacters'; readonly count: number; readonly subType?: string }
  /**
   * True when source player has at least `count` rested cards total (DON!! + Characters combined).
   * Used for FILM-type cards: "6 or more rested cards".
   */
  | { readonly type: 'HasRestedCards'; readonly count: number; readonly player?: 'opponent' }
  /** Once-per-turn restriction expressed as a condition (EB03-061 pattern; semantic = Always, use oncePerTurn field for enforcement). */
  | { readonly type: 'OncePerTurn' }
  /** True when the card was KO'd by an opponent's effect (OP11-024 OnKO pattern; best-effort — defaults true). */
  | { readonly type: 'KOByOpponentEffect' }
  /** True when the card was played this turn (EB04-012 pattern; requires game state tracking — defaults true). */
  | { readonly type: 'PlayedThisTurn' }
  /** True when the flip count of life cards is ≤ max (OP07-115 pattern; requires tracking — defaults true). */
  | { readonly type: 'FlipCount'; readonly max?: number; readonly min?: number }
  /** True when the source player has at least N life cards (HasLifeOrLess alias with max). */
  | { readonly type: 'HasLifeOrLess'; readonly value?: number }
  /**
   * True when the total number of DON!! cards in the source player's DON!! area (active + rested)
   * satisfies the comparison (e.g. TotalDonCount ≤ 6 for OP15-068).
   */
  | { readonly type: 'TotalDonCount'; readonly count: number; readonly comparison: 'LessOrEqual' | 'GreaterOrEqual' | 'Equal' }
  /**
   * True when ALL DON!! cards in the source player's DON!! area are rested (tapped).
   */
  | { readonly type: 'AllDonRested' }
  /**
   * True when the source player's active DON!! count is less than or equal to the opponent's active DON!! count.
   * Used for OP07-065 type effects ("you have fewer or equal active DON than opponent").
   */
  | { readonly type: 'DonCountVsOpponent'; readonly operator: 'LessOrEqual' | 'GreaterOrEqual' | 'Equal' }
  /**
   * True when ALL Characters on the source player's board belong to the given subType (no other types present).
   * Source: OP05-092.
   */
  | { readonly type: 'OnlyTypeOnBoard'; readonly subType: string }
  /**
   * True when the wrapped condition is NOT met (logical negation).
   * Source: EB04-005.
   */
  | { readonly type: 'Not'; readonly condition: EffectCondition }
  /**
   * True when the source player has at least 1 face-up Life card (card.faceUp === true).
   * Source: PRB02-018.
   */
  | { readonly type: 'FaceUpLifeCard' }
  /**
   * True when the source player's leader has 2 or more colors (leader.color contains '/').
   * Source: PRB02-005, ST26-005_p1.
   */
  | { readonly type: 'MulticoloredLeader' }
  /**
   * True when the opponent's total DON!! count in donArea satisfies the constraint.
   * Source: PRB02-005 ("opponent has 7 or less DON on their field").
   */
  | { readonly type: 'OpponentDonCount'; readonly max?: number; readonly min?: number }
  /**
   * True when the chosen target card's cost equals the number of DON!! attached to it.
   * Source: OP15-031 (Purinpurin KO condition).
   */
  | { readonly type: 'CostEqualsAttachedDon'; readonly target: TargetSelector };

// ─── DSL — CardEffect ─────────────────────────────────────────────────────────

export interface CardEffect {
  readonly trigger: EffectTrigger;
  readonly condition?: EffectCondition;
  /** Legacy array form: all conditions must pass (AND semantics). Use `condition` for new effects. */
  readonly conditions?: readonly EffectCondition[];
  readonly actions: readonly EffectAction[];
  /**
   * "[Opponent's Turn]" abilities set timing: 'OpponentTurn'.
   * They may only be activated during the OPPONENT's Main phase (inactive player activates).
   * Omitting this field (or any other value) means the effect is used during the card owner's own turn.
   */
  readonly timing?: 'OpponentTurn';
  /**
   * DON!! cost required to activate this effect.
   * `{ don: N }` — rest N active DON!! (consumed from donArea, remain in donArea tapped).
   * `{ type: 'ReturnDon', count: N }` — return N active DON!! from donArea to donDeck.
   *   Fires OnReturnDonToDeck on all board cards + leader after payment.
   */
  readonly cost?: { readonly don: number } | { readonly type: 'ReturnDon' | 'ReturnDonToDeck'; readonly count?: number; readonly amount?: number };
  /**
   * For `OnWouldBeKOByEffect` effects on a PROTECTOR card (not the card being KO'd):
   * this selector defines which allied cards this card can protect.
   * When a KO-by-effect fires on any allied card matching this selector, the engine
   * offers the protector card's owner the chance to pay the substitution cost (the actions).
   * Example: { scope: 'AllOwnCharacters' } — protects any ally Character on the board.
   */
  readonly protects?: TargetSelector;
  /**
   * When true, this effect can only be used once per turn.
   * Activated effects: enforced via activatedAbilityIds (engine already tracks this).
   * Other triggers (OnAttack, YourTurn, etc.): tracked the same way.
   */
  readonly oncePerTurn?: boolean;
}

// ─── Card ─────────────────────────────────────────────────────────────────────

export interface Card {
  readonly id: CardId;
  readonly name: string;
  readonly cost: number;
  readonly power: number;
  readonly color: CardColor;
  readonly type: CardType;
  readonly zone: Zone;
  readonly ownerId: PlayerId;
  readonly tapped: boolean;
  /** DON cards only: ID of the character card this DON is attached to, or null */
  readonly attachedTo: CardId | null;
  /** Keywords: 'Blocker', 'Rush', 'DoubleAttack', 'Unblockable', 'Banish' */
  readonly keywords?: readonly CardKeyword[];
  /** Counter value: power boost this card provides when played from hand during combat */
  readonly counter?: number;
  /** DSL-encoded card effects (OnPlay, OnAttack, OnKO, Trigger, …) */
  readonly effects?: readonly CardEffect[];
  /**
   * Temporary power modifier (EndOfTurn / DuringYourTurn duration).
   * Cleared at end of own turn (EndPhase).
   */
  readonly powerModifier?: number;
  /**
   * Temporary cost modifier (negative = cost reduction). Cleared at end of turn.
   * Applied by GiveTemporaryCostModifier effects (e.g. "Give opponent's Character −2 cost this turn").
   * Affects effective cost used in maxCost target filters and cost comparison effects.
   */
  readonly costModifier?: number;
  /**
   * Power modifier that persists through the opponent's turn (EndOfOpponentTurn duration).
   * Applied during your Main Phase; cleared at the start of your NEXT turn (applyRefresh).
   */
  readonly powerModifierOT?: number;
  /**
   * Power modifier for EndOfBattle duration only.
   * Set by Counter/Activated PowerBoost effects; cleared for ALL cards at ResolveCombat.
   */
  readonly powerModifierBattle?: number;
  /**
   * Permanent power modifier — NOT cleared at end of turn.
   * Applied by PowerBoost with duration:'Permanent'; persists until the card leaves the field.
   */
  readonly permanentPowerModifier?: number;
  /**
   * When true, this card's effects are negated.
   * Set by NegateEffect action; cleared at EndOfTurn or EndOfOpponentTurn depending on duration.
   */
  readonly effectsNegated?: boolean;
  /** Temporary keywords granted by GainKeyword effects — cleared at end of turn */
  readonly temporaryKeywords?: readonly CardKeyword[];
  /**
   * Card subtypes / affiliations as a space-concatenated string from the API
   * (e.g. "The Four Emperors Whitebeard Pirates").
   * Use .includes() to check membership.
   */
  readonly subTypes?: string;
  /**
   * When true, this card will NOT become active during the next Refresh phase.
   * Set by PreventRefresh effects; cleared after the skip.
   */
  readonly preventNextRefresh?: boolean;
  /**
   * Life card is face-up (visible to both players). Cleared when the card leaves the life zone.
   * Source: PRB02-018 FaceUpLifeCard condition.
   */
  readonly faceUp?: boolean;
}

// ─── Player state ─────────────────────────────────────────────────────────────

export interface PlayerState {
  readonly id: PlayerId;
  readonly leader: CardId | null;
  readonly life: readonly CardId[];
  readonly deck: readonly CardId[];
  readonly hand: readonly CardId[];
  readonly board: readonly CardId[];
  readonly donDeck: readonly CardId[];
  /** Active DON cards (includes attached DON, identified by card.attachedTo !== null) */
  readonly donArea: readonly CardId[];
  readonly trash: readonly CardId[];
  /**
   * Total cost reduction applied to Event cards this player plays (from ReduceEventCost effects).
   * Cleared at end of turn. Defaults to 0.
   */
  readonly eventCostReduction: number;
  /**
   * When true, this player cannot add Life cards to their hand via own effects this turn.
   * Set by CannotAddLifeToHand action; cleared at end of turn.
   * Source: ST15-001.
   */
  readonly lifeToHandBlocked?: boolean;
}

// ─── Combat state ─────────────────────────────────────────────────────────────

export interface CombatState {
  /** The attacking card (already tapped) */
  readonly attackerId: CardId;
  /** The original declared target (character or leader) */
  readonly targetId: CardId;
  /** Blocker assigned by the defending player, or null if unblocked */
  readonly blockerId: CardId | null;
  /** Total counter power played by the defending player from hand */
  readonly counterPower: number;
}

// ─── Game log ─────────────────────────────────────────────────────────────────

export interface GameLogEntry {
  /** Monotonic sequence number */
  readonly seq: number;
  readonly event:
    // ── Existing ──
    | 'KO'
    | 'ON_KO_TRIGGER'
    | 'EFFECT_CANDIDATES'
    | 'PROMPT_CREATED'
    | 'EFFECT_SKIPPED'
    | 'PLAYER_CHOICE'
    | 'CARD_PLAYED_VIA_EFFECT'
    | 'QUEUED_TRIGGER'
    // ── Player actions ──
    | 'CARD_PLAYED'
    | 'DON_ATTACHED'
    | 'ATTACK_DECLARED'
    | 'BLOCKER_DECLARED'
    | 'COUNTER_USED'
    | 'TURN_ENDED'
    | 'ABILITY_ACTIVATED'
    | 'REVEAL_ACKNOWLEDGED'
    | 'REVEAL_FROM_HAND_CHOSEN'
    | 'REVEAL_SKIPPED'
    | 'TARGET_CHOSEN'
    | 'TARGET_SKIPPED'
    // ── Effect engine ──
    | 'EFFECT_TRIGGERED'
    | 'POWER_BOOST_APPLIED'
    | 'POWER_BOOST_EXPIRED'
    // ── Combat ──
    | 'COMBAT_RESOLVED'
    | 'DAMAGE_DEALT';
  /** How the KO was caused — only present on KO / ON_KO_TRIGGER events */
  readonly cause?: 'battle' | 'effect';
  /** Compact human-readable message */
  readonly message: string;
  readonly cardId?: CardId | undefined;
  readonly cardName?: string | undefined;
  readonly playerId?: PlayerId | undefined;
  /** Turn number when the event was emitted */
  readonly turn?: number | undefined;
  /** Compact key/value details for structured log inspection */
  readonly details?: Readonly<Record<string, string | number | boolean | null>> | undefined;
}

// ─── Game state ───────────────────────────────────────────────────────────────

export interface GameState {
  readonly cards: Readonly<Record<CardId, Card>>;
  readonly players: Readonly<Record<PlayerId, PlayerState>>;
  readonly playerOrder: readonly [PlayerId, PlayerId];
  readonly activePlayerId: PlayerId;
  readonly phase: GamePhase;
  readonly turnNumber: number;
  /** Pending combat waiting for block decision / resolution, or null */
  readonly activeCombat: CombatState | null;
  /** Set to the winning player's ID when the game ends, null otherwise */
  readonly winner: PlayerId | null;
  /** ID of the player who goes first (used for first-turn restrictions) */
  readonly firstPlayerId: PlayerId;
  /** Players who have already made their mulligan decision */
  readonly mulliganDecided: readonly PlayerId[];
  /** Cards placed on the board during the current turn (cleared on turn change) */
  readonly newBoardIds: readonly CardId[];
  /** Cards that have used their Activated ability this turn (once-per-turn enforcement) */
  readonly activatedAbilityIds: readonly CardId[];
  /**
   * Tracks non-Activated effects with oncePerTurn: true that have fired this turn.
   * Each entry is `${cardId}:${effectIndex}` (index within card.effects array).
   * Cleared at the start of each player's turn alongside activatedAbilityIds.
   */
  readonly usedOncePerTurnEffects: readonly string[];
  /**
   * Set when a PlayFromHand effect fires (e.g. OnKO) and requires a player choice.
   * Cleared when the player dispatches ResolveOnKOInteraction.
   */
  readonly pendingOnKOInteraction: {
    readonly playerId: PlayerId;
    readonly filter: HandFilter;
    readonly sourceCardId: CardId;
  } | null;
  /**
   * FIFO queue of PlayFromHand prompts that fired while pendingOnKOInteraction was set.
   * Order matches the order OnKO triggers fired (target iteration order for KO effects;
   * koCard call order for battle KOs). Each entry is promoted to pendingOnKOInteraction
   * exactly once, after the previous prompt is resolved (played or skipped).
   */
  readonly pendingOnKOQueue: readonly {
    readonly playerId: PlayerId;
    readonly filter: HandFilter;
    readonly sourceCardId: CardId;
  }[];
  /**
   * Set when a ChooseOwnCharacter / ChooseOpponentCharacter effect fires during OnAttack,
   * OnBlock, Trigger, or OnKO and requires the player to pick a board target.
   * Cleared when the player dispatches ResolveTargetInteraction.
   */
  readonly pendingTargetInteraction: {
    readonly playerId: PlayerId;
    readonly scope: 'ChooseOwnCharacter' | 'ChooseOpponentCharacter' | 'ChooseOwnCharacterOrLeader' | 'ChooseOpponentCharacterOrLeader';
    readonly sourceCardId: CardId;
    readonly sourcePlayerId: PlayerId;
    readonly maxCost?: number;
    readonly maxPower?: number;
    readonly subType?: string;
    /** The EffectAction that needs the chosen target to execute */
    readonly pendingAction: EffectAction;
    /** Remaining actions in the same effect (after pendingAction) */
    readonly pendingEffectActions: readonly EffectAction[];
    /** Remaining CardEffects in the effect list (after the current effect) */
    readonly pendingEffects: readonly CardEffect[];
    readonly trigger: EffectTrigger;
    /** Card IDs auto-revealed by RevealFromDeck — forwarded from deck-reveal context for RevealedCardHasType conditions */
    readonly revealedCardIds?: readonly CardId[];
  } | null;
  /**
   * Set when a RevealFromHand effect fires and requires the player to reveal cards.
   * Cleared when the player dispatches ResolveRevealInteraction.
   */
  readonly pendingRevealInteraction: {
    readonly playerId: PlayerId;
    readonly count: number;
    /** Filter for hand-sourced reveals; absent for deck-sourced reveals */
    readonly filter?: HandFilter;
    /** If true, the player may skip even when they have enough matching cards ("You may"). */
    readonly optional?: true;
    readonly sourceCardId: CardId;
    readonly sourcePlayerId: PlayerId;
    readonly thenActions: readonly EffectAction[];
    /** Remaining actions in the same effect (after RevealFromHand / RevealFromDeck) */
    readonly pendingEffectActions: readonly EffectAction[];
    /** Remaining CardEffects in the effect list (after the current effect) */
    readonly pendingEffects: readonly CardEffect[];
    readonly trigger: EffectTrigger;
    /** For deck-sourced reveals: the auto-revealed card IDs (still in their deck zone). */
    readonly revealedCardIds?: readonly CardId[];
    /** For deck-sourced reveals: where to return cards after player acknowledges. */
    readonly returnTo?: 'top' | 'bottom';
  } | null;
  /**
   * Set when a TrashFromHand effect fires and requires the player to choose cards to trash.
   * Cleared when the player dispatches ResolveTrashInteraction.
   */
  readonly pendingTrashInteraction: {
    readonly playerId: PlayerId;
    readonly filter: HandFilter;
    /** Exact number of cards the player must trash (undefined = player chooses any amount). */
    readonly count?: number;
    /** If true the player may skip (send 0 cards) even when matching cards exist. */
    readonly optional?: true;
    readonly sourceCardId: CardId;
    readonly sourcePlayerId: PlayerId;
    readonly thenActions?: readonly EffectAction[];
    /** Remaining actions in the same effect (after TrashFromHand) */
    readonly pendingEffectActions: readonly EffectAction[];
    /** Remaining CardEffects in the effect list (after the current effect) */
    readonly pendingEffects: readonly CardEffect[];
    readonly trigger: EffectTrigger;
  } | null;
  /**
   * Set when a SearchDeck effect fires with a `count` (look at top N cards) and requires
   * the player to choose one card to play. Cleared when ResolveSearchInteraction is dispatched.
   */
  readonly pendingSearchInteraction: {
    readonly playerId: PlayerId;
    readonly revealedCardIds: readonly CardId[];
    readonly filter: DeckFilter;
    readonly destination: 'hand' | 'board' | 'bottomOfDeck' | 'TopOfLife';
    /** Where to place the un-chosen revealed cards after the player picks one. Default: 'top'. */
    readonly restTo?: 'top' | 'bottom';
    /** Maximum number of cards the player may select. Defaults to 1 if absent. */
    readonly maxSelect?: number;
    readonly sourceCardId: CardId;
    readonly sourcePlayerId: PlayerId;
    /** Actions to execute only when the player actually took a card (conditional on chosen !== null). */
    readonly thenActions?: readonly EffectAction[];
    /** Remaining effect actions to resume after the player resolves this search. */
    readonly pendingEffectActions?: readonly EffectAction[];
    /** Remaining effect blocks to resume after the player resolves this search. */
    readonly pendingEffects?: readonly CardEffect[];
    readonly trigger?: EffectTrigger;
    /** 'trash' when the interaction is for returning cards from the player's own trash to deck/hand */
    readonly source?: 'trash';
  } | null;
  /**
   * Set when a ForceDiscard effect fires: the opponent must choose `count` cards from their hand
   * to discard. Cleared when the opponent dispatches ResolveForceDiscardInteraction.
   */
  readonly pendingForceDiscardInteraction: {
    readonly playerId: PlayerId;
    readonly count: number;
    readonly destination?: 'bottomOfDeck';
    readonly pendingEffectActions: readonly EffectAction[];
    readonly pendingEffects: readonly CardEffect[];
    readonly trigger: EffectTrigger;
  } | null;
  /**
   * Set when a ForceAttack effect fires: the named card must make one attack immediately.
   * The player must dispatch DeclareAttack with attackerId === attackerCardId.
   * Cleared when that DeclareAttack is accepted.
   */
  readonly pendingForcedAttack: {
    readonly attackerCardId: CardId;
    readonly ownerId: PlayerId;
  } | null;
  /**
   * Card IDs that have already used their OnWouldBeKOByEffect substitution this turn.
   * Cleared at turn end (same as activatedAbilityIds).
   */
  readonly koSubstituteUsedIds: readonly CardId[];
  /**
   * Set when a KO-by-effect would KO a card that has an `OnWouldBeKOByEffect` effect.
   * The card's owner may pay the substitution cost (e.g. discard 1 card) to prevent the KO.
   * Cleared when the player dispatches ResolveKOSubstitute.
   */
  readonly pendingKOSubstituteInteraction: {
    readonly playerId: PlayerId;
    /** The card that would be KO'd */
    readonly cardId: CardId;
    /** For 'TrashFromHand' cost: which hand cards can be discarded */
    readonly filter: HandFilter;
    readonly sourceCardId: CardId;
    readonly sourcePlayerId: PlayerId;
    readonly pendingEffectActions: readonly EffectAction[];
    readonly pendingEffects: readonly CardEffect[];
    readonly trigger: EffectTrigger;
    /**
     * For external protection (Group 1): the card offering the protection.
     * If undefined, the protected card is protecting itself (original self-protection pattern).
     */
    readonly protectorCardId?: CardId;
    /**
     * How the player pays the substitution cost:
     * - 'TrashFromHand': player must choose a hand card to discard (original pattern)
     * - 'Auto': the engine automatically executes costActions on protectorCard (no player choice needed)
     */
    readonly costType: 'TrashFromHand' | 'Auto';
    /**
     * For costType === 'Auto': the EffectActions to execute on the protector card (e.g. TrashSelf, Rest).
     * Empty array for TrashFromHand (cost is the hand discard, handled by discardedCardId).
     */
    readonly costActions: readonly EffectAction[];
  } | null;
  /**
   * Set when a ChooseOne effect fires and the active player must pick one option.
   * Cleared when the player dispatches ResolveChoiceInteraction.
   */
  readonly pendingChoiceInteraction: {
    readonly playerId: PlayerId;
    readonly choices: readonly { readonly label: string; readonly actions: readonly EffectAction[] }[];
    readonly sourceCardId: CardId;
    readonly sourcePlayerId: PlayerId;
    readonly pendingEffectActions: readonly EffectAction[];
    readonly pendingEffects: readonly CardEffect[];
    readonly trigger: EffectTrigger;
  } | null;
  /**
   * Set when an opponent's effect would rest a card that has OnWouldBeRestedByEffect.
   * The card's owner may pay the substitute cost to prevent the rest.
   * Cleared when the player dispatches ResolveRestSubstituteInteraction.
   */
  readonly pendingRestSubstituteInteraction: {
    readonly playerId: PlayerId;
    /** The card that would be rested */
    readonly targetCardId: CardId;
    /** Actions to execute as substitute cost (e.g. Rest the protector card) */
    readonly substituteActions: readonly EffectAction[];
    readonly pendingEffectActions: readonly EffectAction[];
    readonly pendingEffects: readonly CardEffect[];
    readonly trigger: EffectTrigger;
    readonly sourceCardId: CardId;
    readonly sourcePlayerId: PlayerId;
  } | null;
  /**
   * Set when the player must interact with their life cards (look, rearrange, move, or swap).
   * Cleared when the player dispatches ResolveLifeInteraction.
   */
  readonly pendingLifeInteraction: {
    readonly playerId: PlayerId;
    readonly sourceCardId: CardId;
    /** 'LookOnly': cards shown, auto-resolved. 'Rearrange': player reorders all cards.
     *  'MoveOne': player picks 1 card + destination (top/bottom).
     *  'OpponentChoice': opponent picks from two options. */
    readonly mode: 'LookOnly' | 'Rearrange' | 'MoveOne' | 'OpponentChoice';
    /** Life card IDs visible to the player (in current order) */
    readonly lifeCards: readonly CardId[];
    /** Which player's life cards these are */
    readonly lifeOwnerId: PlayerId;
    /** Options for OpponentChoice mode */
    readonly opponentChoices?: readonly { readonly label: string; readonly actions: readonly EffectAction[] }[];
    readonly pendingEffectActions: readonly EffectAction[];
    readonly pendingEffects: readonly CardEffect[];
    readonly trigger: EffectTrigger;
  } | null;
  /**
   * Card IDs whose Blocker keyword has been suppressed this turn.
   * Cleared at end of turn (turn switch). Cards in this list cannot use Blocker.
   */
  readonly blockerDisabledIds: readonly CardId[];
  /**
   * Attacker card IDs for which Blocker activation is suppressed this turn.
   * When an attacker's ID is in this list, the opponent cannot declare a Blocker against it.
   * Cleared at end of turn (turn switch). Does NOT affect Event Counter plays.
   */
  readonly blockerSuppressedForAttackerIds: readonly CardId[];
  /**
   * Structured engine log for debugging trigger pipelines (KO, OnKO, prompts, choices).
   * Entries are appended; never mutated. Monotonically increasing `seq`.
   */
  readonly gameLog: readonly GameLogEntry[];
  /** When true, the current player takes an extra turn instead of passing to the opponent. Cleared after use. */
  readonly pendingExtraTurn: boolean;
  /**
   * One-shot next-play cost reduction set by SetNextPlayCostReduction.
   * Consumed (cleared) the first time a matching card is played.
   */
  readonly nextPlayCostReduction?: {
    readonly reduction: number;
    readonly subType?: string;
    readonly minCost?: number;
  } | undefined;
}

// ─── Player setup (used in StartGame) ────────────────────────────────────────

export interface PlayerSetup {
  readonly id: PlayerId;
  /** The leader card for this player */
  readonly leaderCard: Card;
  /** The 50-card main deck, in draw order (index 0 = top) */
  readonly deckCards: readonly Card[];
  /** The 10 DON!! cards */
  readonly donCards: readonly Card[];
}

// ─── Actions ──────────────────────────────────────────────────────────────────

/** Active player decides to keep or reshuffle their starting hand (Mulligan phase) */
export interface MulliganAction {
  readonly type: 'Mulligan';
  readonly playerId: PlayerId;
  readonly keep: boolean;
}

/** Legacy low-level draw — usable outside phase restrictions */
export interface DrawCardAction {
  readonly type: 'DrawCard';
  readonly playerId: PlayerId;
}

/** Create a new game from two player setups */
export interface StartGameAction {
  readonly type: 'StartGame';
  readonly player1: PlayerSetup;
  readonly player2: PlayerSetup;
  readonly firstPlayerId: PlayerId;
}

/** Active player draws 1 card (must be in Draw phase) */
export interface DrawPhaseAction {
  readonly type: 'DrawPhase';
  readonly playerId: PlayerId;
}

/** Play a Character card from hand to board, paying its DON cost */
export interface PlayCharacterFromHandAction {
  readonly type: 'PlayCharacterFromHand';
  readonly playerId: PlayerId;
  readonly cardId: CardId;
  /** Pre-chosen target for Choose* effect selectors */
  readonly chosenTargetId?: CardId;
}

/** Attach one DON card from donArea to a character on the board (or leader) */
export interface AssignDonAction {
  readonly type: 'AssignDon';
  readonly playerId: PlayerId;
  readonly donCardId: CardId;
  readonly targetCardId: CardId;
}

/** Advance to the next phase (or next player's turn if in End phase) */
export interface EndPhaseAction {
  readonly type: 'EndPhase';
  readonly playerId: PlayerId;
}

/**
 * Active player taps an attacker and declares a target (character or leader).
 * Must be in Main phase. Sets activeCombat.
 */
export interface DeclareAttackAction {
  readonly type: 'DeclareAttack';
  readonly playerId: PlayerId;
  readonly attackerId: CardId;
  readonly targetId: CardId;
}

/**
 * Defending player assigns a Blocker card to redirect the attack.
 * Only valid while activeCombat is pending and no blocker is set yet.
 */
export interface DeclareBlockAction {
  readonly type: 'DeclareBlock';
  readonly playerId: PlayerId;
  readonly blockerId: CardId;
}

/**
 * Active player resolves the pending combat (after blocker decision).
 * Compares powers, applies KO / leader damage, clears activeCombat.
 */
export interface ResolveCombatAction {
  readonly type: 'ResolveCombat';
  readonly playerId: PlayerId;
}

/**
 * Defending player plays a card from hand as counter during combat.
 * The card's counter value is added to the defender's power for this combat.
 * The card goes to trash.
 */
export interface PlayCounterAction {
  readonly type: 'PlayCounter';
  readonly playerId: PlayerId;
  readonly cardId: CardId;
}

/** Play an Event card from hand, paying its DON cost. Effects resolve, card goes to trash. */
export interface PlayEventAction {
  readonly type: 'PlayEvent';
  readonly playerId: PlayerId;
  readonly cardId: CardId;
  /** Pre-chosen target for Choose* effect selectors */
  readonly chosenTargetId?: CardId;
}

/** Play a Stage card from hand, paying its DON cost. If a Stage is already in play it is sent to Trash (not KO'd). */
export interface PlayStageAction {
  readonly type: 'PlayStage';
  readonly playerId: PlayerId;
  readonly cardId: CardId;
  /** Pre-chosen target for Choose* effect selectors */
  readonly chosenTargetId?: CardId;
}

/** Activate an Activated ability on a board card or leader */
export interface ActivatedAbilityAction {
  readonly type: 'ActivatedAbility';
  readonly playerId: PlayerId;
  readonly cardId: CardId;
  /** Pre-chosen target for Choose* effect selectors */
  readonly chosenTargetId?: CardId;
}

export interface ResolveOnKOInteractionAction {
  readonly type: 'ResolveOnKOInteraction';
  readonly playerId: PlayerId;
  /** The hand card chosen to play for free, or null to skip (no valid cards). */
  readonly cardId: CardId | null;
}

export interface ResolveTargetInteractionAction {
  readonly type: 'ResolveTargetInteraction';
  readonly playerId: PlayerId;
  /** The chosen board target, or null to skip (no valid targets / "up to 1" skip). */
  readonly targetCardId: CardId | null;
}

export interface ResolveRevealInteractionAction {
  readonly type: 'ResolveRevealInteraction';
  readonly playerId: PlayerId;
  /** IDs of hand cards to reveal. Empty array = player skips (no effect applied). */
  readonly revealedCardIds: readonly CardId[];
}

export interface ResolveTrashInteractionAction {
  readonly type: 'ResolveTrashInteraction';
  readonly playerId: PlayerId;
  /** IDs of hand cards to trash. Empty array = player skips (0 cards trashed, thenActions still execute with count=0). */
  readonly trashedCardIds: readonly CardId[];
}

export interface ResolveSearchInteractionAction {
  readonly type: 'ResolveSearchInteraction';
  readonly playerId: PlayerId;
  /** ID of the card from the revealed top-N to play. Null = player passes (no card played). */
  readonly chosenCardId: CardId | null;
  /** IDs of trash cards to return (multi-select path, used when pending.source === 'trash'). */
  readonly chosenCardIds?: readonly CardId[];
}

export interface ResolveForceDiscardInteractionAction {
  readonly type: 'ResolveForceDiscardInteraction';
  readonly playerId: PlayerId;
  /** IDs of hand cards the player chose to discard. */
  readonly discardedCardIds: readonly CardId[];
}

export interface ResolveChoiceInteractionAction {
  readonly type: 'ResolveChoiceInteraction';
  readonly playerId: PlayerId;
  /** Index of the chosen option (0-based) */
  readonly choiceIndex: number;
}

export interface ResolveRestSubstituteInteractionAction {
  readonly type: 'ResolveRestSubstituteInteraction';
  readonly playerId: PlayerId;
  /** true = pay the substitute cost and prevent the rest; false = let the rest happen */
  readonly accept: boolean;
}

export interface ResolveLifeInteractionAction {
  readonly type: 'ResolveLifeInteraction';
  readonly playerId: PlayerId;
  /** For mode:'Rearrange' — the desired new order of all life card IDs */
  readonly newOrder?: readonly CardId[];
  /** For mode:'MoveOne' — which card to move */
  readonly cardId?: CardId;
  /** For mode:'MoveOne' — where to place it ('hand' moves the card to the player's hand) */
  readonly destination?: 'top' | 'bottom' | 'hand';
  /** For mode:'OpponentChoice' — index of chosen option */
  readonly choiceIndex?: number;
}

export interface ResolveKOSubstituteAction {
  readonly type: 'ResolveKOSubstitute';
  readonly playerId: PlayerId;
  /**
   * For costType === 'TrashFromHand': the hand card chosen to discard, or null to refuse.
   * For costType === 'Auto': pass null (cost is executed automatically), or null to refuse.
   * To explicitly accept an Auto-cost substitution, set accept: true.
   */
  readonly discardedCardId: CardId | null;
  /** Explicitly accept an Auto-cost substitution (costType === 'Auto'). */
  readonly accept?: true;
}

export type GameAction =
  | MulliganAction
  | DrawCardAction
  | StartGameAction
  | DrawPhaseAction
  | PlayCharacterFromHandAction
  | AssignDonAction
  | EndPhaseAction
  | DeclareAttackAction
  | DeclareBlockAction
  | ResolveCombatAction
  | PlayCounterAction
  | PlayEventAction
  | PlayStageAction
  | ActivatedAbilityAction
  | ResolveOnKOInteractionAction
  | ResolveTargetInteractionAction
  | ResolveRevealInteractionAction
  | ResolveTrashInteractionAction
  | ResolveSearchInteractionAction
  | ResolveForceDiscardInteractionAction
  | ResolveKOSubstituteAction
  | ResolveChoiceInteractionAction
  | ResolveRestSubstituteInteractionAction
  | ResolveLifeInteractionAction;

// ─── Result ───────────────────────────────────────────────────────────────────

export interface GameError {
  readonly kind: 'GameError';
  readonly code: string;
  readonly message: string;
}

export type ActionResult = GameState | GameError;

export function isGameError(result: ActionResult): result is GameError {
  return (result as GameError).kind === 'GameError';
}

export function makeGameError(code: string, message: string): GameError {
  return { kind: 'GameError', code, message };
}

// ─── Utilities ────────────────────────────────────────────────────────────────

/** Returns an empty placeholder GameState. Pass to applyAction(StartGame) to bootstrap. */
export function makeEmptyState(p1: PlayerId, p2: PlayerId): GameState {
  const emptyPlayer = (id: PlayerId): PlayerState => ({
    id,
    leader: null,
    life: [],
    deck: [],
    hand: [],
    board: [],
    donDeck: [],
    donArea: [],
    trash: [],
    eventCostReduction: 0,
  });

  return {
    cards: {} as Readonly<Record<CardId, Card>>,
    players: {
      [p1]: emptyPlayer(p1),
      [p2]: emptyPlayer(p2),
    },
    playerOrder: [p1, p2],
    activePlayerId: p1,
    phase: 'Refresh',
    turnNumber: 0,
    activeCombat: null,
    winner: null,
    firstPlayerId: p1,
    mulliganDecided: [],
    newBoardIds: [],
    activatedAbilityIds: [],
    usedOncePerTurnEffects: [],
    pendingOnKOInteraction: null,
    pendingOnKOQueue: [],
    pendingTargetInteraction: null,
    pendingRevealInteraction: null,
    pendingTrashInteraction: null,
    pendingSearchInteraction: null,
    pendingForceDiscardInteraction: null,
    pendingForcedAttack: null,
    koSubstituteUsedIds: [],
    pendingKOSubstituteInteraction: null,
    pendingChoiceInteraction: null,
    pendingRestSubstituteInteraction: null,
    pendingLifeInteraction: null,
    blockerDisabledIds: [],
    blockerSuppressedForAttackerIds: [],
    gameLog: [],
    pendingExtraTurn: false,
  };
}
