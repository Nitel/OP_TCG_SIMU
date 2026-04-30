import type {
  GameState,
  GameAction,
  ActionResult,
  GameError,
  CardId,
  PlayerId,
  PlayerState,
  Card,
  PlayerSetup,
  GamePhase,
  EffectTrigger,
} from '../types/index.js';
import { makeGameError } from '../types/index.js';
import { resolveCombat } from '../rules/combat.js';
import { clearPowerModifiers, clearOppTurnModifiers, clearTemporaryKeywords, hasKeyword } from '../rules/cardUtils.js';
import { resolveEffects } from '../effects/effectResolver.js';

// ─── Phase helpers ────────────────────────────────────────────────────────────

// ─── Mulligan helpers ─────────────────────────────────────────────────────────

function shuffle<T>(arr: readonly T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function placeLifeCards(state: GameState, playerId: PlayerId): GameState {
  const player = state.players[playerId];
  if (player === undefined) return state;
  const lifeIds = player.deck.slice(0, 5);
  const remainingDeck = player.deck.slice(5);
  const updatedCards: Record<string, Card> = { ...state.cards };
  for (const id of lifeIds) {
    updatedCards[id] = { ...updatedCards[id]!, zone: 'life' };
  }
  return {
    ...state,
    cards: updatedCards as Readonly<Record<CardId, Card>>,
    players: {
      ...state.players,
      [playerId]: { ...player, life: lifeIds, deck: remainingDeck },
    },
  };
}

// ─── Phase helpers ────────────────────────────────────────────────────────────

/** Draw up to 2 DON!! from donDeck → donArea for the active player. */
function applyDonDraw(state: GameState, playerId: PlayerId): GameState {
  const player = state.players[playerId];
  if (player === undefined) return state;

  const isFirstTurnFirstPlayer = state.turnNumber === 1 && playerId === state.firstPlayerId;
  const count = Math.min(isFirstTurnFirstPlayer ? 1 : 2, player.donDeck.length);
  if (count === 0) return state;

  const drawn    = player.donDeck.slice(0, count);
  const remaining = player.donDeck.slice(count);

  const updatedCards: Record<string, Card> = { ...state.cards };
  for (const id of drawn) {
    updatedCards[id] = { ...updatedCards[id]!, zone: 'donArea' as const };
  }

  return {
    ...state,
    cards: updatedCards as Readonly<Record<CardId, Card>>,
    players: {
      ...state.players,
      [playerId]: {
        ...player,
        donDeck: remaining,
        donArea: [...player.donArea, ...drawn],
      },
    },
  };
}

/** Untap leader, all board cards, and all DON in donArea for a player. */
/** Fire a phase trigger (StartOfTurn, EndOfTurn, etc.) for all board cards + leader of a player. */
function firePhaseEffects(state: GameState, trigger: EffectTrigger, playerId: PlayerId): GameState {
  const player = state.players[playerId];
  if (player === undefined) return state;
  let next = state;
  if (player.leader !== null) {
    const leaderCard = next.cards[player.leader];
    if (leaderCard?.effects?.length) {
      next = resolveEffects(leaderCard.effects, trigger, { sourceCardId: player.leader, sourcePlayerId: playerId }, next);
    }
  }
  // Snapshot board IDs — effects may modify the board during resolution
  for (const cardId of [...(state.players[playerId]?.board ?? [])]) {
    const card = next.cards[cardId];
    if (card?.effects?.length) {
      next = resolveEffects(card.effects, trigger, { sourceCardId: cardId, sourcePlayerId: playerId }, next);
    }
  }
  return next;
}

function applyRefresh(state: GameState, playerId: PlayerId): GameState {
  const player = state.players[playerId];
  if (player === undefined) return state;

  const updatedCards: Record<string, Card> = { ...state.cards };

  if (player.leader !== null) {
    updatedCards[player.leader] = { ...updatedCards[player.leader]!, tapped: false };
  }
  for (const id of player.board) {
    updatedCards[id] = { ...updatedCards[id]!, tapped: false };
  }
  for (const id of player.donArea) {
    updatedCards[id] = { ...updatedCards[id]!, tapped: false };
  }

  let next: GameState = { ...state, cards: updatedCards as Readonly<Record<CardId, Card>> };

  // Clear EndOfOpponentTurn modifiers: the opponent's turn just ended, it's now this player's turn
  next = clearOppTurnModifiers(next, playerId);

  // Fire StartOfTurn for the new active player's cards
  next = firePhaseEffects(next, 'StartOfTurn', playerId);

  // Fire StartOfOpponentTurn for the inactive player's cards
  const [p1, p2] = next.playerOrder;
  const inactivePlayerId = playerId === p1 ? p2 : p1;
  next = firePhaseEffects(next, 'StartOfOpponentTurn', inactivePlayerId);

  return next;
}

/** Return all assigned DON to donArea (detach + untap) at end of turn. */
function applyReturnDon(state: GameState, playerId: PlayerId): GameState {
  const player = state.players[playerId];
  if (player === undefined) return state;

  const updatedCards: Record<string, Card> = { ...state.cards };
  for (const id of player.donArea) {
    updatedCards[id] = { ...updatedCards[id]!, attachedTo: null, tapped: false };
  }

  let next: GameState = {
    ...state,
    cards: updatedCards as Readonly<Record<CardId, Card>>,
  };

  // Clear EndOfTurn power modifiers on all board cards + leader
  const boardAndLeader: CardId[] = [...player.board];
  if (player.leader !== null) boardAndLeader.push(player.leader);
  next = clearPowerModifiers(next, boardAndLeader);

  // Clear temporary keywords granted this turn
  next = clearTemporaryKeywords(next);

  return next;
}

// ─── Mulligan ─────────────────────────────────────────────────────────────────

function applyMulligan(
  state: GameState,
  action: Extract<GameAction, { type: 'Mulligan' }>
): ActionResult {
  if (state.phase !== 'Mulligan') {
    return makeGameError('WRONG_PHASE', `Mulligan requires Mulligan phase, current: ${state.phase}`);
  }
  if (action.playerId !== state.activePlayerId) {
    return makeGameError('NOT_ACTIVE_PLAYER', `Player ${action.playerId} is not the active player`);
  }
  if (state.mulliganDecided.includes(action.playerId)) {
    return makeGameError('ALREADY_MULLIGANED', `Player ${action.playerId} has already made their mulligan decision`);
  }

  const player = state.players[action.playerId];
  if (player === undefined) {
    return makeGameError('UNKNOWN_PLAYER', `Player ${action.playerId} not found`);
  }

  const updatedCards: Record<string, Card> = { ...state.cards };
  let updatedPlayer = player;

  if (!action.keep) {
    // Return hand to deck, shuffle, draw 5 new cards
    for (const id of player.hand) {
      updatedCards[id] = { ...updatedCards[id]!, zone: 'deck' };
    }
    const shuffled = shuffle([...player.deck, ...player.hand]);
    const newHand = shuffled.slice(0, 5);
    const newDeck = shuffled.slice(5);
    for (const id of newHand) {
      updatedCards[id] = { ...updatedCards[id]!, zone: 'hand' };
    }
    updatedPlayer = { ...player, hand: newHand, deck: newDeck };
  }

  const newDecided = [...state.mulliganDecided, action.playerId];
  let next: GameState = {
    ...state,
    cards: updatedCards as Readonly<Record<CardId, Card>>,
    players: { ...state.players, [action.playerId]: updatedPlayer },
    mulliganDecided: newDecided,
  };

  const [p1, p2] = state.playerOrder;
  if (newDecided.includes(p1) && newDecided.includes(p2)) {
    // Both players decided — place life cards and start the game
    next = placeLifeCards(next, p1);
    next = placeLifeCards(next, p2);
    // turnNumber 0 = Mulligan; real game starts at turn 1
    next = { ...next, phase: 'Refresh', activePlayerId: state.firstPlayerId, turnNumber: 1 };
    return applyRefresh(next, state.firstPlayerId);
  } else {
    // Pass decision to the other player
    const nextPlayerId = action.playerId === p1 ? p2 : p1;
    return { ...next, activePlayerId: nextPlayerId };
  }
}

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

  // Main deck — shuffled so each game starts with a different hand
  const deckOrdered = shuffle(setup.deckCards.map((c): Card => ({
    ...c,
    zone: 'deck',
    ownerId: setup.id,
    tapped: false,
    attachedTo: null,
  })));
  for (const c of deckOrdered) {
    allCards[c.id] = c;
  }

  // Top 5 → starting hand
  const handIds = deckOrdered.slice(0, 5).map((c) => c.id);
  for (const id of handIds) {
    allCards[id] = { ...allCards[id]!, zone: 'hand' };
  }

  // Rest stays in deck (life will be placed after mulligan decisions)
  const remainingDeckIds = deckOrdered.slice(5).map((c) => c.id);

  return {
    id: setup.id,
    leader: leader.id,
    life: [],
    deck: remainingDeckIds,
    hand: handIds,
    board: [],
    donDeck: donIds,
    donArea: [],
    trash: [],
  };
}

function validatePlayerSetup(setup: PlayerSetup, label: string): GameError | null {
  if (setup.leaderCard.type !== 'Leader') {
    return makeGameError('INVALID_DECK', `${label}: leader card must be of type Leader`);
  }
  if (setup.deckCards.length !== 50) {
    return makeGameError('INVALID_DECK', `${label}: deck must have exactly 50 cards (got ${setup.deckCards.length})`);
  }
  if (setup.donCards.length !== 10) {
    return makeGameError('INVALID_DECK', `${label}: DON deck must have exactly 10 cards (got ${setup.donCards.length})`);
  }

  // Max 4 copies of any card (by name)
  const counts = new Map<string, number>();
  for (const card of setup.deckCards) {
    const n = (counts.get(card.name) ?? 0) + 1;
    if (n > 4) {
      return makeGameError('INVALID_DECK', `${label}: more than 4 copies of "${card.name}"`);
    }
    counts.set(card.name, n);
  }

  // Color compatibility: each deck card must share at least one color with the leader
  // Colors can be space-separated ("Blue Purple") or slash-separated ("Blue/Purple")
  const splitColors = (c: string): string[] => c.split(/[\s/]+/).map((x) => x.trim()).filter(Boolean);
  const leaderColors = new Set(splitColors(setup.leaderCard.color));
  for (const card of setup.deckCards) {
    const cardColors = splitColors(card.color);
    if (!cardColors.some((c) => leaderColors.has(c))) {
      return makeGameError(
        'INVALID_DECK',
        `${label}: card "${card.name}" (${card.color}) is incompatible with leader color (${setup.leaderCard.color})`,
      );
    }
  }

  return null;
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

  const p1Error = validatePlayerSetup(player1, 'Player 1');
  if (p1Error !== null) return p1Error;
  const p2Error = validatePlayerSetup(player2, 'Player 2');
  if (p2Error !== null) return p2Error;

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
    phase: 'Mulligan',
    turnNumber: 0,  // Mulligan is turn 0; turnNumber becomes 1 when the game actually starts
    activeCombat: null,
    winner: null,
    firstPlayerId,
    mulliganDecided: [],
    newBoardIds: [],
    activatedAbilityIds: [],
    pendingOnKOInteraction: null,
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

  // First player's first turn: skip draw, go directly to DON phase
  if (state.turnNumber === 1 && state.firstPlayerId === action.playerId) {
    return applyDonDraw({ ...state, phase: 'DON' }, action.playerId);
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

  const afterDraw: GameState = {
    ...state,
    phase: 'DON',
    cards: { ...state.cards, [drawnCardId]: updatedCard },
    players: { ...state.players, [action.playerId]: updatedPlayer },
  };
  return applyDonDraw(afterDraw, action.playerId);
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

  const afterPlay: GameState = {
    ...state,
    cards: updatedCards as Readonly<Record<CardId, Card>>,
    players: { ...state.players, [action.playerId]: updatedPlayer },
    newBoardIds: [...state.newBoardIds, action.cardId],
  };

  // Trigger OnPlay effects
  if (card.effects?.length) {
    return resolveEffects(
      card.effects,
      'OnPlay',
      {
        sourceCardId: action.cardId,
        sourcePlayerId: action.playerId,
        ...(action.chosenTargetId !== undefined ? { chosenTargetId: action.chosenTargetId } : {}),
      },
      afterPlay,
    );
  }
  return afterPlay;
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
    // Return all assigned DON for the current player
    let next = applyReturnDon(state, state.activePlayerId);

    // Switch active player, reset to Refresh, increment turn counter
    const currentIndex = next.playerOrder.indexOf(next.activePlayerId);
    const nextIndex = currentIndex === 0 ? 1 : 0;
    const nextPlayerId = next.playerOrder[nextIndex]!;

    next = {
      ...next,
      activePlayerId: nextPlayerId,
      phase: 'Refresh',
      turnNumber: next.turnNumber + 1,
      newBoardIds: [],
      activatedAbilityIds: [],
    };

    // Untap the new active player's cards + fire StartOfTurn / StartOfOpponentTurn
    return applyRefresh(next, nextPlayerId);
  }

  const currentIndex = PHASE_SEQUENCE.indexOf(state.phase);
  const nextPhase = PHASE_SEQUENCE[currentIndex + 1]!;
  let next: GameState = { ...state, phase: nextPhase };

  // Entering DON phase via EndPhase (player skipped DrawPhase)
  if (nextPhase === 'DON') {
    next = applyDonDraw(next, state.activePlayerId);
  }

  // Entering End phase → fire EndOfTurn effects
  if (nextPhase === 'End') {
    next = firePhaseEffects(next, 'EndOfTurn', state.activePlayerId);
  }

  // Entering Main phase → fire StartOfMainPhase effects
  if (nextPhase === 'Main') {
    next = firePhaseEffects(next, 'StartOfMainPhase', state.activePlayerId);
  }

  return next;
}

// ─── DeclareAttack ────────────────────────────────────────────────────────────

function applyDeclareAttack(
  state: GameState,
  action: Extract<GameAction, { type: 'DeclareAttack' }>
): ActionResult {
  if (action.playerId !== state.activePlayerId) {
    return makeGameError('NOT_ACTIVE_PLAYER', `Player ${action.playerId} is not the active player`);
  }
  if (state.phase !== 'Main') {
    return makeGameError('WRONG_PHASE', `DeclareAttack requires Main phase, current: ${state.phase}`);
  }
  if (state.activeCombat !== null) {
    return makeGameError('COMBAT_ALREADY_ACTIVE', 'Another combat is already pending resolution');
  }
  if (state.turnNumber <= 2) {
    return makeGameError('NO_ATTACK_FIRST_TURN', 'No attacks allowed on the first turn');
  }
  if (state.winner !== null) {
    return makeGameError('GAME_OVER', 'The game has already ended');
  }

  const player = state.players[action.playerId];
  if (player === undefined) {
    return makeGameError('UNKNOWN_PLAYER', `Player ${action.playerId} not found`);
  }

  const attacker = state.cards[action.attackerId];
  if (attacker === undefined) {
    return makeGameError('UNKNOWN_CARD', `Attacker ${action.attackerId} not found`);
  }
  if (attacker.tapped) {
    return makeGameError('ATTACKER_TAPPED', `Card ${action.attackerId} is rested and cannot attack`);
  }

  const isNewCard = state.newBoardIds.includes(action.attackerId);
  const hasRush   = hasKeyword(attacker, 'Rush');
  if (isNewCard && !hasRush) {
    return makeGameError('SUMMON_SICKNESS', `Card ${action.attackerId} was played this turn and cannot attack without Rush`);
  }

  // Attacker must be on the active player's board or be their leader
  const onBoard  = player.board.includes(action.attackerId);
  const isLeader = player.leader === action.attackerId;
  if (!onBoard && !isLeader) {
    return makeGameError('INVALID_ATTACKER', `Card ${action.attackerId} is not on ${action.playerId}'s board or leader zone`);
  }
  if (!isLeader && attacker.type !== 'Character') {
    return makeGameError('INVALID_ATTACKER', `Card ${action.attackerId} is of type ${attacker.type} and cannot attack`);
  }

  // Target must be on the opponent's board or be their leader
  const [p1, p2] = state.playerOrder;
  const opponentId = action.playerId === p1 ? p2 : p1;
  const opponent = state.players[opponentId];
  if (opponent === undefined) {
    return makeGameError('UNKNOWN_PLAYER', `Opponent not found`);
  }

  const target = state.cards[action.targetId];
  if (target === undefined) {
    return makeGameError('UNKNOWN_CARD', `Target ${action.targetId} not found`);
  }

  const targetOnBoard  = opponent.board.includes(action.targetId);
  const targetIsLeader = opponent.leader === action.targetId;
  if (!targetOnBoard && !targetIsLeader) {
    return makeGameError('INVALID_TARGET', `Card ${action.targetId} is not a valid target on opponent's side`);
  }

  // Characters can only be attacked when rested; the leader can always be targeted
  if (targetOnBoard && !targetIsLeader && target.tapped === false) {
    return makeGameError('TARGET_NOT_RESTED', `Card ${action.targetId} must be rested to be attacked`);
  }

  // Tap (rest) the attacker
  const afterAttack: GameState = {
    ...state,
    cards: {
      ...state.cards,
      [action.attackerId]: { ...attacker, tapped: true },
    },
    activeCombat: {
      attackerId:   action.attackerId,
      targetId:     action.targetId,
      blockerId:    null,
      counterPower: 0,
    },
  };

  // Trigger OnAttack effects
  if (attacker.effects?.length) {
    return resolveEffects(
      attacker.effects,
      'OnAttack',
      { sourceCardId: action.attackerId, sourcePlayerId: action.playerId },
      afterAttack,
    );
  }
  return afterAttack;
}

// ─── DeclareBlock ─────────────────────────────────────────────────────────────

function applyDeclareBlock(
  state: GameState,
  action: Extract<GameAction, { type: 'DeclareBlock' }>
): ActionResult {
  if (state.activeCombat === null) {
    return makeGameError('NO_ACTIVE_COMBAT', 'No attack has been declared yet');
  }
  if (state.activeCombat.blockerId !== null) {
    return makeGameError('BLOCKER_ALREADY_SET', 'A blocker has already been assigned');
  }
  if (action.playerId === state.activePlayerId) {
    return makeGameError('ACTIVE_PLAYER_CANNOT_BLOCK', 'Only the defending player can assign a blocker');
  }
  if (state.winner !== null) {
    return makeGameError('GAME_OVER', 'The game has already ended');
  }

  const player = state.players[action.playerId];
  if (player === undefined) {
    return makeGameError('UNKNOWN_PLAYER', `Player ${action.playerId} not found`);
  }

  const blocker = state.cards[action.blockerId];
  if (blocker === undefined) {
    return makeGameError('UNKNOWN_CARD', `Blocker ${action.blockerId} not found`);
  }
  if (!player.board.includes(action.blockerId)) {
    return makeGameError('INVALID_BLOCKER', `Card ${action.blockerId} is not on ${action.playerId}'s board`);
  }
  if (blocker.tapped) {
    return makeGameError('BLOCKER_TAPPED', `Card ${action.blockerId} is rested and cannot block`);
  }

  // Unblockable check: reject block if the attacker has Unblockable keyword
  const attackerCard = state.cards[state.activeCombat.attackerId];
  if (attackerCard !== undefined && hasKeyword(attackerCard, 'Unblockable')) {
    return makeGameError('UNBLOCKABLE', 'The attacker has the Unblockable keyword and cannot be blocked');
  }

  if (!hasKeyword(blocker, 'Blocker')) {
    return makeGameError('NO_BLOCKER_KEYWORD', `Card ${action.blockerId} does not have the Blocker keyword`);
  }

  // Tap the blocker
  const afterBlock: GameState = {
    ...state,
    cards: {
      ...state.cards,
      [action.blockerId]: { ...blocker, tapped: true },
    },
    activeCombat: { ...state.activeCombat, blockerId: action.blockerId },
  };

  // Trigger OnBlock effects
  if (blocker.effects?.length) {
    return resolveEffects(
      blocker.effects,
      'OnBlock',
      { sourceCardId: action.blockerId, sourcePlayerId: action.playerId },
      afterBlock,
    );
  }
  return afterBlock;
}

// ─── PlayEvent ────────────────────────────────────────────────────────────────

function applyPlayEvent(
  state: GameState,
  action: Extract<GameAction, { type: 'PlayEvent' }>
): ActionResult {
  if (action.playerId !== state.activePlayerId) {
    return makeGameError('NOT_ACTIVE_PLAYER', `Player ${action.playerId} is not the active player`);
  }
  if (state.phase !== 'Main') {
    return makeGameError('WRONG_PHASE', `PlayEvent requires Main phase, current: ${state.phase}`);
  }

  const player = state.players[action.playerId];
  if (player === undefined) {
    return makeGameError('UNKNOWN_PLAYER', `Player ${action.playerId} not found`);
  }

  const card = state.cards[action.cardId];
  if (card === undefined) {
    return makeGameError('UNKNOWN_CARD', `Card ${action.cardId} not found`);
  }
  if (card.type !== 'Event') {
    return makeGameError('INVALID_CARD_TYPE', `Card ${action.cardId} is not an Event (got ${card.type})`);
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

  // Event goes directly to trash
  updatedCards[action.cardId] = { ...card, zone: 'trash' };

  const updatedPlayer: PlayerState = {
    ...player,
    hand:  player.hand.filter((id) => id !== action.cardId),
    trash: [...player.trash, action.cardId],
  };

  const afterPlay: GameState = {
    ...state,
    cards: updatedCards as Readonly<Record<CardId, Card>>,
    players: { ...state.players, [action.playerId]: updatedPlayer },
  };

  // Trigger OnPlay effects
  if (card.effects?.length) {
    return resolveEffects(
      card.effects,
      'OnPlay',
      {
        sourceCardId: action.cardId,
        sourcePlayerId: action.playerId,
        ...(action.chosenTargetId !== undefined ? { chosenTargetId: action.chosenTargetId } : {}),
      },
      afterPlay,
    );
  }
  return afterPlay;
}

// ─── ActivatedAbility ─────────────────────────────────────────────────────────

function applyActivatedAbility(
  state: GameState,
  action: Extract<GameAction, { type: 'ActivatedAbility' }>
): ActionResult {
  if (action.playerId !== state.activePlayerId) {
    return makeGameError('NOT_ACTIVE_PLAYER', `Player ${action.playerId} is not the active player`);
  }
  if (state.phase !== 'Main') {
    return makeGameError('WRONG_PHASE', `ActivatedAbility requires Main phase, current: ${state.phase}`);
  }

  const player = state.players[action.playerId];
  if (player === undefined) {
    return makeGameError('UNKNOWN_PLAYER', `Player ${action.playerId} not found`);
  }

  const card = state.cards[action.cardId];
  if (card === undefined) {
    return makeGameError('UNKNOWN_CARD', `Card ${action.cardId} not found`);
  }

  const isOnBoard = player.board.includes(action.cardId) || player.leader === action.cardId;
  if (!isOnBoard) {
    return makeGameError('CARD_NOT_ON_BOARD', `Card ${action.cardId} is not on the board or leader`);
  }

  const hasActivated = card.effects?.some((e) => e.trigger === 'Activated');
  if (!hasActivated) {
    return makeGameError('NO_ACTIVATED_EFFECT', `Card ${action.cardId} has no Activated effects`);
  }

  // Once-per-turn enforcement
  if (state.activatedAbilityIds.includes(action.cardId)) {
    return makeGameError('ALREADY_ACTIVATED', `Card ${action.cardId} has already used its Activated ability this turn`);
  }

  const result = resolveEffects(
    card.effects!,
    'Activated',
    {
      sourceCardId: action.cardId,
      sourcePlayerId: action.playerId,
      ...(action.chosenTargetId !== undefined ? { chosenTargetId: action.chosenTargetId } : {}),
    },
    state,
  );

  if (result === state) {
    return makeGameError('CONDITION_NOT_MET', `Activation conditions not met for card ${action.cardId}`);
  }

  return {
    ...result,
    activatedAbilityIds: [...result.activatedAbilityIds, action.cardId],
  };
}

// ─── PlayCounter ──────────────────────────────────────────────────────────────

function applyPlayCounter(
  state: GameState,
  action: Extract<GameAction, { type: 'PlayCounter' }>
): ActionResult {
  if (state.activeCombat === null) {
    return makeGameError('NO_ACTIVE_COMBAT', 'No attack has been declared yet');
  }
  if (state.phase !== 'Main') {
    return makeGameError('WRONG_PHASE', `PlayCounter requires Main phase, current: ${state.phase}`);
  }
  if (action.playerId === state.activePlayerId) {
    return makeGameError('ACTIVE_PLAYER_CANNOT_COUNTER', 'Only the defending player can play counters');
  }

  const player = state.players[action.playerId];
  if (player === undefined) {
    return makeGameError('UNKNOWN_PLAYER', `Player ${action.playerId} not found`);
  }
  if (!player.hand.includes(action.cardId)) {
    return makeGameError('CARD_NOT_IN_HAND', `Card ${action.cardId} is not in ${action.playerId}'s hand`);
  }

  const card = state.cards[action.cardId];
  if (card === undefined) {
    return makeGameError('UNKNOWN_CARD', `Card ${action.cardId} not found`);
  }
  if ((card.counter ?? 0) === 0) {
    return makeGameError('NO_COUNTER_VALUE', `Card ${action.cardId} has no counter value`);
  }

  const counterValue = card.counter!;
  const updatedCards: Record<string, Card> = {
    ...state.cards,
    [action.cardId]: { ...card, zone: 'trash' as const },
  };
  const updatedPlayer = {
    ...player,
    hand:  player.hand.filter((id) => id !== action.cardId),
    trash: [...player.trash, action.cardId],
  };

  return {
    ...state,
    cards: updatedCards as Readonly<Record<CardId, Card>>,
    players: { ...state.players, [action.playerId]: updatedPlayer },
    activeCombat: {
      ...state.activeCombat,
      counterPower: state.activeCombat.counterPower + counterValue,
    },
  };
}

// ─── ResolveCombat ────────────────────────────────────────────────────────────

function applyResolveCombat(
  state: GameState,
  action: Extract<GameAction, { type: 'ResolveCombat' }>
): ActionResult {
  if (action.playerId !== state.activePlayerId) {
    return makeGameError('NOT_ACTIVE_PLAYER', `Player ${action.playerId} is not the active player`);
  }
  if (state.activeCombat === null) {
    return makeGameError('NO_ACTIVE_COMBAT', 'No attack has been declared yet');
  }
  if (state.winner !== null) {
    return makeGameError('GAME_OVER', 'The game has already ended');
  }

  return resolveCombat(state);
}

// ─── ResolveOnKOInteraction ───────────────────────────────────────────────────

function applyResolveOnKOInteraction(
  state: GameState,
  action: Extract<GameAction, { type: 'ResolveOnKOInteraction' }>,
): ActionResult {
  const pending = state.pendingOnKOInteraction;
  if (pending === null) {
    return makeGameError('NO_PENDING_INTERACTION', 'No pending OnKO interaction to resolve');
  }
  if (pending.playerId !== action.playerId) {
    return makeGameError('WRONG_PLAYER', `Player ${action.playerId} cannot resolve another player's OnKO effect`);
  }

  // Clearing the pending interaction (skip case — no valid cards or player skips)
  if (action.cardId === null) {
    return { ...state, pendingOnKOInteraction: null };
  }

  const card = state.cards[action.cardId];
  if (card === undefined) {
    return makeGameError('UNKNOWN_CARD', `Card ${action.cardId} not found`);
  }

  const player = state.players[action.playerId];
  if (player === undefined) {
    return makeGameError('UNKNOWN_PLAYER', `Player ${action.playerId} not found`);
  }

  if (!player.hand.includes(action.cardId)) {
    return makeGameError('CARD_NOT_IN_HAND', `Card ${action.cardId} is not in hand`);
  }

  // Validate against filter
  const f = pending.filter;
  if (f.color !== undefined && card.color !== f.color) {
    return makeGameError('INVALID_CHOICE', `Card color ${card.color} does not match required ${f.color}`);
  }
  if (f.cardType !== undefined && card.type !== f.cardType) {
    return makeGameError('INVALID_CHOICE', `Card type ${card.type} does not match required ${f.cardType}`);
  }
  if (f.maxPower !== undefined && card.power > f.maxPower) {
    return makeGameError('INVALID_CHOICE', `Card power ${card.power} exceeds max ${f.maxPower}`);
  }
  if (f.excludeSelf === true && action.cardId === pending.sourceCardId) {
    return makeGameError('INVALID_CHOICE', 'Cannot choose the card that triggered the OnKO effect');
  }

  // Play the chosen card for free (remove from hand, add to board)
  const updatedPlayer: PlayerState = {
    ...player,
    hand: player.hand.filter((id) => id !== action.cardId),
    board: [...player.board, action.cardId],
  };
  let next: GameState = {
    ...state,
    pendingOnKOInteraction: null,
    cards: {
      ...state.cards,
      [action.cardId]: { ...card, zone: 'board' as const, tapped: false },
    },
    players: { ...state.players, [action.playerId]: updatedPlayer },
  };

  // Trigger OnPlay effects of the played card
  if (card.effects?.length) {
    next = resolveEffects(
      card.effects,
      'OnPlay',
      { sourceCardId: action.cardId, sourcePlayerId: action.playerId },
      next,
    );
  }

  return next;
}

// ─── applyAction (dispatcher) ─────────────────────────────────────────────────

export function applyAction(state: GameState, action: GameAction): ActionResult {
  switch (action.type) {
    case 'Mulligan':
      return applyMulligan(state, action);
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
    case 'DeclareAttack':
      return applyDeclareAttack(state, action);
    case 'DeclareBlock':
      return applyDeclareBlock(state, action);
    case 'ResolveCombat':
      return applyResolveCombat(state, action);
    case 'PlayCounter':
      return applyPlayCounter(state, action);
    case 'PlayEvent':
      return applyPlayEvent(state, action);
    case 'ActivatedAbility':
      return applyActivatedAbility(state, action);
    case 'ResolveOnKOInteraction':
      return applyResolveOnKOInteraction(state, action);
    default: {
      const _exhaustive: never = action;
      return makeGameError('UNKNOWN_ACTION', `Unknown action type: ${JSON.stringify(_exhaustive)}`);
    }
  }
}
