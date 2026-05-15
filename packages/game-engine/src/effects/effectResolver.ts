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
import { calculatePower, sendToTrash, drawCards, returnToHand, countAttachedDon } from '../rules/cardUtils.js';

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

/** Check if a card has a given subType. Handles "/" separator (official rules) and space-separated legacy data. */
function hasSubType(cardSubTypes: string | undefined, filter: string): boolean {
  if (!cardSubTypes) return false;
  if (cardSubTypes.includes('/')) {
    return cardSubTypes.split('/').some((t) => t.trim() === filter);
  }
  return cardSubTypes.includes(filter);
}

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

    case 'AllOwnCharacters': {
      // Fallback to legacy DSL field "type" (e.g. ST21-011.json uses "type": "Straw Hat Crew")
      const subType = selector.subType ?? (selector as { type?: string }).type;
      if (selector.maxPower !== undefined || subType !== undefined) {
        return (ownPlayer?.board ?? []).filter((id) => {
          const card = state.cards[id];
          if (card === undefined) return false;
          if (selector.maxPower !== undefined && (card.power ?? 0) > selector.maxPower) return false;
          if (subType !== undefined && !hasSubType(card.subTypes, subType)) return false;
          return true;
        });
      }
      return ownPlayer?.board ?? [];
    }

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
      const matchesFilters = (id: CardId): boolean => {
        const card = state.cards[id];
        if (card === undefined) return false;
        if (selector.maxCost  !== undefined && card.cost > selector.maxCost) return false;
        if (selector.maxPower !== undefined && calculatePower(id, state) > selector.maxPower) return false;
        if (selector.subType  !== undefined && !hasSubType(card.subTypes, selector.subType)) return false;
        return true;
      };
      if (context.chosenTargetId !== undefined && pool.includes(context.chosenTargetId) && matchesFilters(context.chosenTargetId)) {
        return [context.chosenTargetId];
      }
      const candidates = pool.filter(matchesFilters);
      return candidates.length > 0 ? [candidates[0]!] : [];
    }

    case 'ChooseOwnCharacter': {
      const pool = ownPlayer?.board ?? [];
      const matchesFilters = (id: CardId): boolean => {
        const card = state.cards[id];
        if (card === undefined) return false;
        if (selector.maxCost  !== undefined && card.cost > selector.maxCost) return false;
        if (selector.maxPower !== undefined && calculatePower(id, state) > selector.maxPower) return false;
        if (selector.subType  !== undefined && !hasSubType(card.subTypes, selector.subType)) return false;
        return true;
      };
      if (context.chosenTargetId !== undefined && pool.includes(context.chosenTargetId) && matchesFilters(context.chosenTargetId)) {
        return [context.chosenTargetId];
      }
      const candidates = pool.filter(matchesFilters);
      return candidates.length > 0 ? [candidates[0]!] : [];
    }

    case 'ChooseOwnCharacterOrLeader': {
      const pool: CardId[] = [...(ownPlayer?.board ?? [])];
      if (ownPlayer?.leader !== null && ownPlayer?.leader !== undefined) pool.push(ownPlayer.leader);
      const matchesFilters = (id: CardId): boolean => {
        const card = state.cards[id];
        if (card === undefined) return false;
        if (selector.maxCost  !== undefined && card.cost > selector.maxCost) return false;
        if (selector.maxPower !== undefined && calculatePower(id, state) > selector.maxPower) return false;
        if (selector.subType  !== undefined && !hasSubType(card.subTypes, selector.subType)) return false;
        return true;
      };
      if (context.chosenTargetId !== undefined && pool.includes(context.chosenTargetId) && matchesFilters(context.chosenTargetId)) {
        return [context.chosenTargetId];
      }
      const candidates = pool.filter(matchesFilters);
      return candidates.length > 0 ? [candidates[0]!] : [];
    }

    case 'ChooseOpponentCharacterOrLeader': {
      const pool: CardId[] = [...(opponent?.board ?? [])];
      if (opponent?.leader !== null && opponent?.leader !== undefined) pool.push(opponent.leader);
      const matchesFilters = (id: CardId): boolean => {
        const card = state.cards[id];
        if (card === undefined) return false;
        if (selector.maxCost  !== undefined && card.cost > selector.maxCost) return false;
        if (selector.maxPower !== undefined && calculatePower(id, state) > selector.maxPower) return false;
        if (selector.subType  !== undefined && !hasSubType(card.subTypes, selector.subType)) return false;
        return true;
      };
      if (context.chosenTargetId !== undefined && pool.includes(context.chosenTargetId) && matchesFilters(context.chosenTargetId)) {
        return [context.chosenTargetId];
      }
      const candidates = pool.filter(matchesFilters);
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
        const koSeq = next.gameLog.length;
        next = {
          ...sendToTrash(next, id),
          gameLog: [...next.gameLog, {
            seq: koSeq,
            event: 'KO' as const,
            cause: 'effect' as const,
            message: `"${card?.name ?? id}" (${id}) KO'd [effect] — owner: [${card?.ownerId ?? '?'}]`,
            cardId: id,
            cardName: card?.name,
            playerId: card?.ownerId,
          }],
        };
        if (card?.effects?.length) {
          // Fire OnKO for every KO'd card — PlayFromHand will queue if a prompt is already active.
          const hasOnKO = card.effects.some((e) => e.trigger === 'OnKO');
          if (hasOnKO) {
            const tSeq = next.gameLog.length;
            next = {
              ...next,
              gameLog: [...next.gameLog, {
                seq: tSeq,
                event: 'ON_KO_TRIGGER' as const,
                cause: 'effect' as const,
                message: `OnKO trigger for "${card.name}" (${id}) [effect]`,
                cardId: id,
                cardName: card.name,
                playerId: card.ownerId,
              }],
            };
          }
          next = resolveEffects(card.effects, 'OnKO', { sourceCardId: id, sourcePlayerId: card.ownerId }, next);
          // Always fire OnLeaveField (no player interaction needed)
          next = resolveEffects(card.effects, 'OnLeaveField', { sourceCardId: id, sourcePlayerId: card.ownerId }, next);
        }
      }
      return next;
    }

    // ── ReturnToHand ──────────────────────────────────────────────────────────
    case 'ReturnToHand': {
      if (!action.target) return state; // filter-based (from trash) variant — not yet implemented
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
    // Intercepted in resolveEffects before reaching here (sets pendingForceDiscardInteraction).
    // This case is unreachable during normal effect resolution.
    case 'ForceDiscard':
      return state;

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
      if (!action.target) return state; // unresolved target — no-op
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
      let attachResult: GameState = { ...state, cards: updatedCards as Readonly<Record<CardId, Card>> };
      // Auto-grant Rush for "[DON!! xN] This Character gains Rush" passive effects
      const attachTarget = attachResult.cards[targetId];
      if (attachTarget !== undefined) {
        for (const eff of attachTarget.effects ?? []) {
          if (
            eff.trigger === 'Activated' &&
            eff.condition?.type === 'HasRestingDon' &&
            eff.actions.some(
              (a) => a.type === 'GiveKeyword' &&
                (a as { keyword?: string }).keyword === 'Rush' &&
                (a as { target?: { scope?: string } }).target?.scope === 'Self',
            )
          ) {
            const threshold = (eff.condition as { type: 'HasRestingDon'; count: number }).count;
            const attachedCount = countAttachedDon(attachResult.cards, targetId as CardId);
            if (attachedCount >= threshold && !(attachResult.cards[targetId]?.keywords ?? []).includes('Rush')) {
              attachResult = {
                ...attachResult,
                cards: {
                  ...attachResult.cards,
                  [targetId]: {
                    ...attachResult.cards[targetId]!,
                    keywords: [...(attachResult.cards[targetId]!.keywords ?? []), 'Rush'],
                  },
                },
              };
            }
          }
        }
      }
      return attachResult;
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
        // Attached DON!! cards cannot be tapped/untapped by effects (OPTCG rule)
        if (card !== undefined && !(card.type === 'DON' && card.attachedTo !== null)) {
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
      // life[0] = TOP; remove from top
      const toTrash = player.life.slice(0, count);
      const updatedCards: Record<string, Card> = { ...state.cards };
      for (const id of toTrash) {
        updatedCards[id] = { ...updatedCards[id]!, zone: 'trash' as const };
      }
      const updatedPlayer: PlayerState = {
        ...player,
        life: player.life.slice(count),
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
      if (card.type === 'Character') {
        const charCount = player.board.filter((id) => state.cards[id]?.type === 'Character').length;
        if (charCount >= 5) return state; // board full — silent skip
      }
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
      const f = action.filter;
      // Guard: a prompt is already open — queue this one for later
      if (state.pendingOnKOInteraction !== null) {
        return {
          ...state,
          pendingOnKOQueue: [...state.pendingOnKOQueue, {
            playerId: context.sourcePlayerId,
            filter: f,
            sourceCardId: context.sourceCardId,
          }],
        };
      }
      const player = state.players[context.sourcePlayerId];
      if (player === undefined) return state;
      const validIds = player.hand.filter((id) => {
        const c = state.cards[id];
        if (c === undefined) return false;
        if (f.name !== undefined && c.name !== f.name) return false;
        if (f.color !== undefined && c.color !== f.color) return false;
        if (f.cardType !== undefined && c.type !== f.cardType) return false;
        if (f.cardTypes !== undefined && !f.cardTypes.includes(c.type as 'Character' | 'Event' | 'Stage')) return false;
        if (f.maxCost !== undefined && c.cost > f.maxCost) return false;
        if (f.maxPower !== undefined && c.power > f.maxPower) return false;
        if (f.excludeSelf === true && id === context.sourceCardId) return false;
        if (f.excludeName !== undefined && c.name === f.excludeName) return false;
        if (f.subType !== undefined && !hasSubType(c.subTypes, f.subType)) return false;
        return true;
      });
      if (validIds.length === 0) {
        // No eligible cards — resolve silently (effect fires but player has no choice)
        const skipSeq = state.gameLog.length;
        return {
          ...state,
          gameLog: [...state.gameLog, {
            seq: skipSeq,
            event: 'EFFECT_SKIPPED' as const,
            message: `PlayFromHand: no eligible cards in hand for [${context.sourcePlayerId}] — effect resolves with no play`,
            playerId: context.sourcePlayerId,
            cardId: context.sourceCardId,
          }],
        };
      }
      // Log candidates and create the prompt
      const candidateSeq = state.gameLog.length;
      const candidateNames = validIds.map((id) => state.cards[id]?.name ?? id).join(', ');
      return {
        ...state,
        pendingOnKOInteraction: {
          playerId: context.sourcePlayerId,
          filter: f,
          sourceCardId: context.sourceCardId,
        },
        gameLog: [...state.gameLog,
          {
            seq: candidateSeq,
            event: 'EFFECT_CANDIDATES' as const,
            message: `PlayFromHand candidates for [${context.sourcePlayerId}]: [${candidateNames}]`,
            playerId: context.sourcePlayerId,
            cardId: context.sourceCardId,
          },
          {
            seq: candidateSeq + 1,
            event: 'PROMPT_CREATED' as const,
            message: `OnKO prompt created for [${context.sourcePlayerId}] — awaiting card choice`,
            playerId: context.sourcePlayerId,
            cardId: context.sourceCardId,
          },
        ],
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
            destination: action.destination as 'hand' | 'board' | 'bottomOfDeck',
            ...(action.restTo !== undefined ? { restTo: action.restTo } : {}),
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
          case 'ByCost': {
            const typeOk = action.filter.cardType === undefined || card.type === action.filter.cardType;
            return typeOk && card.cost <= action.filter.maxCost;
          }
          case 'ByName': return card.name === action.filter.name;
          case 'BySubType': {
            const typeOk = action.filter.cardType === undefined || card.type === action.filter.cardType;
            return typeOk && hasSubType(card.subTypes, action.filter.subType);
          }
        }
      });

      if (foundIdx === -1) return state;

      const foundId = player.deck[foundIdx]!;
      const newDeck = player.deck.filter((_, i) => i !== foundIdx);
      const foundCard = state.cards[foundId];

      if (action.destination === 'bottomOfDeck') {
        // Place card at the bottom of the deck (not removing from deck, just repositioning)
        const deckWithout = player.deck.filter((_, i) => i !== foundIdx);
        return {
          ...state,
          players: {
            ...state.players,
            [context.sourcePlayerId]: { ...player, deck: [...deckWithout, foundId] as readonly CardId[] },
          },
        };
      }

      const charCount = player.board.filter((id) => state.cards[id]?.type === 'Character').length;
      const dest = (action.destination === 'board' && foundCard?.type === 'Character' && charCount < 5) ? 'board' : 'hand';
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
        if (f.subType !== undefined && !hasSubType(c.subTypes, f.subType)) return false;
        if (f.excludeSelf === true && id === context.sourceCardId) return false;
        return true;
      });
      if (match === undefined) return state;
      const card = state.cards[match]!;
      if (card.type === 'Character') {
        const charCount = player.board.filter((id) => state.cards[id]?.type === 'Character').length;
        if (charCount >= 5) return state; // board full — silent skip
      }
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

    // ── RevealFromDeck ────────────────────────────────────────────────────────
    case 'RevealFromDeck': {
      const player = state.players[context.sourcePlayerId];
      if (player === undefined || player.deck.length === 0) return state;
      const actual = Math.min(action.count, player.deck.length);
      const revealed = player.deck.slice(0, actual);
      const remaining = player.deck.slice(actual);
      const newDeck: readonly CardId[] =
        action.returnTo === 'bottom'
          ? ([...remaining, ...revealed] as CardId[])
          : ([...revealed, ...remaining] as CardId[]); // top
      let next: GameState = {
        ...state,
        players: {
          ...state.players,
          [context.sourcePlayerId]: { ...player, deck: newDeck },
        },
      };
      for (const a of action.thenActions) next = resolveAction(a, context, next);
      return next;
    }

    // ── PlaceAtBottomOfDeck ───────────────────────────────────────────────────
    case 'PlaceAtBottomOfDeck': {
      const targets = selectTargets(action.target, context, state);
      let next = state;
      for (const cardId of targets) {
        const card = next.cards[cardId];
        if (card === undefined) continue;
        const owner = next.players[card.ownerId];
        if (owner === undefined) continue;
        const updatedCards: Record<string, Card> = {
          ...next.cards,
          [cardId]: { ...card, zone: 'deck' as const, tapped: false },
        };
        const updatedPlayer: PlayerState = {
          ...owner,
          board: owner.board.filter((id) => id !== cardId),
          hand:  owner.hand.filter((id) => id !== cardId),
          trash: owner.trash.filter((id) => id !== cardId),
          life:  owner.life.filter((id) => id !== cardId),
          deck:  [...owner.deck, cardId],
        };
        next = {
          ...next,
          cards: updatedCards as Readonly<Record<CardId, Card>>,
          players: { ...next.players, [card.ownerId]: updatedPlayer },
        };
      }
      return next;
    }

    // ── SearchTrash ───────────────────────────────────────────────────────────
    case 'SearchTrash': {
      const player = state.players[context.sourcePlayerId];
      if (player === undefined) return state;
      const matches = player.trash.filter((id) => {
        const c = state.cards[id];
        if (c === undefined) return false;
        const f = action.filter;
        return (
          (f.color === undefined || c.color === f.color) &&
          (f.cardType === undefined || c.type === f.cardType) &&
          (f.maxCost === undefined || c.cost <= f.maxCost) &&
          (f.maxPower === undefined || c.power <= f.maxPower) &&
          (f.subType === undefined || hasSubType(c.subTypes, f.subType)) &&
          (f.excludeSelf !== true || id !== context.sourceCardId)
        );
      });
      const toMove = matches.slice(0, action.count);
      if (toMove.length === 0) return state;
      const updatedCards = { ...state.cards };
      for (const id of toMove) {
        const c = updatedCards[id];
        if (c !== undefined) updatedCards[id] = { ...c, zone: 'hand' as const };
      }
      const updatedPlayer: PlayerState = {
        ...player,
        trash: player.trash.filter((id) => !toMove.includes(id)),
        hand:  [...player.hand, ...toMove],
      };
      return {
        ...state,
        cards:   updatedCards as Readonly<Record<CardId, Card>>,
        players: { ...state.players, [context.sourcePlayerId]: updatedPlayer },
      };
    }

    // ── Activate ─────────────────────────────────────────────────────────────
    case 'Activate': {
      const targets = selectTargets(action.target, context, state);
      let next = state;
      for (const cardId of targets) {
        const card = next.cards[cardId];
        // Attached DON!! cards cannot be tapped/untapped by effects (OPTCG rule)
        if (card === undefined || (card.type === 'DON' && card.attachedTo !== null)) continue;
        next = { ...next, cards: { ...next.cards, [cardId]: { ...card, tapped: false } } };
      }
      return next;
    }

    // ── DynamicPowerBoost ─────────────────────────────────────────────────────
    case 'DynamicPowerBoost': {
      const handSize = state.players[context.sourcePlayerId]?.hand.length ?? 0;
      const amount = handSize * action.multiplier;
      const targets = selectTargets(action.target, context, state);
      let next = state;
      for (const cardId of targets) {
        const card = next.cards[cardId];
        if (card === undefined) continue;
        const field = action.duration === 'EndOfOpponentTurn' ? 'powerModifierOT' : 'powerModifier';
        const current = card[field] ?? 0;
        next = { ...next, cards: { ...next.cards, [cardId]: { ...card, [field]: current + amount } } };
      }
      return next;
    }

    // ── TakeFromLife ─────────────────────────────────────────────────────────
    case 'TakeFromLife': {
      const player = state.players[context.sourcePlayerId];
      if (player === undefined || player.life.length === 0) return state;
      // optional: if true the player *may* take — for bot/auto resolution, always take
      const actual = Math.min(action.count, player.life.length);
      // life[0] = TOP; take from top
      const taken = player.life.slice(0, actual);
      const updatedCards: Record<string, Card> = { ...state.cards };
      for (const id of taken) {
        updatedCards[id] = { ...state.cards[id]!, zone: 'hand' };
      }
      const updatedPlayer: PlayerState = {
        ...player,
        life: player.life.slice(actual),
        hand: [...player.hand, ...taken],
      };
      return {
        ...state,
        cards: updatedCards as Readonly<Record<CardId, Card>>,
        players: { ...state.players, [context.sourcePlayerId]: updatedPlayer },
      };
    }

    // ── ReduceEventCost ───────────────────────────────────────────────────────
    case 'ReduceEventCost': {
      const player = state.players[context.sourcePlayerId];
      if (player === undefined) return state;
      const current = player.eventCostReduction ?? 0;
      return {
        ...state,
        players: {
          ...state.players,
          [context.sourcePlayerId]: { ...player, eventCostReduction: current + action.amount },
        },
      };
    }

    // ── ForceAttack ───────────────────────────────────────────────────────────
    // Forces a chosen character (context.chosenTargetId) to immediately attack once.
    // The engine pauses via pendingForcedAttack; the client must dispatch DeclareAttack
    // with attackerId === attackerCardId to resume the combat flow.
    case 'ForceAttack': {
      if (context.chosenTargetId === undefined) return state;
      return {
        ...state,
        pendingForcedAttack: {
          attackerCardId: context.chosenTargetId,
          ownerId: context.sourcePlayerId,
        },
      };
    }

    // ── SuppressBlockerForAttacker ────────────────────────────────────────────
    case 'SuppressBlockerForAttacker': {
      const targets = selectTargets(action.target, context, state);
      if (targets.length === 0) return state;
      const toAdd = targets.filter((id) => !state.blockerSuppressedForAttackerIds.includes(id));
      if (toAdd.length === 0) return state;
      return { ...state, blockerSuppressedForAttackerIds: [...state.blockerSuppressedForAttackerIds, ...toAdd] };
    }

    // ── DisableBlocker ────────────────────────────────────────────────────────
    case 'DisableBlocker': {
      const targets = selectTargets(action.target, context, state);
      if (targets.length === 0) return state;
      const toAdd = targets.filter((id) => !state.blockerDisabledIds.includes(id));
      if (toAdd.length === 0) return state;
      return { ...state, blockerDisabledIds: [...state.blockerDisabledIds, ...toAdd] };
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

    // Check and pay effect-level DON cost (e.g. OnBlock abilities that cost 1 DON)
    if (effect.cost !== undefined && effect.cost.don > 0) {
      const player = next.players[context.sourcePlayerId];
      const activeDon = (player?.donArea ?? []).filter((id) => {
        const d = next.cards[id];
        return d !== undefined && !d.tapped && d.attachedTo === null;
      });
      if (activeDon.length < effect.cost.don) continue; // can't pay — skip effect
      // Pay by resting N active DON
      for (const donId of activeDon.slice(0, effect.cost.don)) {
        next = { ...next, cards: { ...next.cards, [donId]: { ...next.cards[donId]!, tapped: true } } };
      }
    }

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
          // "Give up to N rested DON!!" — check already-rested DON, no cost payment
          const hasAttachDonFromRested = effect.actions.some(
            (a) => a.type === 'AttachDon' && (a as { from?: string }).from === 'rested',
          );
          if (hasAttachDonFromRested) {
            const restedDon = (player?.donArea ?? []).filter((id) => {
              const d = next.cards[id];
              return d !== undefined && d.tapped && d.attachedTo === null;
            });
            if (restedDon.length < 1) continue; // "up to N" — need ≥1 rested DON to activate
          } else {
            // Standard "[DON!! xN]" cost: rest N active DON!!
            const activeDon = (player?.donArea ?? []).filter((id) => {
              const d = next.cards[id];
              return d !== undefined && !d.tapped && d.attachedTo === null;
            });
            if (activeDon.length < cond.count) continue;
            for (const donId of activeDon.slice(0, cond.count)) {
              next = { ...next, cards: { ...next.cards, [donId]: { ...next.cards[donId]!, tapped: true } } };
            }
          }
        } else if (trigger === 'OnAttack') {
          // [DON!! xN] [When Attacking]: use countAttachedDon — tapped/untapped irrelevant.
          if (countAttachedDon(next.cards, context.sourceCardId) < cond.count) continue;
        } else {
          // Other non-Activated triggers (OnKO, OnPlay, etc.):
          // rest N active (untapped, unattached) DON as the cost to activate the effect.
          const activeDon = (player?.donArea ?? []).filter((id) => {
            const d = next.cards[id];
            return d !== undefined && !d.tapped && d.attachedTo === null;
          });
          if (activeDon.length < cond.count) continue;
          for (const donId of activeDon.slice(0, cond.count)) {
            next = { ...next, cards: { ...next.cards, [donId]: { ...next.cards[donId]!, tapped: true } } };
          }
        }
      }
      if (cond.type === 'LeaderHasAttachedDon') {
        if (countAttachedDon(next.cards, context.sourceCardId) < cond.count) continue;
      }
      if (cond.type === 'HasAttachedDon') {
        if (countAttachedDon(next.cards, context.sourceCardId) < cond.count) continue;
      }
      if (cond.type === 'TrashCount') {
        const trashSize = next.players[context.sourcePlayerId]?.trash.length ?? 0;
        if (trashSize < cond.min) continue;
      }
      if (cond.type === 'HasCardOnBoard') {
        const hasCard = Object.values(next.cards).some(
          (c) => c.ownerId === context.sourcePlayerId && c.zone === 'board' && c.name === cond.name,
        );
        const passes = cond.negate === true ? !hasCard : hasCard;
        if (!passes) continue;
      }
      if (cond.type === 'HasBoardCount') {
        const count = Object.values(next.cards).filter((c) =>
          c.ownerId === context.sourcePlayerId &&
          c.zone === 'board' &&
          (cond.cardType === undefined || c.type === cond.cardType),
        ).length;
        if (count < cond.min) continue;
      }
      if (cond.type === 'HasHandCount') {
        const handSize = next.players[context.sourcePlayerId]?.hand.length ?? 0;
        const passes =
          cond.operator === '<=' ? handSize <= cond.count :
          cond.operator === '>=' ? handSize >= cond.count :
          handSize === cond.count;
        if (!passes) continue;
      }
      if (cond.type === 'HasTotalAttachedDon') {
        const totalDon = Object.values(next.cards).filter(
          (d) => d.type === 'DON' && d.attachedTo !== null && (() => {
            const owner = next.cards[d.attachedTo!];
            return owner?.ownerId === context.sourcePlayerId;
          })(),
        ).length;
        if (totalDon < cond.min) continue;
      }
      if (cond.type === 'AnyPlayerHasNoLife') {
        const anyEmpty = Object.values(next.players).some((p) => p.life.length === 0);
        if (!anyEmpty) continue;
      }
      if (cond.type === 'LeaderHasType') {
        const leaderId = next.players[context.sourcePlayerId]?.leader;
        if (!leaderId) continue;
        const leader = next.cards[leaderId];
        if (!hasSubType(leader?.subTypes, cond.subType)) continue;
      }
      if (cond.type === 'LeaderHasAnyType') {
        const leaderId = next.players[context.sourcePlayerId]?.leader;
        if (!leaderId) continue;
        const leader = next.cards[leaderId];
        if (!cond.subTypes.some((t) => hasSubType(leader?.subTypes, t))) continue;
      }
      if (cond.type === 'LeaderIsName') {
        const leaderId = next.players[context.sourcePlayerId]?.leader;
        if (!leaderId) continue;
        const leader = next.cards[leaderId];
        if (leader?.name.includes(cond.name) !== true) continue;
      }
      if (cond.type === 'HasCharacterWithMinPower') {
        // Spec (docs/spec-st21.md §4.1): use CURRENT power (base + DON!! + modifiers).
        // Leader is excluded — only 'Character' type cards on the board count.
        const [cp1, cp2] = next.playerOrder;
        const checkOpponent = cond.controller === 'Opponent';
        const targetPlayerId = checkOpponent
          ? (context.sourcePlayerId === cp1 ? cp2 : cp1)
          : context.sourcePlayerId;
        const board = next.players[targetPlayerId]?.board ?? [];
        const hasOne = board.some((id) => {
          const c = next.cards[id];
          return c !== undefined && c.type === 'Character' && calculatePower(id, next) >= cond.minPower;
        });
        if (!hasOne) continue;
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
            const subType  = (t as { subType?: string }).subType;

            // Check whether at least one valid target exists. Skip (auto-pass) if none.
            const [np1, np2] = next.playerOrder;
            const isOpponentScope = chooseScope === 'ChooseOpponentCharacter' || chooseScope === 'ChooseOpponentCharacterOrLeader';
            const isOrLeader      = chooseScope === 'ChooseOwnCharacterOrLeader' || chooseScope === 'ChooseOpponentCharacterOrLeader';
            const targetPlayerId  = isOpponentScope
              ? (context.sourcePlayerId === np1 ? np2 : np1)
              : context.sourcePlayerId;
            const targetPlayer = next.players[targetPlayerId];
            const pool: readonly CardId[] = [
              ...(targetPlayer?.board ?? []),
              ...(isOrLeader && targetPlayer?.leader != null ? [targetPlayer.leader] : []),
            ];
            const hasValidTarget = pool.some((id) => {
              const c = next.cards[id];
              if (c === undefined) return false;
              if (chooseScope === 'ChooseOwnCharacter' || chooseScope === 'ChooseOpponentCharacter') {
                if (c.type !== 'Character' || c.zone !== 'board') return false;
              }
              if (maxCost  !== undefined && c.cost  > maxCost)                       return false;
              if (maxPower !== undefined && calculatePower(id, next) > maxPower)      return false;
              if (subType  !== undefined && !hasSubType(c.subTypes, subType))           return false;
              return true;
            });
            if (!hasValidTarget) continue; // no targets → skip this ChooseTarget action

            return {
              ...next,
              pendingTargetInteraction: {
                playerId: context.sourcePlayerId,
                scope: chooseScope,
                sourceCardId: context.sourceCardId,
                sourcePlayerId: context.sourcePlayerId,
                ...(maxCost  !== undefined ? { maxCost }  : {}),
                ...(maxPower !== undefined ? { maxPower } : {}),
                ...(subType  !== undefined ? { subType }  : {}),
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

      // Detect ForceDiscard — pause so the opponent can choose which cards to discard
      if (action.type === 'ForceDiscard') {
        const [fp1, fp2] = next.playerOrder;
        const oppId = context.sourcePlayerId === fp1 ? fp2 : fp1;
        const opp = next.players[oppId];
        if (opp !== undefined && opp.hand.length > 0) {
          return {
            ...next,
            pendingForceDiscardInteraction: {
              playerId: oppId,
              count: Math.min(action.count, opp.hand.length),
              pendingEffectActions: effect.actions.slice(ai + 1),
              pendingEffects: effects.slice(ei + 1),
              trigger,
            },
          };
        }
        // Opponent has empty hand — nothing to discard, continue
        continue;
      }

      next = resolveAction(action, context, next);
      // Propagate if a nested resolveEffects call set a pending interaction
      if (next.pendingOnKOInteraction !== null) return next;
      if (next.pendingTargetInteraction !== null) return next;
      if (next.pendingRevealInteraction !== null) return next;
      if (next.pendingTrashInteraction !== null) return next;
      if (next.pendingForceDiscardInteraction !== null) return next;
      if (next.pendingForcedAttack !== null) return next;
    }
  }
  return next;
}
