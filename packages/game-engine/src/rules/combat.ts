import type { Card, CardId, GameState, PlayerState } from '../types/index.js';

// ─── Power calculation ────────────────────────────────────────────────────────

/**
 * Total power of a card = base power + 1 000 per DON!! attached to it.
 */
export function calculatePower(cardId: CardId, state: GameState): number {
  const card = state.cards[cardId];
  if (card === undefined) return 0;

  const donAttached = Object.values(state.cards).filter(
    (c) => c.type === 'DON' && c.attachedTo === cardId,
  ).length;

  return card.power + donAttached * 1000;
}

// ─── KO helper ────────────────────────────────────────────────────────────────

/**
 * Move a card to its owner's trash.
 * Any DON attached to it are detached and returned to donArea (untapped).
 */
export function sendToTrash(state: GameState, cardId: CardId): GameState {
  const card = state.cards[cardId];
  if (card === undefined) return state;

  const owner = state.players[card.ownerId];
  if (owner === undefined) return state;

  const updatedCards: Record<string, Card> = { ...state.cards };

  // Detach DON attached to the KO'd card
  for (const [id, c] of Object.entries(state.cards)) {
    if (c.type === 'DON' && c.attachedTo === cardId) {
      updatedCards[id] = { ...c, attachedTo: null, tapped: false };
    }
  }

  // Move card to trash
  updatedCards[cardId] = { ...card, zone: 'trash' };

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

// ─── Leader damage ────────────────────────────────────────────────────────────

/**
 * Apply one damage to the defending leader:
 * - If life is already empty → set winner to the attacking player.
 * - Otherwise reveal the top life card (move to defending player's hand).
 */
export function applyLeaderDamage(
  state: GameState,
  attackingPlayerId: import('../types/index.js').PlayerId,
): GameState {
  const [p1, p2] = state.playerOrder;
  const defendingPlayerId = attackingPlayerId === p1 ? p2 : p1;
  const defender = state.players[defendingPlayerId];
  if (defender === undefined) return state;

  if (defender.life.length === 0) {
    return { ...state, winner: attackingPlayerId };
  }

  // Reveal top life card → goes to hand (trigger detection handled later)
  const [revealedId, ...remainingLife] = defender.life as [CardId, ...CardId[]];
  const revealedCard = state.cards[revealedId];
  if (revealedCard === undefined) return state;

  const updatedCards: Record<string, Card> = {
    ...state.cards,
    [revealedId]: { ...revealedCard, zone: 'hand' },
  };

  const updatedDefender: PlayerState = {
    ...defender,
    life: remainingLife,
    hand: [...defender.hand, revealedId],
  };

  return {
    ...state,
    cards: updatedCards as Readonly<Record<CardId, Card>>,
    players: { ...state.players, [defendingPlayerId]: updatedDefender },
  };
}

// ─── Combat resolution ────────────────────────────────────────────────────────

/**
 * Resolve the pending combat in `state.activeCombat`.
 * Returns a new GameState with activeCombat cleared and all outcomes applied.
 */
export function resolveCombat(state: GameState): GameState {
  const combat = state.activeCombat;
  if (combat === null) return state;

  const { attackerId, targetId, blockerId } = combat;
  let next: GameState = { ...state, activeCombat: null };

  if (blockerId !== null) {
    // ── Blocked combat: compare attacker vs blocker ──────────────────────────
    const attackerPower = calculatePower(attackerId, state);
    const blockerPower  = calculatePower(blockerId, state);

    if (attackerPower >= blockerPower) {
      next = sendToTrash(next, blockerId);   // blocker KO'd
    } else {
      next = sendToTrash(next, attackerId);  // attacker KO'd
    }
  } else {
    // ── Unblocked attack ─────────────────────────────────────────────────────
    const target = state.cards[targetId];
    if (target === undefined) return next;

    if (target.type === 'Leader') {
      const attacker = state.cards[attackerId];
      if (attacker !== undefined) {
        next = applyLeaderDamage(next, attacker.ownerId);
      }
    } else {
      // Character vs Character (unblocked)
      const attackerPower = calculatePower(attackerId, state);
      const targetPower   = calculatePower(targetId, state);
      if (attackerPower > targetPower) {
        next = sendToTrash(next, targetId);  // defender KO'd
      }
      // attacker power ≤ target power → nothing happens
    }
  }

  return next;
}
