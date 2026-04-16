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

export type GamePhase = 'Refresh' | 'Draw' | 'DON' | 'Main' | 'End';

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

// ─── Game state ───────────────────────────────────────────────────────────────

export interface GameState {
  readonly cards: Readonly<Record<CardId, Card>>;
  readonly players: Readonly<Record<PlayerId, PlayerState>>;
  readonly playerOrder: readonly [PlayerId, PlayerId];
  readonly activePlayerId: PlayerId;
  readonly phase: GamePhase;
  readonly turnNumber: number;
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

export type GameAction =
  | DrawCardAction
  | StartGameAction
  | DrawPhaseAction
  | PlayCharacterFromHandAction
  | AssignDonAction
  | EndPhaseAction;

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
  };
}
