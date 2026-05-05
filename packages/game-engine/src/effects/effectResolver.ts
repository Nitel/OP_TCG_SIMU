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

    case 'AllOwnCharactersAndLeader': {
      const all: CardId[] = [...(ownPlayer?.board ?? [])];
      if (ownPlayer?.leader !== null && ownPlayer?.leader !== undefined) all.push(ownPlayer.leader);
      if (selector.maxPower !== undefined) {
        return all.filter((id) => calculatePower(id, state) <= selector.maxPower!);
      }
      return all;
    }

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

    case 'ChooseOwnCharacterOrLeader': {
      const pool: CardId[] = [...(ownPlayer?.board ?? [])];
      if (ownPlayer?.leader !== null && ownPlayer?.leader !== undefined) pool.push(ownPlayer.leader);
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

    case 'ChooseOpponentCharacterOrLeader': {
      const pool: CardId[] = [...(opponent?.board ?? [])];
      if (opponent?.leader !== null && opponent?.leader !== undefined) pool.push(opponent.leader);
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
    // ── DrawCard ─────────────────────────────────────────────────────────────
    case 'DrawCard':
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

    // ── ForceDiscard ──────────────────────────────────────────────────────────
    // Opponent must discard `count` cards from their hand (they choose; bot picks from end).
    // TODO: create pendingForceDiscardInteraction for human opponents.
    case 'ForceDiscard': {
      const opponent = state.players[opponentId];
      if (opponent === undefined || opponent.hand.length === 0) return state;
      const count = Math.min(action.count, opponent.hand.length);
      const toDiscard = opponent.hand.slice(-count);
      const updatedCards: Record<string, Card> = { ...state.cards };
      for (const id of toDiscard) {
        updatedCards[id] = { ...updatedCards[id]!, zone: 'trash' as const };
      }
      const updatedOpponent: PlayerState = {
        ...opponent,
        hand:  opponent.hand.slice(0, opponent.hand.length - count),
        trash: [...opponent.trash, ...toDiscard],
      };
      return {
        ...state,
        cards: updatedCards as Readonly<Record<CardId, Card>>,
        players: { ...state.players, [opponentId]: updatedOpponent },
      };
    }

    // ── FlipLife ──────────────────────────────────────────────────────────────
    // Sets pendingFlipLifeInteraction for player to choose which Life card(s) to flip face-up.
    // Full interactive implementation deferred; bot/AI picks the last life card.
    case 'FlipLife': {
      const player = state.players[context.sourcePlayerId];
      if (player === undefined || player.life.length === 0) return state;
      // For now: auto-flip the last life card (bot behaviour / stub).
      // TODO: create pendingFlipLifeInteraction for human players.
      const count = Math.min(action.count, player.life.length);
      const toFlip = player.life.slice(-count);
      const updatedCards: Record<string, Card> = { ...state.cards };
      for (const id of toFlip) {
        updatedCards[id] = { ...updatedCards[id]!, tapped: true }; // tapped = face-up marker
      }
      return {
        ...state,
        cards: updatedCards as Readonly<Record<CardId, Card>>,
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

    // ── GiveKeyword ───────────────────────────────────────────────────────────
    case 'GiveKeyword': {
      const targets = selectTargets(action.target, context, state);
      if (targets.length === 0) return state;
      const updatedCards: Record<string, Card> = { ...state.cards };
      for (const id of targets) {
        const card = state.cards[id];
        if (card !== undefined) {
          if (action.duration === 'Permanent') {
            // Permanent keyword → add to the base keywords array (survives end of turn)
            const existing = card.keywords ?? [];
            updatedCards[id] = {
              ...card,
              keywords: existing.includes(action.keyword) ? existing : [...existing, action.keyword],
            };
          } else {
            // Temporary keyword → cleared at end of turn by clearTemporaryKeywords
            const existing = card.temporaryKeywords ?? [];
            updatedCards[id] = {
              ...card,
              temporaryKeywords: existing.includes(action.keyword) ? existing : [...existing, action.keyword],
            };
          }
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

    // ── Win ───────────────────────────────────────────────────────────────────
    case 'Win':
      return { ...state, winner: context.sourcePlayerId };

    // ── PlaySelf ──────────────────────────────────────────────────────────────
    case 'PlaySelf': {
      // Put the source card onto the board for free (Trigger / OnKO / resurrection effect).
      // Card may be in hand (Trigger), trash (OnKO resurrection), or life (edge cases).
      const player = state.players[context.sourcePlayerId];
      if (player === undefined) return state;
      const card = state.cards[context.sourceCardId];
      if (card === undefined) return state;
      const cid = context.sourceCardId;
      if (player.board.includes(cid)) return state; // already on board, no-op
      const tapped = action.rested === true; // rested=true for Marco-style resurrection
      const updatedPlayer: PlayerState = {
        ...player,
        hand:  player.hand.filter((id) => id !== cid),
        trash: player.trash.filter((id) => id !== cid),
        life:  player.life.filter((id) => id !== cid),
        board: [...player.board, cid],
      };
      let next: GameState = {
        ...state,
        cards: {
          ...state.cards,
          [cid]: { ...card, zone: 'board' as const, tapped },
        },
        players: { ...state.players, [context.sourcePlayerId]: updatedPlayer },
      };
      // Fire OnPlay effects (unless played rested from trash — resurrection skip)
      if (!tapped && card.effects?.length) {
        next = resolveEffects(
          card.effects,
          'OnPlay',
          { sourceCardId: cid, sourcePlayerId: context.sourcePlayerId },
          next,
        );
      }
      return next;
    }

    // ── PlayFromHand ──────────────────────────────────────────────────────────
    case 'PlayFromHand': {
      const player = state.players[context.sourcePlayerId];
      if (player === undefined) return state;
      const f = action.filter;
      const validIds = player.hand.filter((id) => {
        const c = state.cards[id];
        if (c === undefined) return false;
        if (f.color !== undefined && c.color !== f.color) return false;
        if (f.cardType !== undefined && c.type !== f.cardType) return false;
        if (f.maxPower !== undefined && c.power > f.maxPower) return false;
        if (f.excludeSelf === true && id === context.sourceCardId) return false;
        if (f.subType !== undefined && c.subTypes !== undefined && !c.subTypes.includes(f.subType)) return false;
        return true;
      });
      if (validIds.length === 0) return state; // no valid cards — skip silently
      // Store pending interaction so the player (or bot) can choose which card to play
      return {
        ...state,
        pendingOnKOInteraction: {
          playerId: context.sourcePlayerId,
          filter: f,
          sourceCardId: context.sourceCardId,
        },
      };
    }

    // ── SearchDeck ────────────────────────────────────────────────────────────
    case 'SearchDeck': {
      const player = state.players[context.sourcePlayerId];
      if (player === undefined || player.deck.length === 0) return state;

      // When `count` is specified: reveal top N cards and let the player choose → set pendingSearchInteraction.
      if (action.count !== undefined) {
        const revealedCardIds = player.deck.slice(0, action.count);
        return {
          ...state,
          pendingSearchInteraction: {
            playerId: context.sourcePlayerId,
            revealedCardIds,
            filter: action.filter,
            destination: action.destination,
            sourceCardId: context.sourceCardId,
            sourcePlayerId: context.sourcePlayerId,
          },
        };
      }

      // No count: auto-pick the first matching card (backwards-compatible, bot-friendly)
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
      const foundCard = state.cards[foundId];
      const dest = (action.destination === 'board' && foundCard?.type === 'Character') ? 'board' : 'hand';
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

    // ── TrashFromDeck ─────────────────────────────────────────────────────────
    case 'TrashFromDeck': {
      const player = state.players[context.sourcePlayerId];
      if (player === undefined) return state;
      const actual = Math.min(action.count, player.deck.length);
      if (actual === 0) {
        let next = state;
        for (const a of action.thenActions) next = resolveAction(a, context, next);
        return next;
      }
      const toTrash = player.deck.slice(0, actual);
      const remainingDeck = player.deck.slice(actual);
      const updatedCards: Record<string, Card> = { ...state.cards };
      for (const cardId of toTrash) {
        const c = updatedCards[cardId];
        if (c !== undefined) updatedCards[cardId] = { ...c, zone: 'trash' as const };
      }
      const updatedPlayer: PlayerState = {
        ...player,
        deck: remainingDeck,
        trash: [...player.trash, ...toTrash],
      };
      let next: GameState = {
        ...state,
        cards: updatedCards as Readonly<Record<CardId, Card>>,
        players: { ...state.players, [context.sourcePlayerId]: updatedPlayer },
      };
      for (const a of action.thenActions) next = resolveAction(a, context, next);
      return next;
    }

    // ── PlayFromTrash ─────────────────────────────────────────────────────────
    case 'PlayFromTrash': {
      const player = state.players[context.sourcePlayerId];
      if (player === undefined) return state;
      const f = action.filter;
      const match = player.trash.find((id) => {
        const c = state.cards[id];
        if (c === undefined) return false;
        if (f.color !== undefined && c.color !== f.color) return false;
        if (f.cardType !== undefined && c.type !== f.cardType) return false;
        if (f.maxCost !== undefined && c.cost > f.maxCost) return false;
        if (f.maxPower !== undefined && c.power > f.maxPower) return false;
        if (f.subType !== undefined && !(c.subTypes ?? '').includes(f.subType)) return false;
        if (f.excludeSelf === true && id === context.sourceCardId) return false;
        return true;
      });
      if (match === undefined) return state;
      const card = state.cards[match]!;
      const updatedCards: Record<string, Card> = {
        ...state.cards,
        [match]: { ...card, zone: 'board' as const, tapped: false },
      };
      const updatedPlayer: PlayerState = {
        ...player,
        trash: player.trash.filter((id) => id !== match),
        board: [...player.board, match],
      };
      let next: GameState = {
        ...state,
        cards: updatedCards as Readonly<Record<CardId, Card>>,
        players: { ...state.players, [context.sourcePlayerId]: updatedPlayer },
      };
      // Fire OnPlay — same pattern as PlaySelf (effectResolver.ts:468-476)
      if (card.effects?.length) {
        next = resolveEffects(
          card.effects,
          'OnPlay',
          { sourceCardId: match, sourcePlayerId: context.sourcePlayerId },
          next,
        );
      }
      return next;
    }

    // ── RevealFromHand ────────────────────────────────────────────────────────
    // Intercepted in resolveEffects before reaching here; this case is unreachable.
    case 'RevealFromHand':
      return state;

    // ── TrashFromHand ─────────────────────────────────────────────────────────
    // Intercepted in resolveEffects before reaching here; this case is unreachable.
    case 'TrashFromHand':
      return state;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Filter and resolve all effects matching `trigger` from the given list.
 * Returns the updated GameState after all matching effects are applied in order.
 *
 * If an effect action requires player target selection (ChooseOwnCharacter /
 * ChooseOpponentCharacter) and no `context.chosenTargetId` was pre-supplied,
 * the function sets `GameState.pendingTargetInteraction` and returns early.
 */
export function resolveEffects(
  effects: readonly CardEffect[],
  trigger: EffectTrigger,
  context: EffectContext,
  state: GameState,
): GameState {
  const [p1, p2] = state.playerOrder;
  const opponentId = context.sourcePlayerId === p1 ? p2 : p1;
  void opponentId; // used below for scope resolution
  let next = state;
  for (let ei = 0; ei < effects.length; ei++) {
    const effect = effects[ei]!;
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
      if (cond.type === 'TrashCount') {
        const trashSize = next.players[context.sourcePlayerId]?.trash.length ?? 0;
        if (trashSize < cond.min) continue;
      }
      if (cond.type === 'HasCardOnBoard') {
        const hasCard = Object.values(next.cards).some(
          (c) => c.ownerId === context.sourcePlayerId && c.zone === 'board' && c.name === cond.name,
        );
        if (!hasCard) continue;
      }
      if (cond.type === 'AnyPlayerHasNoLife') {
        const anyEmpty = Object.values(next.players).some((p) => p.life.length === 0);
        if (!anyEmpty) continue;
      }
      if (cond.type === 'LeaderHasType') {
        const leaderId = next.players[context.sourcePlayerId]?.leader;
        if (!leaderId) continue;
        const leader = next.cards[leaderId];
        if (leader?.subTypes?.includes(cond.subType) !== true) continue;
      }
      if (cond.type === 'LeaderHasAnyType') {
        const leaderId = next.players[context.sourcePlayerId]?.leader;
        if (!leaderId) continue;
        const leader = next.cards[leaderId];
        if (!cond.subTypes.some((t) => leader?.subTypes?.includes(t) === true)) continue;
      }
      if (cond.type === 'LeaderIsName') {
        const leaderId = next.players[context.sourcePlayerId]?.leader;
        if (!leaderId) continue;
        const leader = next.cards[leaderId];
        if (leader?.name.includes(cond.name) !== true) continue;
      }
      // 'Always' → always passes
    }
    for (let ai = 0; ai < effect.actions.length; ai++) {
      const action = effect.actions[ai]!;

      // Detect ChooseTarget actions that need player input (not pre-supplied via context).
      // Activated abilities are intercepted client-side (chosenTargetId provided before dispatch);
      // for all other triggers (including OnPlay) the engine pauses and waits for ResolveTargetInteraction.
      const needsEngineInteraction = trigger !== 'Activated';
      if (needsEngineInteraction && context.chosenTargetId === undefined) {
        const t = (action as Record<string, unknown>).target;
        if (t !== null && t !== undefined && typeof t === 'object') {
          const scope = (t as { scope: string }).scope;
          if (scope === 'ChooseOwnCharacter' || scope === 'ChooseOpponentCharacter' || scope === 'ChooseOwnCharacterOrLeader' || scope === 'ChooseOpponentCharacterOrLeader') {
            const chooseScope = scope as 'ChooseOwnCharacter' | 'ChooseOpponentCharacter' | 'ChooseOwnCharacterOrLeader' | 'ChooseOpponentCharacterOrLeader';
            const maxCost  = (t as { maxCost?: number }).maxCost;
            const maxPower = (t as { maxPower?: number }).maxPower;
            return {
              ...next,
              pendingTargetInteraction: {
                playerId: context.sourcePlayerId,
                scope: chooseScope,
                sourceCardId: context.sourceCardId,
                sourcePlayerId: context.sourcePlayerId,
                ...(maxCost  !== undefined ? { maxCost }  : {}),
                ...(maxPower !== undefined ? { maxPower } : {}),
                pendingAction: action,
                pendingEffectActions: effect.actions.slice(ai + 1),
                pendingEffects: effects.slice(ei + 1),
                trigger,
              },
            };
          }
        }
      }

      // Detect RevealFromHand — pause and wait for ResolveRevealInteraction
      if (action.type === 'RevealFromHand') {
        return {
          ...next,
          pendingRevealInteraction: {
            playerId: context.sourcePlayerId,
            count: action.count,
            filter: action.filter,
            sourceCardId: context.sourceCardId,
            sourcePlayerId: context.sourcePlayerId,
            thenActions: action.thenActions,
            pendingEffectActions: effect.actions.slice(ai + 1),
            pendingEffects: effects.slice(ei + 1),
            trigger,
          },
        };
      }

      // Detect TrashFromHand — pause and wait for ResolveTrashInteraction
      if (action.type === 'TrashFromHand') {
        return {
          ...next,
          pendingTrashInteraction: {
            playerId: context.sourcePlayerId,
            filter: action.filter,
            ...(action.count    !== undefined ? { count: action.count }       : {}),
            ...(action.optional !== undefined ? { optional: action.optional } : {}),
            sourceCardId: context.sourceCardId,
            sourcePlayerId: context.sourcePlayerId,
            thenActions: action.thenActions,
            pendingEffectActions: effect.actions.slice(ai + 1),
            pendingEffects: effects.slice(ei + 1),
            trigger,
          },
        };
      }

      next = resolveAction(action, context, next);
      // Propagate if a nested resolveEffects call set pendingTargetInteraction
      if (next.pendingTargetInteraction !== null) return next;
      if (next.pendingRevealInteraction !== null) return next;
      if (next.pendingTrashInteraction !== null) return next;
    }
  }
  return next;
}
