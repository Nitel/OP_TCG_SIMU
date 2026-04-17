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
  | 'trash';

export type CardColor = 'Red' | 'Blue' | 'Green' | 'Purple' | 'Black' | 'Yellow';

export type CardType = 'Leader' | 'Character' | 'Event' | 'Stage' | 'DON';

export type GamePhase = 'Mulligan' | 'Refresh' | 'Draw' | 'DON' | 'Main' | 'End';

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
  /** Keywords: 'Blocker', 'Rush', 'Banish', etc. */
  readonly keywords?: readonly string[];
  /** Counter value: power boost this card provides when played from hand during combat */
  readonly counter?: number;
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
  | PlayCounterAction;

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
  };
}
