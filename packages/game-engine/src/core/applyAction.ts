import type {
  GameState,
  GameAction,
  ActionResult,
  CardId,
  PlayerState,
  Card,
  PlayerSetup,
  GamePhase,
} from '../types/index.js';
import { makeGameError } from '../types/index.js';

// ─── DrawCard (legacy) ────────────────────────────────────────────────────────

function applyDrawCard(
  state: GameState,
  action: Extract<GameAction, { type: 'DrawCard' }>
): ActionResult {
  const player = state.players[action.playerId];

  if (player === undefined) {
    return makeGameError('UNKNOWN_PLAYER', `Player ${action.playerId} not found`);
  }
  if (player.deck.length === 0) {
    return makeGameError('EMPTY_DECK', `Player ${action.playerId} has no cards left in deck`);
  }

  const [drawnCardId, ...remainingDeck] = player.deck as [CardId, ...CardId[]];

  const updatedCard = { ...state.cards[drawnCardId]!, zone: 'hand' as const };
  const updatedPlayer: PlayerState = {
    ...player,
    deck: remainingDeck,
    hand: [...player.hand, drawnCardId],
  };

  return {
    ...state,
    cards: { ...state.cards, [drawnCardId]: updatedCard },
    players: { ...state.players, [action.playerId]: updatedPlayer },
  };
}

// ─── StartGame ────────────────────────────────────────────────────────────────

function buildPlayerState(
  setup: PlayerSetup,
  allCards: Record<string, Card>
): PlayerState {
  // Leader
  const leader: Card = { ...setup.leaderCard, zone: 'leader', ownerId: setup.id, tapped: false, attachedTo: null };
  allCards[leader.id] = leader;

  // DON!! deck
  const donIds: CardId[] = [];
  for (const don of setup.donCards) {
    const donCard: Card = { ...don, zone: 'donDeck', ownerId: setup.id, tapped: false, attachedTo: null };
    allCards[don.id] = donCard;
    donIds.push(don.id);
  }

  // Main deck in draw order
  const deckOrdered = setup.deckCards.map((c): Card => ({
    ...c,
    zone: 'deck',
    ownerId: setup.id,
    tapped: false,
    attachedTo: null,
  }));
  for (const c of deckOrdered) {
    allCards[c.id] = c;
  }

  // Top 5 → life (face-down)
  const lifeIds = deckOrdered.slice(0, 5).map((c) => c.id);
  for (const id of lifeIds) {
    allCards[id] = { ...allCards[id]!, zone: 'life' };
  }

  // Next 5 → starting hand
  const handIds = deckOrdered.slice(5, 10).map((c) => c.id);
  for (const id of handIds) {
    allCards[id] = { ...allCards[id]!, zone: 'hand' };
  }

  // Rest stays in deck
  const remainingDeckIds = deckOrdered.slice(10).map((c) => c.id);

  return {
    id: setup.id,
    leader: leader.id,
    life: lifeIds,
    deck: remainingDeckIds,
    hand: handIds,
    board: [],
    donDeck: donIds,
    donArea: [],
    trash: [],
  };
}

function applyStartGame(
  _state: GameState,
  action: Extract<GameAction, { type: 'StartGame' }>
): ActionResult {
  const { player1, player2, firstPlayerId } = action;

  if (player1.id === player2.id) {
    return makeGameError('DUPLICATE_PLAYER', 'Both players cannot have the same ID');
  }
  if (firstPlayerId !== player1.id && firstPlayerId !== player2.id) {
    return makeGameError(
      'UNKNOWN_PLAYER',
      `First player "${firstPlayerId}" is not in the game`
    );
  }
  if (player1.deckCards.length < 10) {
    return makeGameError('INVALID_DECK', 'Player 1 deck must have at least 10 cards (5 life + 5 hand)');
  }
  if (player2.deckCards.length < 10) {
    return makeGameError('INVALID_DECK', 'Player 2 deck must have at least 10 cards (5 life + 5 hand)');
  }

  const allCards: Record<string, Card> = {};
  const p1State = buildPlayerState(player1, allCards);
  const p2State = buildPlayerState(player2, allCards);

  return {
    cards: allCards as Readonly<Record<CardId, Card>>,
    players: {
      [player1.id]: p1State,
      [player2.id]: p2State,
    },
    playerOrder: [player1.id, player2.id],
    activePlayerId: firstPlayerId,
    phase: 'Refresh',
    turnNumber: 1,
  };
}

// ─── DrawPhase ────────────────────────────────────────────────────────────────

function applyDrawPhase(
  state: GameState,
  action: Extract<GameAction, { type: 'DrawPhase' }>
): ActionResult {
  if (action.playerId !== state.activePlayerId) {
    return makeGameError('NOT_ACTIVE_PLAYER', `Player ${action.playerId} is not the active player`);
  }
  if (state.phase !== 'Draw') {
    return makeGameError('WRONG_PHASE', `DrawPhase requires Draw phase, current: ${state.phase}`);
  }

  const player = state.players[action.playerId];
  if (player === undefined) {
    return makeGameError('UNKNOWN_PLAYER', `Player ${action.playerId} not found`);
  }
  if (player.deck.length === 0) {
    return makeGameError('EMPTY_DECK', `Player ${action.playerId} has no cards left in deck`);
  }

  const [drawnCardId, ...remainingDeck] = player.deck as [CardId, ...CardId[]];

  const updatedCard = { ...state.cards[drawnCardId]!, zone: 'hand' as const };
  const updatedPlayer: PlayerState = {
    ...player,
    deck: remainingDeck,
    hand: [...player.hand, drawnCardId],
  };

  return {
    ...state,
    phase: 'DON',
    cards: { ...state.cards, [drawnCardId]: updatedCard },
    players: { ...state.players, [action.playerId]: updatedPlayer },
  };
}

// ─── PlayCharacterFromHand ────────────────────────────────────────────────────

function applyPlayCharacterFromHand(
  state: GameState,
  action: Extract<GameAction, { type: 'PlayCharacterFromHand' }>
): ActionResult {
  if (action.playerId !== state.activePlayerId) {
    return makeGameError('NOT_ACTIVE_PLAYER', `Player ${action.playerId} is not the active player`);
  }
  if (state.phase !== 'Main') {
    return makeGameError('WRONG_PHASE', `PlayCharacterFromHand requires Main phase, current: ${state.phase}`);
  }

  const player = state.players[action.playerId];
  if (player === undefined) {
    return makeGameError('UNKNOWN_PLAYER', `Player ${action.playerId} not found`);
  }

  const card = state.cards[action.cardId];
  if (card === undefined) {
    return makeGameError('UNKNOWN_CARD', `Card ${action.cardId} not found`);
  }
  if (card.type !== 'Character') {
    return makeGameError('INVALID_CARD_TYPE', `Card ${action.cardId} is not a Character (got ${card.type})`);
  }
  if (!player.hand.includes(action.cardId)) {
    return makeGameError('CARD_NOT_IN_HAND', `Card ${action.cardId} is not in ${action.playerId}'s hand`);
  }

  // Active DON = in donArea, not tapped, not attached
  const activeDonIds = player.donArea.filter((donId) => {
    const don = state.cards[donId];
    return don !== undefined && !don.tapped && don.attachedTo === null;
  });

  if (activeDonIds.length < card.cost) {
    return makeGameError(
      'INSUFFICIENT_DON',
      `Card costs ${card.cost} DON but only ${activeDonIds.length} active DON available`
    );
  }

  // Auto-rest exactly card.cost DON cards
  const donToRest = activeDonIds.slice(0, card.cost);
  const updatedCards: Record<string, Card> = { ...state.cards };

  for (const donId of donToRest) {
    updatedCards[donId] = { ...updatedCards[donId]!, tapped: true };
  }

  updatedCards[action.cardId] = { ...card, zone: 'board' };

  const updatedPlayer: PlayerState = {
    ...player,
    hand: player.hand.filter((id) => id !== action.cardId),
    board: [...player.board, action.cardId],
  };

  return {
    ...state,
    cards: updatedCards as Readonly<Record<CardId, Card>>,
    players: { ...state.players, [action.playerId]: updatedPlayer },
  };
}

// ─── AssignDon ────────────────────────────────────────────────────────────────

function applyAssignDon(
  state: GameState,
  action: Extract<GameAction, { type: 'AssignDon' }>
): ActionResult {
  const player = state.players[action.playerId];
  if (player === undefined) {
    return makeGameError('UNKNOWN_PLAYER', `Player ${action.playerId} not found`);
  }

  const donCard = state.cards[action.donCardId];
  if (donCard === undefined) {
    return makeGameError('UNKNOWN_CARD', `DON card ${action.donCardId} not found`);
  }
  if (donCard.type !== 'DON') {
    return makeGameError('INVALID_CARD_TYPE', `Card ${action.donCardId} is not a DON card`);
  }
  if (!player.donArea.includes(action.donCardId)) {
    return makeGameError('DON_NOT_IN_AREA', `DON card ${action.donCardId} is not in ${action.playerId}'s donArea`);
  }
  if (donCard.attachedTo !== null) {
    return makeGameError('DON_ALREADY_ATTACHED', `DON card ${action.donCardId} is already attached to ${donCard.attachedTo}`);
  }

  const targetCard = state.cards[action.targetCardId];
  if (targetCard === undefined) {
    return makeGameError('UNKNOWN_CARD', `Target card ${action.targetCardId} not found`);
  }

  const onBoard = player.board.includes(action.targetCardId);
  const isLeader = player.leader === action.targetCardId;
  if (!onBoard && !isLeader) {
    return makeGameError(
      'TARGET_NOT_ON_BOARD',
      `Target card ${action.targetCardId} is not on ${action.playerId}'s board or leader zone`
    );
  }

  return {
    ...state,
    cards: {
      ...state.cards,
      [action.donCardId]: { ...donCard, attachedTo: action.targetCardId },
    },
  };
}

// ─── EndPhase ─────────────────────────────────────────────────────────────────

const PHASE_SEQUENCE: readonly GamePhase[] = ['Refresh', 'Draw', 'DON', 'Main', 'End'];

function applyEndPhase(
  state: GameState,
  action: Extract<GameAction, { type: 'EndPhase' }>
): ActionResult {
  if (action.playerId !== state.activePlayerId) {
    return makeGameError('NOT_ACTIVE_PLAYER', `Player ${action.playerId} is not the active player`);
  }

  if (state.phase === 'End') {
    // Turn ends: switch active player, reset to Refresh, increment turn counter
    const currentIndex = state.playerOrder.indexOf(state.activePlayerId);
    const nextIndex = currentIndex === 0 ? 1 : 0;
    const nextPlayerId = state.playerOrder[nextIndex]!;

    return {
      ...state,
      activePlayerId: nextPlayerId,
      phase: 'Refresh',
      turnNumber: state.turnNumber + 1,
    };
  }

  const currentIndex = PHASE_SEQUENCE.indexOf(state.phase);
  const nextPhase = PHASE_SEQUENCE[currentIndex + 1]!;

  return { ...state, phase: nextPhase };
}

// ─── applyAction (dispatcher) ─────────────────────────────────────────────────

export function applyAction(state: GameState, action: GameAction): ActionResult {
  switch (action.type) {
    case 'DrawCard':
      return applyDrawCard(state, action);
    case 'StartGame':
      return applyStartGame(state, action);
    case 'DrawPhase':
      return applyDrawPhase(state, action);
    case 'PlayCharacterFromHand':
      return applyPlayCharacterFromHand(state, action);
    case 'AssignDon':
      return applyAssignDon(state, action);
    case 'EndPhase':
      return applyEndPhase(state, action);
    default: {
      const _exhaustive: never = action;
      return makeGameError('UNKNOWN_ACTION', `Unknown action type: ${JSON.stringify(_exhaustive)}`);
    }
  }
}
