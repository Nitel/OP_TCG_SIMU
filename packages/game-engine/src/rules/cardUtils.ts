import type { Card, CardId, CardKeyword, GameState, PlayerState, PlayerId } from '../types/index.js';

// ─── countAttachedDon ────────────────────────────────────────────────────────

/**
 * Counts DON!! cards physically attached to `cardId`, regardless of tapped/untapped state.
 *
 * Official OPTCG rule: [DON!! xN] condition = "this card has at least N DON!! cards attached
 * to it". The tapped/untapped state of the attached DON is irrelevant for this check.
 *
 * Use this for ALL [DON!! xN] condition checks (HasAttachedDon, LeaderHasAttachedDon,
 * HasRestingDon on OnAttack, Rush auto-grant). Do NOT use for: cost payment (active free
 * DON), power calculation (owner's-turn gate), or structural detach operations.
 */
export function countAttachedDon(cards: Readonly<Record<CardId, Card>>, cardId: CardId): number {
  let count = 0;
  for (const c of Object.values(cards)) {
    if (c.type === 'DON' && c.attachedTo === cardId) count++;
  }
  return count;
}

// ─── hasKeyword ───────────────────────────────────────────────────────────────

/**
 * Returns true if `card` has `kw` as a permanent or temporary keyword.
 */
export function hasKeyword(card: Card, kw: CardKeyword): boolean {
  return (card.keywords ?? []).includes(kw) ||
         (card.temporaryKeywords ?? []).includes(kw);
}

// ─── calculatePower ───────────────────────────────────────────────────────────

/**
 * Total power of a card = base power + 1 000 per DON!! attached (owner's turn only) + powerModifier.
 *
 * OPTCG rule: the +1 000 static bonus from attached DON!! only applies during the card owner's turn.
 * DON!! remain physically attached during the opponent's turn and still count for conditional
 * effect checks (HasAttachedDon, DON!! xN), but they do not contribute to combat power.
 */
export function calculatePower(cardId: CardId, state: GameState): number {
  const card = state.cards[cardId];
  if (card === undefined) return 0;

  // +1000 per attached DON only counts during the card owner's own turn
  const isOwnersTurn = state.activePlayerId === card.ownerId;
  const donAttached = isOwnersTurn
    ? Object.values(state.cards).filter((c) => c.type === 'DON' && c.attachedTo === cardId).length
    : 0;

  return card.power + donAttached * 1000 + (card.powerModifier ?? 0) + (card.powerModifierOT ?? 0);
}

// ─── clearPowerModifiers ──────────────────────────────────────────────────────

/**
 * Clear `powerModifier` on a set of card IDs (e.g. at end of battle or turn).
 */
export function clearPowerModifiers(state: GameState, cardIds: readonly CardId[]): GameState {
  const updatedCards: Record<string, Card> = { ...state.cards };
  let changed = false;
  for (const id of cardIds) {
    if (updatedCards[id]?.powerModifier !== undefined) {
      const { powerModifier: _pm, ...rest } = updatedCards[id]!;
      void _pm;
      updatedCards[id] = rest;
      changed = true;
    }
  }
  if (!changed) return state;
  return { ...state, cards: updatedCards as Readonly<Record<CardId, Card>> };
}

// ─── clearOppTurnModifiers ────────────────────────────────────────────────────

/**
 * Clear `powerModifierOT` (EndOfOpponentTurn) from all cards of `playerId`.
 * Called at the start of that player's turn (i.e. after the opponent's turn ended).
 */
export function clearOppTurnModifiers(state: GameState, playerId: PlayerId): GameState {
  const player = state.players[playerId];
  if (player === undefined) return state;

  const ids: CardId[] = [...player.board];
  if (player.leader !== null) ids.push(player.leader);

  const updatedCards: Record<string, Card> = { ...state.cards };
  let changed = false;
  for (const id of ids) {
    if (updatedCards[id]?.powerModifierOT !== undefined) {
      const { powerModifierOT: _ot, ...rest } = updatedCards[id]!;
      void _ot;
      updatedCards[id] = rest;
      changed = true;
    }
  }
  if (!changed) return state;
  return { ...state, cards: updatedCards as Readonly<Record<CardId, Card>> };
}

// ─── clearTemporaryKeywords ───────────────────────────────────────────────────

/**
 * Remove all `temporaryKeywords` from every card in state (called at end of turn).
 */
export function clearTemporaryKeywords(state: GameState): GameState {
  const updatedCards: Record<string, Card> = { ...state.cards };
  let changed = false;
  for (const [id, card] of Object.entries(state.cards)) {
    if (card.temporaryKeywords !== undefined && card.temporaryKeywords.length > 0) {
      const { temporaryKeywords: _tk, ...rest } = card;
      void _tk;
      updatedCards[id] = rest;
      changed = true;
    }
  }
  if (!changed) return state;
  return { ...state, cards: updatedCards as Readonly<Record<CardId, Card>> };
}

// ─── sendToTrash ──────────────────────────────────────────────────────────────

/**
 * Move a card to its owner's trash.
 * Any DON attached to it are detached and returned to donArea as rested (OPTCG rule 7-1-5).
 * Does NOT trigger OnKO effects — callers must do that separately.
 */
export function sendToTrash(state: GameState, cardId: CardId): GameState {
  const card = state.cards[cardId];
  if (card === undefined) return state;

  const owner = state.players[card.ownerId];
  if (owner === undefined) return state;

  const updatedCards: Record<string, Card> = { ...state.cards };

  // Detach DON attached to the KO'd card — returned rested per OPTCG rule 7-1-5
  for (const [id, c] of Object.entries(state.cards)) {
    if (c.type === 'DON' && c.attachedTo === cardId) {
      updatedCards[id] = { ...c, attachedTo: null, tapped: true };
    }
  }

  // Move card to trash, clear power modifier
  const { powerModifier: _trashPm, ...cardNoModifier } = card;
  void _trashPm;
  updatedCards[cardId] = { ...cardNoModifier, zone: 'trash' };

  const updatedOwner: PlayerState = {
    ...owner,
    board: owner.board.filter((id) => id !== cardId),
    trash: [...owner.trash, cardId],
  };

  return {
    ...state,
    cards: updatedCards as Readonly<Record<CardId, Card>>,
    players: { ...state.players, [card.ownerId]: updatedOwner },
  };
}

// ─── sendToRemoved ────────────────────────────────────────────────────────────

/**
 * Remove a card from the game entirely (Banish keyword).
 * Card goes to 'removed' zone — NOT added to trash.
 * Attached DON are detached and returned to donArea (untapped).
 * Does NOT trigger OnKO or OnLeaveField — callers must do that separately.
 */
export function sendToRemoved(state: GameState, cardId: CardId): GameState {
  const card = state.cards[cardId];
  if (card === undefined) return state;

  const owner = state.players[card.ownerId];
  if (owner === undefined) return state;

  const updatedCards: Record<string, Card> = { ...state.cards };

  for (const [id, c] of Object.entries(state.cards)) {
    if (c.type === 'DON' && c.attachedTo === cardId) {
      updatedCards[id] = { ...c, attachedTo: null, tapped: false };
    }
  }

  const { powerModifier: _pm, ...cardNoModifier } = card;
  void _pm;
  updatedCards[cardId] = { ...cardNoModifier, zone: 'removed' };

  const updatedOwner: PlayerState = {
    ...owner,
    board: owner.board.filter((id) => id !== cardId),
  };

  return {
    ...state,
    cards: updatedCards as Readonly<Record<CardId, Card>>,
    players: { ...state.players, [card.ownerId]: updatedOwner },
  };
}

// ─── drawCards ────────────────────────────────────────────────────────────────

/**
 * Draw up to `count` cards from the given player's deck to hand.
 * If deck runs out, draws what remains (no error — callers handle empty deck separately).
 */
export function drawCards(state: GameState, playerId: PlayerId, count: number): GameState {
  const player = state.players[playerId];
  if (player === undefined) return state;

  const actual = Math.min(count, player.deck.length);
  if (actual === 0) return state;

  const drawn = player.deck.slice(0, actual);
  const remaining = player.deck.slice(actual);

  const updatedCards: Record<string, Card> = { ...state.cards };
  for (const id of drawn) {
    updatedCards[id] = { ...updatedCards[id]!, zone: 'hand' as const };
  }

  return {
    ...state,
    cards: updatedCards as Readonly<Record<CardId, Card>>,
    players: {
      ...state.players,
      [playerId]: {
        ...player,
        deck: remaining,
        hand: [...player.hand, ...drawn],
      },
    },
  };
}

// ─── returnToHand ─────────────────────────────────────────────────────────────

/**
 * Return a card to its owner's hand from any zone (board, trash, life).
 * Detaches any DON attached to it. Clears power modifier.
 */
export function returnToHand(state: GameState, cardId: CardId): GameState {
  const card = state.cards[cardId];
  if (card === undefined || card.zone === 'hand') return state;

  const owner = state.players[card.ownerId];
  if (owner === undefined) return state;

  const updatedCards: Record<string, Card> = { ...state.cards };

  // Detach DON
  for (const [id, c] of Object.entries(state.cards)) {
    if (c.type === 'DON' && c.attachedTo === cardId) {
      updatedCards[id] = { ...c, attachedTo: null, tapped: false };
    }
  }

  const { powerModifier: _pm, ...cardWithoutModifier } = card;
  void _pm;
  updatedCards[cardId] = { ...cardWithoutModifier, zone: 'hand', tapped: false };

  const updatedOwner: PlayerState = {
    ...owner,
    board: owner.board.filter((id) => id !== cardId),
    trash: owner.trash.filter((id) => id !== cardId),
    life:  owner.life.filter((id) => id !== cardId),
    hand: [...owner.hand, cardId],
  };

  return {
    ...state,
    cards: updatedCards as Readonly<Record<CardId, Card>>,
    players: { ...state.players, [card.ownerId]: updatedOwner },
  };
}
