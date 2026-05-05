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
  | 'Rush'          // Can attack the turn it is played
  | 'Blocker'       // Can intercept attacks targeting other cards (tap to redirect)
  | 'Banish'        // KO'd cards are removed from game instead of trash
  | 'DoubleAttack'  // Unblocked attacks on the leader deal 2 damage instead of 1
  | 'Unblockable';  // Cannot be blocked

// ─── DSL — Target selectors ───────────────────────────────────────────────────

export type TargetSelector =
  | { readonly scope: 'Self' }
  | { readonly scope: 'Attacker' }
  | { readonly scope: 'OriginalTarget' }
  | { readonly scope: 'AllOpponentCharacters'; readonly maxPower?: number }
  | { readonly scope: 'AllOwnCharacters'; readonly maxPower?: number }
  | { readonly scope: 'AllOwnCharactersAndLeader'; readonly maxPower?: number }
  | { readonly scope: 'OpponentLeader' }
  | { readonly scope: 'OwnLeader' }
  | { readonly scope: 'ChooseOpponentCharacter'; readonly maxCost?: number; readonly maxPower?: number }
  | { readonly scope: 'ChooseOwnCharacter'; readonly maxCost?: number; readonly maxPower?: number }
  | { readonly scope: 'ChooseOwnCharacterOrLeader'; readonly maxCost?: number; readonly maxPower?: number }
  | { readonly scope: 'ChooseOpponentCharacterOrLeader'; readonly maxCost?: number; readonly maxPower?: number };

// ─── DSL — Duration ───────────────────────────────────────────────────────────

export type EffectDuration = 'EndOfTurn' | 'EndOfBattle' | 'EndOfOpponentTurn' | 'Permanent';

// ─── DSL — Deck filter ────────────────────────────────────────────────────────

export type DeckFilter =
  | { readonly kind: 'Any' }
  | { readonly kind: 'ByType'; readonly cardType: 'Character' | 'Event' | 'Stage' }
  | { readonly kind: 'ByCost'; readonly maxCost: number }
  | { readonly kind: 'ByName'; readonly name: string };

// ─── DSL — Hand filter (used by PlayFromHand / RevealFromHand) ────────────────

export interface HandFilter {
  readonly color?: CardColor;
  readonly cardType?: 'Character' | 'Event' | 'Stage';
  /** OR filter: matches cards whose type is any of these values */
  readonly cardTypes?: readonly ('Character' | 'Event' | 'Stage')[];
  readonly maxPower?: number;
  /** Exclude the source card itself (the card that triggered the OnKO) */
  readonly excludeSelf?: boolean;
  /**
   * Subtype/affiliation substring check — matches cards whose subTypes string
   * includes this value (e.g. "Whitebeard Pirates").
   * If the card has no subTypes data, the check is skipped (fail-open).
   */
  readonly subType?: string;
}

// ─── DSL — Effect actions ─────────────────────────────────────────────────────

export type EffectAction =
  | { readonly type: 'DrawCard'; readonly count: number }
  | { readonly type: 'KO'; readonly target: TargetSelector }
  | { readonly type: 'ReturnToHand'; readonly target: TargetSelector }
  | { readonly type: 'PowerBoost'; readonly amount: number; readonly perTrashedCard?: true; readonly target: TargetSelector; readonly duration: EffectDuration }
  | { readonly type: 'AddLife'; readonly count: number }
  | { readonly type: 'GiveDon'; readonly count: number }
  /**
   * Look at the top `count` cards of the deck (or all, if count is omitted) and let the player
   * choose one matching `filter` to put in `destination`. The rest return to the top of the deck.
   * When `count` is provided, sets pendingSearchInteraction for player choice.
   * When `count` is omitted, auto-picks the first matching card (bot-friendly).
   */
  | { readonly type: 'SearchDeck'; readonly filter: DeckFilter; readonly destination: 'hand' | 'board'; readonly count?: number }
  /** Flip `count` Life cards face-up (player chooses); cards stay in the Life zone but become visible. */
  | { readonly type: 'FlipLife'; readonly count: number }
  /** Force the opponent to discard `count` cards from their hand (opponent chooses which). */
  | { readonly type: 'ForceDiscard'; readonly count: number }
  | { readonly type: 'AttachDon'; readonly count: number; readonly target: TargetSelector; readonly from?: 'active' | 'rested' }
  | { readonly type: 'GiveKeyword'; readonly keyword: CardKeyword; readonly target: TargetSelector; readonly duration: EffectDuration }
  | { readonly type: 'Rest'; readonly target: TargetSelector }
  | { readonly type: 'RemoveLife'; readonly count: number }
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
      readonly thenActions: readonly EffectAction[];
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
    };

// ─── DSL — Triggers ───────────────────────────────────────────────────────────

export type EffectTrigger =
  | 'OnPlay'              // When this card is played from hand to the board
  | 'OnAttack'            // When this card declares an attack
  | 'OnAttacked'          // When this card is the declared target of an attack
  | 'OnKO'                // When this card is KO'd (by any means)
  | 'OnLeaveField'        // When this card leaves the board (KO or returned to hand)
  | 'OnBlock'             // When this card becomes a blocker
  | 'OnOpponentBlock'     // When the opponent activates a Blocker against this card's controller's attack
  | 'Counter'             // When this card is played from hand during the opponent's attack window
  | 'Trigger'             // When this card is revealed from the Life zone
  | 'Activated'           // Activated ability during Main phase — [DON!! xN] cost
  | 'StartOfTurn'         // At the start of the card owner's turn (Refresh phase)
  | 'StartOfOpponentTurn' // At the start of the opponent's turn
  | 'StartOfMainPhase'    // When the active player enters Main phase
  | 'EndOfTurn';          // When the active player enters End phase

// ─── DSL — Condition ──────────────────────────────────────────────────────────

export type EffectCondition =
  | { readonly type: 'Always' }
  | { readonly type: 'TurnCount'; readonly min?: number; readonly max?: number }
  | { readonly type: 'HasRestingDon'; readonly count: number }
  /** True when the source card (leader) has at least `count` DON!! attached to it */
  | { readonly type: 'LeaderHasAttachedDon'; readonly count: number }
  /** True when the source card itself has at least `count` DON!! attached to it */
  | { readonly type: 'HasAttachedDon'; readonly count: number }
  /** True when the source player's trash contains at least `min` cards */
  | { readonly type: 'TrashCount'; readonly min: number }
  /** True when the source player has a character named `name` on the board */
  | { readonly type: 'HasCardOnBoard'; readonly name: string }
  /** True when either player has 0 Life cards (used by Gol.D.Roger OnOpponentBlock win condition) */
  | { readonly type: 'AnyPlayerHasNoLife' }
  /** True when the source player's leader card's subTypes includes `subType` */
  | { readonly type: 'LeaderHasType'; readonly subType: string }
  /** True when the source player's leader card's subTypes includes ANY of the given types */
  | { readonly type: 'LeaderHasAnyType'; readonly subTypes: readonly string[] }
  /** True when the source player's leader card's name includes `name` */
  | { readonly type: 'LeaderIsName'; readonly name: string };

// ─── DSL — CardEffect ─────────────────────────────────────────────────────────

export interface CardEffect {
  readonly trigger: EffectTrigger;
  readonly condition?: EffectCondition;
  readonly actions: readonly EffectAction[];
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
   * Temporary power modifier (EndOfTurn / EndOfBattle duration).
   * Cleared at end of battle (attacker) or end of own turn.
   */
  readonly powerModifier?: number;
  /**
   * Power modifier that persists through the opponent's turn (EndOfOpponentTurn duration).
   * Applied during your Main Phase; cleared at the start of your NEXT turn (applyRefresh).
   */
  readonly powerModifierOT?: number;
  /** Temporary keywords granted by GainKeyword effects — cleared at end of turn */
  readonly temporaryKeywords?: readonly CardKeyword[];
  /**
   * Card subtypes / affiliations as a space-concatenated string from the API
   * (e.g. "The Four Emperors Whitebeard Pirates").
   * Use .includes() to check membership.
   */
  readonly subTypes?: string;
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
   * Set when a PlayFromHand effect fires (e.g. OnKO) and requires a player choice.
   * Cleared when the player dispatches ResolveOnKOInteraction.
   */
  readonly pendingOnKOInteraction: {
    readonly playerId: PlayerId;
    readonly filter: HandFilter;
    readonly sourceCardId: CardId;
  } | null;
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
    /** The EffectAction that needs the chosen target to execute */
    readonly pendingAction: EffectAction;
    /** Remaining actions in the same effect (after pendingAction) */
    readonly pendingEffectActions: readonly EffectAction[];
    /** Remaining CardEffects in the effect list (after the current effect) */
    readonly pendingEffects: readonly CardEffect[];
    readonly trigger: EffectTrigger;
  } | null;
  /**
   * Set when a RevealFromHand effect fires and requires the player to reveal cards.
   * Cleared when the player dispatches ResolveRevealInteraction.
   */
  readonly pendingRevealInteraction: {
    readonly playerId: PlayerId;
    readonly count: number;
    readonly filter: HandFilter;
    readonly sourceCardId: CardId;
    readonly sourcePlayerId: PlayerId;
    readonly thenActions: readonly EffectAction[];
    /** Remaining actions in the same effect (after RevealFromHand) */
    readonly pendingEffectActions: readonly EffectAction[];
    /** Remaining CardEffects in the effect list (after the current effect) */
    readonly pendingEffects: readonly CardEffect[];
    readonly trigger: EffectTrigger;
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
    readonly thenActions: readonly EffectAction[];
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
    readonly destination: 'hand' | 'board';
    readonly sourceCardId: CardId;
    readonly sourcePlayerId: PlayerId;
  } | null;
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
  readonly targetCardId: CardId;
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
  | ActivatedAbilityAction
  | ResolveOnKOInteractionAction
  | ResolveTargetInteractionAction
  | ResolveRevealInteractionAction
  | ResolveTrashInteractionAction
  | ResolveSearchInteractionAction;

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
    pendingOnKOInteraction: null,
    pendingTargetInteraction: null,
    pendingRevealInteraction: null,
    pendingTrashInteraction: null,
    pendingSearchInteraction: null,
  };
}
