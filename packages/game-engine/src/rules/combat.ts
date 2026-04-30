import type { CardId, GameState, PlayerId } from '../types/index.js';
import { calculatePower, sendToTrash, sendToRemoved, clearPowerModifiers, hasKeyword } from './cardUtils.js';
import { resolveEffects } from '../effects/effectResolver.js';

// Re-export for public API backwards compatibility
export { calculatePower, sendToTrash, sendToRemoved } from './cardUtils.js';

// ─── Leader damage ────────────────────────────────────────────────────────────

/**
 * Apply one damage to the defending leader:
 * - If life is already empty → set winner to the attacking player.
 * - Otherwise reveal the top life card (move to defending player's hand).
 * - If the revealed life card has a Trigger effect, resolve it immediately.
 */
export function applyLeaderDamage(
  state: GameState,
  attackingPlayerId: PlayerId,
): GameState {
  const [p1, p2] = state.playerOrder;
  const defendingPlayerId = attackingPlayerId === p1 ? p2 : p1;
  const defender = state.players[defendingPlayerId];
  if (defender === undefined) return state;

  if (defender.life.length === 0) {
    return { ...state, winner: attackingPlayerId };
  }

  // Reveal top life card → goes to hand
  const [revealedId, ...remainingLife] = defender.life as [CardId, ...CardId[]];
  const revealedCard = state.cards[revealedId]; // read BEFORE state spread
  if (revealedCard === undefined) return state;

  const updatedCards = {
    ...state.cards,
    [revealedId]: { ...revealedCard, zone: 'hand' as const },
  };

  const updatedDefender = {
    ...defender,
    life: remainingLife,
    hand: [...defender.hand, revealedId],
  };

  let result: GameState = {
    ...state,
    cards: updatedCards as Readonly<typeof state.cards>,
    players: { ...state.players, [defendingPlayerId]: updatedDefender },
  };

  // Trigger effect on the revealed life card
  if (revealedCard.effects?.length) {
    result = resolveEffects(
      revealedCard.effects,
      'Trigger',
      { sourceCardId: revealedId, sourcePlayerId: defendingPlayerId },
      result,
    );
  }

  return result;
}

// ─── Combat resolution ────────────────────────────────────────────────────────

/**
 * Resolve the pending combat in `state.activeCombat`.
 * Returns a new GameState with activeCombat cleared and all outcomes applied.
 * Power modifiers (EndOfBattle) on the attacker are cleared after resolution.
 */
export function resolveCombat(state: GameState): GameState {
  const combat = state.activeCombat;
  if (combat === null) return state;

  const { attackerId, targetId, blockerId, counterPower } = combat;
  let next: GameState = { ...state, activeCombat: null };

  const attackerPower = calculatePower(attackerId, state);
  const attacker = state.cards[attackerId]; // read BEFORE any trash call
  const attackerBanishes = attacker !== undefined && hasKeyword(attacker, 'Banish');

  /** Send `cardId` to trash or removed-from-game depending on Banish, then fire OnKO + OnLeaveField. */
  function koCard(s: GameState, cardId: CardId, card: typeof attacker): GameState {
    let r = attackerBanishes ? sendToRemoved(s, cardId) : sendToTrash(s, cardId);
    if (card?.effects?.length) {
      r = resolveEffects(card.effects, 'OnKO', { sourceCardId: cardId, sourcePlayerId: card.ownerId }, r);
      r = resolveEffects(card.effects, 'OnLeaveField', { sourceCardId: cardId, sourcePlayerId: card.ownerId }, r);
    }
    return r;
  }

  if (blockerId !== null) {
    // ── Blocked combat ───────────────────────────────────────────────────────
    // Counter applies to the original target, not the blocker
    const blockerPower = calculatePower(blockerId, state);
    const blockerCard = state.cards[blockerId]; // read BEFORE trash

    if (attackerPower >= blockerPower) {
      next = koCard(next, blockerId, blockerCard);
    } else {
      next = koCard(next, attackerId, attacker);
    }
  } else {
    // ── Unblocked attack ─────────────────────────────────────────────────────
    const target = state.cards[targetId];
    if (target === undefined) return next;

    const defenderPower = calculatePower(targetId, state) + counterPower;

    if (attackerPower >= defenderPower) {
      if (target.type === 'Leader') {
        if (attacker !== undefined) {
          next = applyLeaderDamage(next, attacker.ownerId);
          // DoubleAttack: second leader damage if still alive
          if (hasKeyword(attacker, 'DoubleAttack') && next.winner === null) {
            next = applyLeaderDamage(next, attacker.ownerId);
          }
        }
      } else {
        // Unblocked attack on a Character → KO if attacker power >= defender power
        const targetCard = state.cards[targetId]; // read BEFORE trash
        next = koCard(next, targetId, targetCard);
      }
    }
    // attacker power < defender power + counter → attack repelled
  }

  // Clear EndOfBattle power modifiers on the attacker (if it survived)
  next = clearPowerModifiers(next, [attackerId]);

  return next;
}
