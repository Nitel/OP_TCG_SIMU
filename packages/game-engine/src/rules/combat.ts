import type { CardId, GameState, PlayerId } from '../types/index.js';
import { calculatePower, sendToTrash, sendToRemoved, clearPowerModifiers, clearBattlePowerModifiers, hasKeyword } from './cardUtils.js';
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

  const dmgSeq = state.gameLog.length;
  let result: GameState = {
    ...state,
    cards: updatedCards as Readonly<typeof state.cards>,
    players: { ...state.players, [defendingPlayerId]: updatedDefender },
    gameLog: [...state.gameLog, {
      seq: dmgSeq,
      event: 'DAMAGE_DEALT' as const,
      message: `[${defendingPlayerId}] took damage — life card "${revealedCard.name}" sent to hand (${remainingLife.length} life remaining)`,
      cardId: revealedId,
      cardName: revealedCard.name,
      playerId: defendingPlayerId,
      turn: state.turnNumber,
      details: { remainingLife: remainingLife.length },
    }],
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
  const attackerBanishes = attacker !== undefined && hasKeyword(attacker, 'Banish', state);

  /** Send `cardId` to trash or removed-from-game depending on Banish, then fire OnKO + OnLeaveField. */
  function koCard(s: GameState, cardId: CardId, card: typeof attacker): GameState {
    const koSeq = s.gameLog.length;
    let r: GameState = {
      ...(attackerBanishes ? sendToRemoved(s, cardId) : sendToTrash(s, cardId)),
      gameLog: [...s.gameLog, {
        seq: koSeq,
        event: 'KO' as const,
        cause: 'battle' as const,
        message: `"${card?.name ?? cardId}" (${cardId}) KO'd [battle] — owner: [${card?.ownerId ?? '?'}]`,
        cardId,
        cardName: card?.name,
        playerId: card?.ownerId,
      }],
    };
    if (card?.effects?.length) {
      const hasOnKO = card.effects.some((e) => e.trigger === 'OnKO');
      if (hasOnKO) {
        const triggerSeq = r.gameLog.length;
        r = {
          ...r,
          gameLog: [...r.gameLog, {
            seq: triggerSeq,
            event: 'ON_KO_TRIGGER' as const,
            cause: 'battle' as const,
            message: `OnKO trigger for "${card.name}" (${cardId}) [battle]`,
            cardId,
            cardName: card.name,
            playerId: card.ownerId,
          }],
        };
      }
      r = resolveEffects(card.effects, 'OnKO', { sourceCardId: cardId, sourcePlayerId: card.ownerId }, r);
      r = resolveEffects(card.effects, 'OnLeaveField', { sourceCardId: cardId, sourcePlayerId: card.ownerId }, r);
    }
    return r;
  }

  if (blockerId !== null) {
    // ── Blocked combat ───────────────────────────────────────────────────────
    // Counter applies to the original target, not the blocker.
    // In OP TCG only the blocker can be KO'd; the attacker is never KO'd by blocking.
    const blockerPower = calculatePower(blockerId, state);
    const blockerCard = state.cards[blockerId]; // read BEFORE trash

    if (attackerPower >= blockerPower && !hasKeyword(blockerCard!, 'CannotBeKOdInBattle', state)) {
      next = koCard(next, blockerId, blockerCard);
    }
    // else: attack repelled, blocker survives, attacker is unharmed
  } else {
    // ── Unblocked attack ─────────────────────────────────────────────────────
    const target = state.cards[targetId];
    if (target === undefined) return next;

    const defenderPower = calculatePower(targetId, state) + counterPower;

    if (attackerPower >= defenderPower) {
      if (target.type === 'Leader') {
        if (attacker !== undefined) {
          next = applyLeaderDamage(next, attacker.ownerId);
          // DoubleAttack: second damage only if defender still has life cards.
          // Q&A: "If my opponent has 1 Life card, can I win using Double Attack? No."
          // A player wins only when damage is applied to an already-empty life pile.
          if (hasKeyword(attacker, 'DoubleAttack', state) && next.winner === null) {
            const [p1Id, p2Id] = next.playerOrder;
            const defenderId = attacker.ownerId === p1Id ? p2Id : p1Id;
            if ((next.players[defenderId]?.life.length ?? 0) > 0) {
              next = applyLeaderDamage(next, attacker.ownerId);
            }
          }
        }
      } else {
        // Unblocked attack on a Character → KO if attacker power >= defender power
        const targetCard = state.cards[targetId]; // read BEFORE trash
        if (!hasKeyword(targetCard!, 'CannotBeKOdInBattle', state)) {
          next = koCard(next, targetId, targetCard);
        }
      }
    }
    // attacker power < defender power + counter → attack repelled
  }

  // Clear EndOfBattle power modifiers on ALL cards (attacker + any counter-buffed cards)
  next = clearBattlePowerModifiers(next);

  // Fire EndOfBattle triggers on participating cards (attacker + blocker or direct target)
  // The battle opponent is stored as chosenTargetId in the context so OriginalTarget scope can resolve it
  const battleOpponentId = blockerId ?? targetId;
  const attackerCardPost = next.cards[attackerId] ?? state.cards[attackerId];
  if (attackerCardPost?.effects && attackerCardPost.effects.length > 0) {
    next = resolveEffects(attackerCardPost.effects, 'EndOfBattle', {
      sourceCardId: attackerId,
      sourcePlayerId: attackerCardPost.ownerId,
      chosenTargetId: battleOpponentId,
    }, next);
  }
  const battleOpponentCard = next.cards[battleOpponentId] ?? state.cards[battleOpponentId];
  if (battleOpponentCard?.type === 'Character' && battleOpponentCard.effects && battleOpponentCard.effects.length > 0) {
    next = resolveEffects(battleOpponentCard.effects, 'EndOfBattle', {
      sourceCardId: battleOpponentId,
      sourcePlayerId: battleOpponentCard.ownerId,
      chosenTargetId: attackerId,
    }, next);
  }

  const combatSeq = next.gameLog.length;
  const attackerCard = next.cards[attackerId] ?? state.cards[attackerId];
  const targetCard = next.cards[targetId] ?? state.cards[targetId];
  const blockerDesc = blockerId !== null
    ? ` (blocker: "${next.cards[blockerId]?.name ?? state.cards[blockerId]?.name ?? blockerId}")`
    : '';
  next = {
    ...next,
    gameLog: [...next.gameLog, {
      seq: combatSeq,
      event: 'COMBAT_RESOLVED' as const,
      message: `Combat: "${attackerCard?.name ?? attackerId}" vs "${targetCard?.name ?? targetId}"${blockerDesc}`,
      cardId: attackerId,
      cardName: attackerCard?.name,
      playerId: attackerCard?.ownerId,
      turn: next.turnNumber,
    }],
  };

  return next;
}
