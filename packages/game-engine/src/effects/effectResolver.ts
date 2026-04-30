import type {
  GameState,
  CardId,
  PlayerId,
  Card,
  PlayerState,
  CardEffect,
  EffectTrigger,
  EffectAction,
  TargetSelector,
} from '../types/index.js';
import { calculatePower, sendToTrash, drawCards, returnToHand } from '../rules/cardUtils.js';

// ─── Context ──────────────────────────────────────────────────────────────────

export interface EffectContext {
  /** The card whose effect is being resolved */
  readonly sourceCardId: CardId;
  /** The player who controls the source card */
  readonly sourcePlayerId: PlayerId;
  /** Pre-chosen target card ID (from player interaction) — used instead of auto-select */
  readonly chosenTargetId?: CardId;
}

// ─── Target selection ─────────────────────────────────────────────────────────

/**
 * Resolve a TargetSelector to a list of CardIds.
 * For "Choose" selectors: auto-selects the first valid card (stubs behaviour).
 */
function selectTargets(
  selector: TargetSelector,
  context: EffectContext,
  state: GameState,
): readonly CardId[] {
  const [p1, p2] = state.playerOrder;
  const opponentId = context.sourcePlayerId === p1 ? p2 : p1;
  const ownPlayer   = state.players[context.sourcePlayerId];
  const opponent    = state.players[opponentId];

  switch (selector.scope) {
    case 'Self':
      return [context.sourceCardId];

    case 'Attacker':
      return state.activeCombat !== null ? [state.activeCombat.attackerId] : [];

    case 'OriginalTarget':
      return state.activeCombat !== null ? [state.activeCombat.targetId] : [];

    case 'OpponentLeader':
      return opponent?.leader !== null && opponent?.leader !== undefined
        ? [opponent.leader]
        : [];

    case 'OwnLeader':
      return ownPlayer?.leader !== null && ownPlayer?.leader !== undefined
        ? [ownPlayer.leader]
        : [];

    case 'AllOpponentCharacters':
      if (selector.maxPower !== undefined) {
        return (opponent?.board ?? []).filter((id) => (state.cards[id]?.power ?? 0) <= selector.maxPower!);
      }
      return opponent?.board ?? [];

    case 'AllOwnCharacters':
      if (selector.maxPower !== undefined) {
        return (ownPlayer?.board ?? []).filter((id) => (state.cards[id]?.power ?? 0) <= selector.maxPower!);
      }
      return ownPlayer?.board ?? [];

    case 'ChooseOpponentCharacter': {
      const pool = opponent?.board ?? [];
      // If player pre-chose a target, validate it against filters
      if (context.chosenTargetId !== undefined && pool.includes(context.chosenTargetId)) {
        const chosen = state.cards[context.chosenTargetId];
        if (chosen !== undefined) {
          const costOk  = selector.maxCost  === undefined || chosen.cost <= selector.maxCost;
          const powerOk = selector.maxPower === undefined || calculatePower(context.chosenTargetId, state) <= selector.maxPower;
          if (costOk && powerOk) return [context.chosenTargetId];
        }
      }
      // Auto-select: first opponent character satisfying optional filters
      const candidates = pool.filter((id) => {
        const card = state.cards[id];
        if (card === undefined) return false;
        if (selector.maxCost  !== undefined && card.cost > selector.maxCost) return false;
        if (selector.maxPower !== undefined && calculatePower(id, state) > selector.maxPower) return false;
        return true;
      });
      return candidates.length > 0 ? [candidates[0]!] : [];
    }

    case 'ChooseOwnCharacter': {
      const pool = ownPlayer?.board ?? [];
      // If player pre-chose a target, validate it against filters
      if (context.chosenTargetId !== undefined && pool.includes(context.chosenTargetId)) {
        const chosen = state.cards[context.chosenTargetId];
        if (chosen !== undefined) {
          const costOk  = selector.maxCost  === undefined || chosen.cost <= selector.maxCost;
          const powerOk = selector.maxPower === undefined || calculatePower(context.chosenTargetId, state) <= selector.maxPower;
          if (costOk && powerOk) return [context.chosenTargetId];
        }
      }
      const candidates = pool.filter((id) => {
        const card = state.cards[id];
        if (card === undefined) return false;
        if (selector.maxCost  !== undefined && card.cost > selector.maxCost) return false;
        if (selector.maxPower !== undefined && calculatePower(id, state) > selector.maxPower) return false;
        return true;
      });
      return candidates.length > 0 ? [candidates[0]!] : [];
    }
  }
}

// ─── Single action resolver ───────────────────────────────────────────────────

function resolveAction(
  action: EffectAction,
  context: EffectContext,
  state: GameState,
): GameState {
  const [p1, p2] = state.playerOrder;
  const opponentId = context.sourcePlayerId === p1 ? p2 : p1;

  switch (action.type) {
    // ── Draw ──────────────────────────────────────────────────────────────────
    case 'Draw':
      return drawCards(state, context.sourcePlayerId, action.count);

    // ── KO ───────────────────────────────────────────────────────────────────
    case 'KO': {
      const targets = selectTargets(action.target, context, state);
      let next = state;
      for (const id of targets) {
        const card = next.cards[id]; // read BEFORE trash
        next = sendToTrash(next, id);
        if (card?.effects?.length) {
          next = resolveEffects(card.effects, 'OnKO', { sourceCardId: id, sourcePlayerId: card.ownerId }, next);
          next = resolveEffects(card.effects, 'OnLeaveField', { sourceCardId: id, sourcePlayerId: card.ownerId }, next);
        }
      }
      return next;
    }

    // ── ReturnToHand ──────────────────────────────────────────────────────────
    case 'ReturnToHand': {
      const targets = selectTargets(action.target, context, state);
      let next = state;
      for (const id of targets) {
        const card = next.cards[id]; // read BEFORE moving
        const wasOnBoard = card?.zone === 'board';
        next = returnToHand(next, id);
        if (wasOnBoard && card?.effects?.length) {
          next = resolveEffects(card.effects, 'OnLeaveField', { sourceCardId: id, sourcePlayerId: card.ownerId }, next);
        }
      }
      return next;
    }

    // ── PowerBoost ────────────────────────────────────────────────────────────
    case 'PowerBoost': {
      const targets = selectTargets(action.target, context, state);
      if (targets.length === 0) return state;
      const updatedCards: Record<string, Card> = { ...state.cards };
      const isOT = action.duration === 'EndOfOpponentTurn';
      for (const id of targets) {
        const card = state.cards[id];
        if (card !== undefined) {
          updatedCards[id] = isOT
            ? { ...card, powerModifierOT: (card.powerModifierOT ?? 0) + action.amount }
            : { ...card, powerModifier: (card.powerModifier ?? 0) + action.amount };
        }
      }
      return { ...state, cards: updatedCards as Readonly<Record<CardId, Card>> };
    }

    // ── TrashCard (force discard) ──────────────────────────────────────────────
    case 'TrashCard': {
      const targetPlayerId = action.from === 'OpponentHand' ? opponentId : context.sourcePlayerId;
      const targetPlayer = state.players[targetPlayerId];
      if (targetPlayer === undefined || targetPlayer.hand.length === 0) return state;

      // Discard up to `count` cards (pick from the end — arbitrary for stubs)
      const count = Math.min(action.count, targetPlayer.hand.length);
      const toDiscard = targetPlayer.hand.slice(-count);
      const updatedCards: Record<string, Card> = { ...state.cards };
      for (const id of toDiscard) {
        updatedCards[id] = { ...updatedCards[id]!, zone: 'trash' as const };
      }
      const updatedPlayer: PlayerState = {
        ...targetPlayer,
        hand:  targetPlayer.hand.slice(0, targetPlayer.hand.length - count),
        trash: [...targetPlayer.trash, ...toDiscard],
      };
      return {
        ...state,
        cards: updatedCards as Readonly<Record<CardId, Card>>,
        players: { ...state.players, [targetPlayerId]: updatedPlayer },
      };
    }

    // ── AddLife ───────────────────────────────────────────────────────────────
    case 'AddLife': {
      const player = state.players[context.sourcePlayerId];
      if (player === undefined || player.deck.length === 0) return state;
      const count = Math.min(action.count, player.deck.length);
      const newLife = player.deck.slice(0, count);
      const remaining = player.deck.slice(count);
      const updatedCards: Record<string, Card> = { ...state.cards };
      for (const id of newLife) {
        updatedCards[id] = { ...updatedCards[id]!, zone: 'life' as const };
      }
      const updatedPlayer: PlayerState = {
        ...player,
        deck: remaining,
        life: [...player.life, ...newLife],
      };
      return {
        ...state,
        cards: updatedCards as Readonly<Record<CardId, Card>>,
        players: { ...state.players, [context.sourcePlayerId]: updatedPlayer },
      };
    }

    // ── GiveDon ───────────────────────────────────────────────────────────────
    case 'GiveDon': {
      const opponent = state.players[opponentId];
      if (opponent === undefined) return state;

      if (action.count < 0) {
        // Negative: remove |count| active (untapped, unattached) DON from opponent's donArea
        const removeCount = Math.abs(action.count);
        const freeDon = opponent.donArea.filter((id) => {
          const d = state.cards[id];
          return d !== undefined && !d.tapped && d.attachedTo === null;
        });
        const toRemove = freeDon.slice(0, removeCount);
        if (toRemove.length === 0) return state;
        const updatedCards: Record<string, Card> = { ...state.cards };
        for (const id of toRemove) {
          updatedCards[id] = { ...updatedCards[id]!, zone: 'donDeck' as const };
        }
        const updatedOpponent: PlayerState = {
          ...opponent,
          donArea: opponent.donArea.filter((id) => !toRemove.includes(id)),
          donDeck: [...opponent.donDeck, ...toRemove],
        };
        return {
          ...state,
          cards: updatedCards as Readonly<Record<CardId, Card>>,
          players: { ...state.players, [opponentId]: updatedOpponent },
        };
      }

      // Positive: give opponent DON!! cards from their donDeck — arrive as rested (OPTcg rule)
      if (opponent.donDeck.length === 0) return state;
      const count = Math.min(action.count, opponent.donDeck.length);
      const drawn = opponent.donDeck.slice(0, count);
      const remaining = opponent.donDeck.slice(count);
      const updatedCards: Record<string, Card> = { ...state.cards };
      for (const id of drawn) {
        updatedCards[id] = { ...updatedCards[id]!, zone: 'donArea' as const, tapped: true };
      }
      const updatedOpponent: PlayerState = {
        ...opponent,
        donDeck: remaining,
        donArea: [...opponent.donArea, ...drawn],
      };
      return {
        ...state,
        cards: updatedCards as Readonly<Record<CardId, Card>>,
        players: { ...state.players, [opponentId]: updatedOpponent },
      };
    }

    // ── TakeLifeToHand ────────────────────────────────────────────────────────
    case 'TakeLifeToHand': {
      const player = state.players[context.sourcePlayerId];
      if (player === undefined || player.life.length === 0) return state;
      const count = Math.min(action.count, player.life.length);
      // Top of life zone = last element in the array
      const taken = player.life.slice(-count);
      const updatedCards: Record<string, Card> = { ...state.cards };
      for (const id of taken) {
        updatedCards[id] = { ...updatedCards[id]!, zone: 'hand' as const };
      }
      const updatedPlayer: PlayerState = {
        ...player,
        life: player.life.slice(0, player.life.length - count),
        hand: [...player.hand, ...taken],
      };
      return {
        ...state,
        cards: updatedCards as Readonly<Record<CardId, Card>>,
        players: { ...state.players, [context.sourcePlayerId]: updatedPlayer },
      };
    }

    // ── AttachDon ─────────────────────────────────────────────────────────────
    case 'AttachDon': {
      const targets = selectTargets(action.target, context, state);
      if (targets.length === 0) return state;
      const targetId = targets[0]!;
      const player = state.players[context.sourcePlayerId];
      if (player === undefined) return state;
      // Find eligible DON cards: untapped (active) by default, or tapped (rested) when from='rested'
      const freeDon = player.donArea.filter((id) => {
        const d = state.cards[id];
        if (d === undefined || d.attachedTo !== null) return false;
        return action.from === 'rested' ? d.tapped : !d.tapped;
      });
      const count = Math.min(action.count, freeDon.length);
      if (count === 0) return state;
      const toAttach = freeDon.slice(0, count);
      const updatedCards: Record<string, Card> = { ...state.cards };
      for (const id of toAttach) {
        updatedCards[id] = { ...updatedCards[id]!, tapped: true, attachedTo: targetId as CardId };
      }
      return { ...state, cards: updatedCards as Readonly<Record<CardId, Card>> };
    }

    // ── GainKeyword ───────────────────────────────────────────────────────────
    case 'GainKeyword': {
      const targets = selectTargets(action.target, context, state);
      if (targets.length === 0) return state;
      const updatedCards: Record<string, Card> = { ...state.cards };
      for (const id of targets) {
        const card = state.cards[id];
        if (card !== undefined) {
          const existing = card.temporaryKeywords ?? [];
          updatedCards[id] = {
            ...card,
            temporaryKeywords: existing.includes(action.keyword)
              ? existing
              : [...existing, action.keyword],
          };
        }
      }
      return { ...state, cards: updatedCards as Readonly<Record<CardId, Card>> };
    }

    // ── Rest ──────────────────────────────────────────────────────────────────
    case 'Rest': {
      const targets = selectTargets(action.target, context, state);
      if (targets.length === 0) return state;
      const updatedCards: Record<string, Card> = { ...state.cards };
      for (const id of targets) {
        const card = state.cards[id];
        if (card !== undefined) {
          updatedCards[id] = { ...card, tapped: true };
        }
      }
      return { ...state, cards: updatedCards as Readonly<Record<CardId, Card>> };
    }

    // ── RemoveLife ────────────────────────────────────────────────────────────
    case 'RemoveLife': {
      const player = state.players[context.sourcePlayerId];
      if (player === undefined || player.life.length === 0) return state;
      const count = Math.min(action.count, player.life.length);
      const toTrash = player.life.slice(-count);
      const updatedCards: Record<string, Card> = { ...state.cards };
      for (const id of toTrash) {
        updatedCards[id] = { ...updatedCards[id]!, zone: 'trash' as const };
      }
      const updatedPlayer: PlayerState = {
        ...player,
        life: player.life.slice(0, player.life.length - count),
        trash: [...player.trash, ...toTrash],
      };
      return {
        ...state,
        cards: updatedCards as Readonly<Record<CardId, Card>>,
        players: { ...state.players, [context.sourcePlayerId]: updatedPlayer },
      };
    }

    // ── PlaySelf ──────────────────────────────────────────────────────────────
    case 'PlaySelf': {
      // Put the source card onto the board for free (Trigger effect)
      const player = state.players[context.sourcePlayerId];
      if (player === undefined) return state;
      const card = state.cards[context.sourceCardId];
      if (card === undefined) return state;
      const updatedPlayer: PlayerState = {
        ...player,
        hand: player.hand.filter((id) => id !== context.sourceCardId),
        board: [...player.board, context.sourceCardId],
      };
      return {
        ...state,
        cards: {
          ...state.cards,
          [context.sourceCardId]: { ...card, zone: 'board' as const },
        },
        players: { ...state.players, [context.sourcePlayerId]: updatedPlayer },
      };
    }

    // ── SearchDeck ────────────────────────────────────────────────────────────
    case 'SearchDeck': {
      // Find the first card in deck matching the filter
      const player = state.players[context.sourcePlayerId];
      if (player === undefined || player.deck.length === 0) return state;

      const foundIdx = player.deck.findIndex((id) => {
        const card = state.cards[id];
        if (card === undefined) return false;
        switch (action.filter.kind) {
          case 'Any': return true;
          case 'ByType': return card.type === action.filter.cardType;
          case 'ByCost': return card.cost <= action.filter.maxCost;
          case 'ByName': return card.name === action.filter.name;
        }
      });

      if (foundIdx === -1) return state;

      const foundId = player.deck[foundIdx]!;
      const newDeck = player.deck.filter((_, i) => i !== foundIdx);
      const dest = action.destination === 'hand' ? 'hand' : 'board';
      const updatedCards: Record<string, Card> = {
        ...state.cards,
        [foundId]: { ...state.cards[foundId]!, zone: dest },
      };
      const updatedPlayer: PlayerState = {
        ...player,
        deck: newDeck,
        hand:  dest === 'hand'  ? [...player.hand,  foundId] : player.hand,
        board: dest === 'board' ? [...player.board, foundId] : player.board,
      };
      return {
        ...state,
        cards: updatedCards as Readonly<Record<CardId, Card>>,
        players: { ...state.players, [context.sourcePlayerId]: updatedPlayer },
      };
    }
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Filter and resolve all effects matching `trigger` from the given list.
 * Returns the updated GameState after all matching effects are applied in order.
 */
export function resolveEffects(
  effects: readonly CardEffect[],
  trigger: EffectTrigger,
  context: EffectContext,
  state: GameState,
): GameState {
  let next = state;
  for (const effect of effects) {
    if (effect.trigger !== trigger) continue;
    // Evaluate optional condition
    if (effect.condition !== undefined) {
      const cond = effect.condition;
      if (cond.type === 'TurnCount') {
        const t = next.turnNumber;
        if (cond.min !== undefined && t < cond.min) continue;
        if (cond.max !== undefined && t > cond.max) continue;
      }
      if (cond.type === 'HasRestingDon') {
        const player = next.players[context.sourcePlayerId];
        if (trigger === 'Activated') {
          // Guard: "[DON!! xN]" = need N active DON!! to activate; pay cost by resting them.
          const activeDon = (player?.donArea ?? []).filter((id) => {
            const d = next.cards[id];
            return d !== undefined && !d.tapped && d.attachedTo === null;
          });
          if (activeDon.length < cond.count) continue;
          // Pay activation cost: rest N active DON!!
          for (const donId of activeDon.slice(0, cond.count)) {
            next = { ...next, cards: { ...next.cards, [donId]: { ...next.cards[donId]!, tapped: true } } };
          }
        } else {
          // Passive condition: "if you have N or more rested DON!!"
          const resting = (player?.donArea ?? []).filter((id) => {
            const d = next.cards[id];
            return d !== undefined && d.tapped && d.attachedTo === null;
          }).length;
          if (resting < cond.count) continue;
        }
      }
      if (cond.type === 'LeaderHasAttachedDon') {
        // Source card (leader) must have at least `count` DON!! attached to it
        const attached = Object.values(next.cards).filter(
          (d) => d.type === 'DON' && d.attachedTo === context.sourceCardId,
        ).length;
        if (attached < cond.count) continue;
      }
      if (cond.type === 'HasAttachedDon') {
        // Source card must have at least `count` DON!! attached to it
        const attached = Object.values(next.cards).filter(
          (d) => d.type === 'DON' && d.attachedTo === context.sourceCardId,
        ).length;
        if (attached < cond.count) continue;
      }
      // 'Always' → always passes
    }
    for (const action of effect.actions) {
      next = resolveAction(action, context, next);
    }
  }
  return next;
}
