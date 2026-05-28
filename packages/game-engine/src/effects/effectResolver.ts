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
  HandFilter,
  DeckFilter,
} from '../types/index.js';
import { calculatePower, sendToTrash, drawCards, returnToHand, countAttachedDon, hasKeyword } from '../rules/cardUtils.js';

// ─── Context ──────────────────────────────────────────────────────────────────

export interface EffectContext {
  /** The card whose effect is being resolved */
  readonly sourceCardId: CardId;
  /** The player who controls the source card */
  readonly sourcePlayerId: PlayerId;
  /** Pre-chosen target card ID (from player interaction) — used instead of auto-select */
  readonly chosenTargetId?: CardId;
  /** Card IDs auto-revealed by RevealFromDeck — used for RevealedCardHasType conditions */
  readonly revealedCardIds?: readonly CardId[];
  /**
   * For OnWouldBeKOByEffect external-protection costActions: the ID of the card being protected
   * (the card that would have been KO'd). Used by AddToLife to move the correct card.
   */
  readonly protectedCardId?: CardId;
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
 * Normalize a raw DSL filter that may be missing the `kind` discriminant.
 * Infers the correct DeckFilter variant from the fields present in the object.
 */
function normalizeFilter(raw: unknown): DeckFilter {
  if (!raw || typeof raw !== 'object') return { kind: 'Any' };
  const f = raw as Record<string, unknown>;
  if (typeof f.kind === 'string') return f as unknown as DeckFilter;
  if (Object.keys(f).length === 0) return { kind: 'Any' };
  // { type: 'ByType', value: 'X' } — malformed legacy tag
  if (f['type'] === 'ByType' && typeof f['value'] === 'string') {
    return { kind: 'BySubType', subType: f['value'] };
  }
  // subType / trait / typeIncludes → BySubType
  const stVal = f['subType'] ?? f['trait'] ?? f['typeIncludes'];
  if (typeof stVal === 'string') {
    const ct = f['cardType'] as ('Character' | 'Event' | 'Stage') | undefined;
    return { kind: 'BySubType', subType: stVal, ...(ct !== undefined ? { cardType: ct } : {}) };
  }
  // { type: 'X' } where X is not a cardType enum → BySubType
  if (typeof f['type'] === 'string' && !['Character', 'Event', 'Stage'].includes(f['type'] as string)) {
    const ct = f['cardType'] as ('Character' | 'Event' | 'Stage') | undefined;
    return { kind: 'BySubType', subType: f['type'] as string, ...(ct !== undefined ? { cardType: ct } : {}) };
  }
  // { name: 'X' } → ByName
  if (typeof f['name'] === 'string') return { kind: 'ByName', name: f['name'] };
  // { cardType: 'X', maxCost: N } → ByCost
  if (typeof f['cardType'] === 'string' && typeof f['maxCost'] === 'number') {
    return { kind: 'ByCost', maxCost: f['maxCost'], cardType: f['cardType'] as 'Character' | 'Event' | 'Stage' };
  }
  // { cardType: 'X' } → ByType
  if (typeof f['cardType'] === 'string') {
    return { kind: 'ByType', cardType: f['cardType'] as 'Character' | 'Event' | 'Stage' };
  }
  return { kind: 'Any' };
}

function matchesDeckFilter(c: { type: string; cost: number; name: string; subTypes?: string }, filter: DeckFilter, legacySubType?: string): boolean {
  if (legacySubType !== undefined) {
    return c.subTypes !== undefined && hasSubType(c.subTypes, legacySubType);
  }
  switch (filter.kind) {
    case 'Any': return true;
    case 'ByType': return c.type === filter.cardType;
    case 'ByCost': {
      if (filter.cardType !== undefined && c.type !== filter.cardType) return false;
      return c.cost <= filter.maxCost;
    }
    case 'ByName': return c.name === filter.name;
    case 'BySubType': {
      if (filter.cardType !== undefined && c.type !== filter.cardType) return false;
      if (!hasSubType(c.subTypes, filter.subType)) return false;
      if (filter.excludeNames !== undefined && filter.excludeNames.includes(c.name)) return false;
      return true;
    }
  }
}

/**
 * Resolve a TargetSelector to a list of CardIds.
 * For "Choose" selectors: auto-selects the first valid card (stubs behaviour).
 */
function selectTargets(
  selector: TargetSelector | null | undefined,
  context: EffectContext,
  state: GameState,
): readonly CardId[] {
  if (selector == null) return [];
  const [p1, p2] = state.playerOrder;
  const opponentId = context.sourcePlayerId === p1 ? p2 : p1;
  const ownPlayer   = state.players[context.sourcePlayerId];
  const opponent    = state.players[opponentId];

  switch (selector.scope) {
    case 'Self':
      return [context.sourceCardId];

    case 'Attacker':
      return state.activeCombat !== null ? [state.activeCombat.attackerId] : [];

    case 'OriginalTarget': {
      const rawId = state.activeCombat !== null
        ? state.activeCombat.targetId
        : context.chosenTargetId;
      if (rawId === undefined) return [];
      const card = state.cards[rawId];
      if (selector.maxCost !== undefined && (card?.cost ?? 0) > selector.maxCost) return [];
      return [rawId];
    }

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
      if (selector.maxPower !== undefined || subType !== undefined || selector.name !== undefined) {
        return (ownPlayer?.board ?? []).filter((id) => {
          const card = state.cards[id];
          if (card === undefined) return false;
          if (selector.maxPower !== undefined && (card.power ?? 0) > selector.maxPower) return false;
          if (subType !== undefined && !hasSubType(card.subTypes, subType)) return false;
          if (selector.name !== undefined && card.name !== selector.name) return false;
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
        const effectiveCost = card.cost + (card.costModifier ?? 0);
        if (selector.maxCost  !== undefined && effectiveCost > selector.maxCost) return false;
        if (selector.maxPower !== undefined && calculatePower(id, state) > selector.maxPower) return false;
        if (selector.minPower !== undefined && calculatePower(id, state) < selector.minPower) return false;
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
        const effectiveCost = card.cost + (card.costModifier ?? 0);
        if (selector.maxCost  !== undefined && effectiveCost > selector.maxCost) return false;
        if (selector.maxPower !== undefined && calculatePower(id, state) > selector.maxPower) return false;
        if (selector.minPower !== undefined && calculatePower(id, state) < selector.minPower) return false;
        if (selector.subType  !== undefined && !hasSubType(card.subTypes, selector.subType)) return false;
        if (selector.attribute !== undefined) {
          const attr = (card as { attribute?: string }).attribute;
          if (attr !== selector.attribute) return false;
        }
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
        if (selector.minPower !== undefined && calculatePower(id, state) < selector.minPower) return false;
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
        if (selector.minPower !== undefined && calculatePower(id, state) < selector.minPower) return false;
        if (selector.subType  !== undefined && !hasSubType(card.subTypes, selector.subType)) return false;
        return true;
      };
      if (context.chosenTargetId !== undefined && pool.includes(context.chosenTargetId) && matchesFilters(context.chosenTargetId)) {
        return [context.chosenTargetId];
      }
      const candidates = pool.filter(matchesFilters);
      return candidates.length > 0 ? [candidates[0]!] : [];
    }

    case 'ChooseOpponentDon': {
      // Select 1 unattached opponent DON!! card from their donArea
      const pool = (opponent?.donArea ?? []).filter((id) => {
        const card = state.cards[id];
        return card?.type === 'DON' && card.attachedTo === null;
      });
      if (context.chosenTargetId !== undefined && pool.includes(context.chosenTargetId)) {
        return [context.chosenTargetId];
      }
      return pool.length > 0 ? [pool[0]!] : [];
    }

    case 'ChooseOpponentCharacterOrDon': {
      const pool: CardId[] = [...(opponent?.board ?? [])];
      // Add unattached opponent DON!! cards
      for (const id of (opponent?.donArea ?? [])) {
        const card = state.cards[id];
        if (card?.type === 'DON' && card.attachedTo === null) pool.push(id);
      }
      const matchesFilters = (id: CardId): boolean => {
        const card = state.cards[id];
        if (card === undefined) return false;
        if (selector.maxCost !== undefined && card.type !== 'DON' && card.cost > selector.maxCost) return false;
        return true;
      };
      if (context.chosenTargetId !== undefined && pool.includes(context.chosenTargetId) && matchesFilters(context.chosenTargetId)) {
        return [context.chosenTargetId];
      }
      const candidates = pool.filter(matchesFilters);
      return candidates.length > 0 ? [candidates[0]!] : [];
    }

    case 'ChooseOwnCharacterOrDon': {
      const pool: CardId[] = [...(ownPlayer?.board ?? [])];
      // Add unattached own DON!! cards
      for (const id of (ownPlayer?.donArea ?? [])) {
        const card = state.cards[id];
        if (card?.type === 'DON' && card.attachedTo === null) pool.push(id);
      }
      if (context.chosenTargetId !== undefined && pool.includes(context.chosenTargetId)) {
        return [context.chosenTargetId];
      }
      return pool.length > 0 ? [pool[0]!] : [];
    }
  }
  return [];
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
        // CannotBeKOdByEffect keyword prevents KO by card effects
        if (card !== undefined && hasKeyword(card, 'CannotBeKOdByEffect')) continue;
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
      const isOT        = action.duration === 'EndOfOpponentTurn';
      const isBattle    = action.duration === 'EndOfBattle';
      const isPermanent = action.duration === 'Permanent';
      for (const id of targets) {
        const card = state.cards[id];
        if (card !== undefined) {
          updatedCards[id] = isOT
            ? { ...card, powerModifierOT:         (card.powerModifierOT         ?? 0) + action.amount }
            : isBattle
            ? { ...card, powerModifierBattle:     (card.powerModifierBattle     ?? 0) + action.amount }
            : isPermanent
            ? { ...card, permanentPowerModifier:  (card.permanentPowerModifier  ?? 0) + action.amount }
            : { ...card, powerModifier:           (card.powerModifier           ?? 0) + action.amount };
        }
      }
      const boostedState: GameState = { ...state, cards: updatedCards as Readonly<Record<CardId, Card>> };
      const targetNames = targets.map((id) => boostedState.cards[id]?.name ?? id).join(', ');
      const srcName = boostedState.cards[context.sourceCardId]?.name ?? context.sourceCardId;
      return {
        ...boostedState,
        gameLog: [...boostedState.gameLog, {
          seq: boostedState.gameLog.length,
          event: 'POWER_BOOST_APPLIED' as const,
          message: `Power ${action.amount > 0 ? '+' : ''}${action.amount} → ${targetNames} (by "${srcName}")`,
          cardId: context.sourceCardId,
          cardName: boostedState.cards[context.sourceCardId]?.name,
          playerId: context.sourcePlayerId,
          turn: boostedState.turnNumber,
          details: { amount: action.amount },
        }],
      };
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
      const justRested: CardId[] = [];
      for (const id of targets) {
        const card = state.cards[id];
        // Attached DON!! cards cannot be tapped/untapped by effects (OPTCG rule)
        if (card !== undefined && !(card.type === 'DON' && card.attachedTo !== null)) {
          // CannotBeRested blocks resting by opponent effects only
          if (card.ownerId !== context.sourcePlayerId && hasKeyword(card, 'CannotBeRested')) continue;
          if (!card.tapped) justRested.push(id); // track newly rested
          updatedCards[id] = { ...card, tapped: true };
        }
      }
      let next: GameState = { ...state, cards: updatedCards as Readonly<Record<CardId, Card>> };
      // Fire OnRested for each card that just became rested
      for (const id of justRested) {
        const card = next.cards[id];
        if (card?.effects?.some((e) => e.trigger === 'OnRested')) {
          next = resolveEffects(card.effects, 'OnRested', { sourceCardId: id, sourcePlayerId: card.ownerId }, next);
        }
      }
      return next;
    }

    // ── RemoveLife ────────────────────────────────────────────────────────────
    case 'RemoveLife': {
      const [rl1, rl2] = state.playerOrder;
      const removeFromId = action.scope === 'opponent'
        ? (context.sourcePlayerId === rl1 ? rl2 : rl1)
        : context.sourcePlayerId;
      const player = state.players[removeFromId];
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
        players: { ...state.players, [removeFromId]: updatedPlayer },
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

      // No lookCount/count: auto-pick the first matching card (backwards-compatible, bot-friendly)
      // The lookCount/count path is intercepted in resolveEffects (before resolveAction is called)
      // so that pendingEffectActions can be stored for resumption after the player chooses.
      const nf = normalizeFilter(action.filter);
      const foundIdx = player.deck.findIndex((id) => {
        const card = state.cards[id];
        if (card === undefined) return false;
        switch (nf.kind) {
          case 'Any': return true;
          case 'ByType': return card.type === nf.cardType;
          case 'ByCost': {
            const typeOk = nf.cardType === undefined || card.type === nf.cardType;
            return typeOk && card.cost <= nf.maxCost;
          }
          case 'ByName': return card.name === nf.name;
          case 'BySubType': {
            const typeOk = nf.cardType === undefined || card.type === nf.cardType;
            if (!typeOk || !hasSubType(card.subTypes, nf.subType)) return false;
            if (nf.excludeNames !== undefined && nf.excludeNames.includes(card.name)) return false;
            return true;
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
    // Intercepted in resolveEffects before reaching here (sets pendingRevealInteraction).
    // This case is unreachable in normal effect resolution flow.
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

    // ── ProportionalPowerBoost ───────────────────────────────────────────────
    case 'ProportionalPowerBoost': {
      const player = state.players[context.sourcePlayerId];
      if (player === undefined) return state;

      let count = 0;
      switch (action.per) {
        case 'CardsInTrash':
          count = player.trash.length;
          break;
        case 'EventsInTrash':
          count = player.trash.filter((id) => {
            const c = state.cards[id];
            return c !== undefined && c.type === 'Event';
          }).length;
          break;
        case 'CardsInHand':
          count = player.hand.length;
          break;
        case 'RestingDon': {
          count = player.donArea.filter((id) => {
            const c = state.cards[id];
            return c !== undefined && c.tapped === true;
          }).length;
          break;
        }
        case 'AttachedDon': {
          // Computed per-target below
          break;
        }
      }

      const divisor = action.divisor ?? 1;
      const targets = selectTargets(action.target, context, state);
      const isOT     = action.duration === 'EndOfOpponentTurn';
      const isBattle = action.duration === 'EndOfBattle';
      let nextState = state;
      for (const cardId of targets) {
        const card = nextState.cards[cardId];
        if (card === undefined) continue;
        const unitCount = action.per === 'AttachedDon'
          ? Object.values(nextState.cards).filter(
              (c) => c !== undefined && c.attachedTo === cardId && c.type === 'DON',
            ).length
          : count;
        let boostAmount = Math.floor(unitCount / divisor) * action.amount;
        if (action.max !== undefined) boostAmount = Math.min(boostAmount, action.max);
        const field = isOT ? 'powerModifierOT' : isBattle ? 'powerModifierBattle' : 'powerModifier';
        const current = card[field] ?? 0;
        nextState = { ...nextState, cards: { ...nextState.cards, [cardId]: { ...card, [field]: current + boostAmount } } };
      }
      const targetNames = targets.map((id) => nextState.cards[id]?.name ?? id).join(', ');
      const srcName = nextState.cards[context.sourceCardId]?.name ?? context.sourceCardId;
      return {
        ...nextState,
        gameLog: [...nextState.gameLog, {
          seq: nextState.gameLog.length,
          event: 'EFFECT_TRIGGERED' as const,
          message: `${srcName} ProportionalPowerBoost (per ${action.per}) → ${targetNames}`,
        }],
      };
    }

    // ── TakeFromLife ─────────────────────────────────────────────────────────
    case 'TakeFromLife': {
      const player = state.players[context.sourcePlayerId];
      if (player === undefined || player.life.length === 0) return state;
      if (player.lifeToHandBlocked === true) return state;
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

    // ── TrashSelf ─────────────────────────────────────────────────────────────
    // Used as automatic cost for external KO-protection effects (Group 1).
    case 'TrashSelf': {
      const selfCard = state.cards[context.sourceCardId];
      if (!selfCard || selfCard.zone === 'trash') return state;
      return sendToTrash(state, context.sourceCardId);
    }

    // ── ModifyCost ────────────────────────────────────────────────────────────
    // Permanent cost reduction — handled by computePlayCost(), not inline here.
    case 'ModifyCost':
      return state;

    // ── SetAllDonActive ───────────────────────────────────────────────────────
    case 'SetAllDonActive': {
      const player = state.players[context.sourcePlayerId];
      if (player === undefined) return state;
      const updatedCards: Record<string, Card> = { ...state.cards };
      for (const id of player.donArea) {
        const don = updatedCards[id];
        if (don !== undefined && don.tapped) {
          updatedCards[id] = { ...don, tapped: false };
        }
      }
      return { ...state, cards: updatedCards as Readonly<Record<CardId, Card>> };
    }

    // ── RestDon ───────────────────────────────────────────────────────────────
    case 'RestDon': {
      const player = state.players[context.sourcePlayerId];
      if (player === undefined) return state;
      const activeDon = player.donArea.filter((id) => {
        const don = state.cards[id];
        return don !== undefined && !don.tapped && don.attachedTo === null;
      });
      const toRest = activeDon.slice(0, action.count);
      if (toRest.length === 0) return state;
      const updatedCards: Record<string, Card> = { ...state.cards };
      for (const id of toRest) {
        updatedCards[id] = { ...updatedCards[id]!, tapped: true };
      }
      return { ...state, cards: updatedCards as Readonly<Record<CardId, Card>> };
    }

    // ── ReturnDonToDeck ───────────────────────────────────────────────────────
    case 'ReturnDonToDeck': {
      const player = state.players[context.sourcePlayerId];
      if (player === undefined) return state;
      const freeDon = player.donArea.filter((id) => {
        const don = state.cards[id];
        return don !== undefined && !don.tapped && don.attachedTo === null;
      });
      const toReturn = freeDon.slice(0, action.count);
      if (toReturn.length === 0) return state;
      const updatedCards: Record<string, Card> = { ...state.cards };
      for (const id of toReturn) {
        updatedCards[id] = { ...updatedCards[id]!, zone: 'donDeck' as const };
      }
      return {
        ...state,
        cards: updatedCards as Readonly<Record<CardId, Card>>,
        players: {
          ...state.players,
          [context.sourcePlayerId]: {
            ...player,
            donArea: player.donArea.filter((id) => !toReturn.includes(id)),
            donDeck: [...player.donDeck, ...toReturn],
          },
        },
      };
    }

    // ── AddDon ────────────────────────────────────────────────────────────────
    case 'AddDon': {
      const player = state.players[context.sourcePlayerId];
      if (player === undefined) return state;
      const available = Math.min(action.count, player.donDeck.length);
      if (available === 0) return state;
      const drawn = player.donDeck.slice(0, available);
      const remaining = player.donDeck.slice(available);
      const updatedCards: Record<string, Card> = { ...state.cards };
      for (const id of drawn) {
        updatedCards[id] = { ...updatedCards[id]!, zone: 'donArea' as const, tapped: action.active ? false : true };
      }
      const updatedPlayer: PlayerState = {
        ...player,
        donDeck: remaining,
        donArea: [...player.donArea, ...drawn],
      };
      return {
        ...state,
        cards: updatedCards as Readonly<Record<CardId, Card>>,
        players: { ...state.players, [context.sourcePlayerId]: updatedPlayer },
      };
    }

    // ── GiveTemporaryCostModifier ─────────────────────────────────────────────
    case 'GiveTemporaryCostModifier': {
      const targets = selectTargets(action.target, context, state);
      if (targets.length === 0) return state;
      let next = state;
      for (const id of targets) {
        const card = next.cards[id];
        if (card === undefined) continue;
        const current = card.costModifier ?? 0;
        next = { ...next, cards: { ...next.cards, [id]: { ...card, costModifier: current + action.amount } } };
      }
      return next;
    }

    // ── ChooseOne ─────────────────────────────────────────────────────────────
    // Intercepted in resolveEffects before reaching here; this case is unreachable.
    case 'ChooseOne':
      return state;

    // ── SetBasePower ──────────────────────────────────────────────────────────
    case 'SetBasePower': {
      const targets = selectTargets(action.target, context, state);
      if (targets.length === 0) return state;
      let next = state;
      for (const cardId of targets) {
        const card = next.cards[cardId];
        if (card === undefined) continue;
        next = { ...next, cards: { ...next.cards, [cardId]: { ...card, power: action.amount } } };
      }
      return next;
    }

    // ── PreventRefresh ────────────────────────────────────────────────────────
    case 'PreventRefresh': {
      const targets = selectTargets(action.target, context, state);
      if (targets.length === 0) return state;
      let next = state;
      for (const cardId of targets) {
        const card = next.cards[cardId];
        if (card === undefined || !card.tapped) continue; // only rested cards
        next = { ...next, cards: { ...next.cards, [cardId]: { ...card, preventNextRefresh: true } } };
      }
      return next;
    }

    case 'RecoverOpponentTrash': {
      // Opponent returns `count` cards from their trash to the bottom of their deck
      const [p1, p2] = state.playerOrder;
      const opponentId = context.sourcePlayerId === p1 ? p2 : p1;
      const oppPlayer = state.players[opponentId];
      if (oppPlayer === undefined) return state;
      const count = Math.min(action.count, oppPlayer.trash.length);
      if (count === 0) return state;
      const toReturn = oppPlayer.trash.slice(-count); // last N cards from trash (oldest)
      const updatedCards = { ...state.cards };
      for (const id of toReturn) {
        const c = updatedCards[id];
        if (c !== undefined) updatedCards[id] = { ...c, zone: 'deck' as const };
      }
      const updatedOpp: PlayerState = {
        ...oppPlayer,
        trash: oppPlayer.trash.filter((id) => !toReturn.includes(id)),
        deck: [...oppPlayer.deck, ...toReturn],
      };
      return { ...state, cards: updatedCards as Readonly<Record<CardId, Card>>, players: { ...state.players, [opponentId]: updatedOpp } };
    }

    case 'HandToDeck': {
      // Move all cards from own or opponent's hand to the bottom of their deck, then shuffle (simplified: just append)
      const [p1, p2] = state.playerOrder;
      const targetPlayerId = action.scope === 'opponent'
        ? (context.sourcePlayerId === p1 ? p2 : p1)
        : context.sourcePlayerId;
      const targetPlayer = state.players[targetPlayerId];
      if (targetPlayer === undefined) return state;
      const hand = [...targetPlayer.hand];
      if (hand.length === 0) {
        // Nothing to return, but still draw if specified
        if (action.thenDraw !== undefined && action.thenDraw > 0 && action.scope === 'own') {
          let next = state;
          for (let i = 0; i < action.thenDraw; i++) {
            const player = next.players[context.sourcePlayerId];
            if (!player || player.deck.length === 0) break;
            const cardId = player.deck[0]!;
            const card = next.cards[cardId];
            if (card === undefined) break;
            next = { ...next, cards: { ...next.cards, [cardId]: { ...card, zone: 'hand' as const } }, players: { ...next.players, [context.sourcePlayerId]: { ...player, deck: player.deck.slice(1), hand: [...player.hand, cardId] } } };
          }
          return next;
        }
        return state;
      }
      const updatedCards = { ...state.cards };
      for (const id of hand) {
        const c = updatedCards[id];
        if (c !== undefined) updatedCards[id] = { ...c, zone: 'deck' as const };
      }
      const updatedPlayer: PlayerState = {
        ...targetPlayer,
        hand: [],
        deck: [...targetPlayer.deck, ...hand],
      };
      let next: GameState = { ...state, cards: updatedCards as Readonly<Record<CardId, Card>>, players: { ...state.players, [targetPlayerId]: updatedPlayer } };
      // Draw cards after shuffling hand into deck (own only)
      if (action.thenDraw !== undefined && action.thenDraw > 0 && action.scope === 'own') {
        const drawCount = Math.min(action.thenDraw, next.players[context.sourcePlayerId]?.deck.length ?? 0);
        for (let i = 0; i < drawCount; i++) {
          const player = next.players[context.sourcePlayerId];
          if (!player || player.deck.length === 0) break;
          const cardId = player.deck[0]!;
          const card = next.cards[cardId];
          if (card === undefined) break;
          next = { ...next, cards: { ...next.cards, [cardId]: { ...card, zone: 'hand' as const } }, players: { ...next.players, [context.sourcePlayerId]: { ...player, deck: player.deck.slice(1), hand: [...player.hand, cardId] } } };
        }
      }
      return next;
    }

    case 'RecoverTrashToDeck': {
      const player = state.players[context.sourcePlayerId];
      if (player === undefined) return state;
      const eligible = player.trash.filter((id) => {
        const c = state.cards[id];
        if (c === undefined) return false;
        const f = action.filter;
        if (!f) return true;
        if (f.cardType !== undefined && c.type !== f.cardType) return false;
        if (f.subType !== undefined && !hasSubType(c.subTypes, f.subType)) return false;
        return true;
      });
      const count = Math.min(action.count, eligible.length);
      if (count === 0) return state;
      const toReturn = eligible.slice(-count);
      const updatedCards = { ...state.cards };
      for (const id of toReturn) {
        const c = updatedCards[id];
        if (c !== undefined) updatedCards[id] = { ...c, zone: 'deck' as const };
      }
      const updatedPlayer: PlayerState = {
        ...player,
        trash: player.trash.filter((id) => !toReturn.includes(id)),
        deck: [...player.deck, ...toReturn],
      };
      return { ...state, cards: updatedCards as Readonly<Record<CardId, Card>>, players: { ...state.players, [context.sourcePlayerId]: updatedPlayer } };
    }

    // ── LookAtLife ────────────────────────────────────────────────────────────
    case 'LookAtLife': {
      // Reveal top N life cards of target player. For bots / auto-resolve: just proceed (no real reveal needed).
      // For humans: create pendingLifeInteraction mode:'LookOnly' so the UI can show the cards.
      const [p1, p2] = state.playerOrder;
      const lifeOwnerId = action.target === 'opponent'
        ? (context.sourcePlayerId === p1 ? p2 : p1)
        : context.sourcePlayerId;
      const lifeOwner = state.players[lifeOwnerId];
      if (lifeOwner === undefined || lifeOwner.life.length === 0) return state;
      const count = Math.min(action.count ?? lifeOwner.life.length, lifeOwner.life.length);
      const lifeCards = lifeOwner.life.slice(0, count);
      return {
        ...state,
        pendingLifeInteraction: {
          playerId: context.sourcePlayerId,
          sourceCardId: context.sourceCardId,
          mode: 'LookOnly',
          lifeCards,
          lifeOwnerId,
          pendingEffectActions: [],
          pendingEffects: [],
          trigger: 'OnPlay' as const,
        },
      };
    }

    // ── RearrangeLife ─────────────────────────────────────────────────────────
    case 'RearrangeLife': {
      // Intercepted in resolveEffects before reaching here (sets pendingLifeInteraction).
      return state;
    }

    // ── TakeLifeToHand ────────────────────────────────────────────────────────
    case 'TakeLifeToHand': {
      // Intercepted in resolveEffects before reaching here (sets pendingLifeInteraction).
      return state;
    }

    // ── MoveLifeCard ──────────────────────────────────────────────────────────
    case 'MoveLifeCard': {
      // Intercepted in resolveEffects before reaching here (sets pendingLifeInteraction).
      return state;
    }

    // ── NegateEffect ─────────────────────────────────────────────────────────
    case 'NegateEffect': {
      const targets = selectTargets(action.target, context, state);
      if (targets.length === 0) return state;
      const updatedCards: Record<string, Card> = { ...state.cards };
      for (const id of targets) {
        const card = state.cards[id];
        if (card !== undefined) {
          updatedCards[id] = { ...card, effectsNegated: true };
        }
      }
      return { ...state, cards: updatedCards as Readonly<Record<CardId, Card>> };
    }

    // ── StealCard ─────────────────────────────────────────────────────────────
    case 'StealCard': {
      const [fp1, fp2] = state.playerOrder;
      const oppId = context.sourcePlayerId === fp1 ? fp2 : fp1;
      const opp = state.players[oppId];
      const ownPlayer = state.players[context.sourcePlayerId];
      if (opp === undefined || ownPlayer === undefined) return state;
      const candidates = opp.board.filter((id) => {
        const c = state.cards[id];
        if (c === undefined || c.type === 'Leader') return false;
        if (action.filter?.subType !== undefined && !(c.subTypes ?? '').includes(action.filter.subType)) return false;
        if (action.filter?.subTypes !== undefined && !action.filter.subTypes.some((t) => (c.subTypes ?? '').includes(t))) return false;
        if (action.filter?.maxCost !== undefined && c.cost > action.filter.maxCost) return false;
        return true;
      });
      if (candidates.length === 0) return state;
      const stolenId = candidates[0]!;
      const stolen = state.cards[stolenId];
      if (stolen === undefined) return state;
      return {
        ...state,
        cards: {
          ...state.cards,
          [stolenId]: { ...stolen, zone: 'hand' as const, ownerId: context.sourcePlayerId, tapped: false, attachedTo: null },
        },
        players: {
          ...state.players,
          [oppId]: { ...opp, board: opp.board.filter((id) => id !== stolenId) },
          [context.sourcePlayerId]: { ...ownPlayer, hand: [...ownPlayer.hand, stolenId] },
        },
      };
    }

    // ── SetCostToZero ─────────────────────────────────────────────────────────
    case 'SetCostToZero': {
      const targets = selectTargets(action.target, context, state);
      if (targets.length === 0) return state;
      let next = state;
      for (const id of targets) {
        const card = next.cards[id];
        if (card === undefined) continue;
        if (action.filter?.noBaseEffect === true) {
          const effectsArr = card.effects;
          const hasEffects = Array.isArray(effectsArr) && effectsArr.length > 0;
          if (hasEffects) continue;
        }
        const zeroCost = -(card.cost + (card.costModifier ?? 0));
        next = { ...next, cards: { ...next.cards, [id]: { ...card, costModifier: zeroCost } } };
      }
      return next;
    }

    // ── SwapBasePower ─────────────────────────────────────────────────────────
    // TODO: power swap reversal at end of turn is not yet implemented.
    case 'SwapBasePower': {
      const targets = selectTargets(action.target, context, state);
      if (targets.length < 2) return state;
      const [idA, idB] = [targets[0]!, targets[1]!];
      const cardA = state.cards[idA];
      const cardB = state.cards[idB];
      if (cardA === undefined || cardB === undefined) return state;
      return {
        ...state,
        cards: {
          ...state.cards,
          [idA]: { ...cardA, power: cardB.power },
          [idB]: { ...cardB, power: cardA.power },
        },
      };
    }

    // ── SetBasePowerToLeader ──────────────────────────────────────────────────
    case 'SetBasePowerToLeader': {
      const leaderId = state.players[context.sourcePlayerId]?.leader;
      if (leaderId === undefined || leaderId === null) return state;
      const leader = state.cards[leaderId];
      if (leader === undefined) return state;
      const leaderPower = leader.power;
      const targets = selectTargets(action.target, context, state);
      if (targets.length === 0) return state;
      let next = state;
      for (const cardId of targets) {
        const card = next.cards[cardId];
        if (card === undefined) continue;
        next = { ...next, cards: { ...next.cards, [cardId]: { ...card, power: leaderPower } } };
      }
      return next;
    }

    // ── PlaceAllCharactersAtBottom ────────────────────────────────────────────
    case 'PlaceAllCharactersAtBottom': {
      const player = state.players[context.sourcePlayerId];
      if (player === undefined) return state;
      const toMove = player.board.filter((id) => {
        if (id === context.sourceCardId) return false;
        const c = state.cards[id];
        return c !== undefined && c.type === 'Character';
      });
      if (toMove.length === 0) return state;
      let next = state;
      for (const cardId of toMove) {
        const card = next.cards[cardId];
        if (card === undefined) continue;
        const owner = next.players[card.ownerId];
        if (owner === undefined) continue;
        // Detach any attached DON
        const updatedCards: Record<string, Card> = { ...next.cards };
        const attachedDon = Object.keys(next.cards).filter((k) => {
          const d = next.cards[k as CardId];
          return d !== undefined && d.type === 'DON' && d.attachedTo === cardId;
        }) as CardId[];
        for (const donId of attachedDon) {
          const don = updatedCards[donId];
          if (don !== undefined) updatedCards[donId] = { ...don, attachedTo: null, tapped: false };
        }
        updatedCards[cardId] = { ...card, zone: 'deck' as const, tapped: false };
        const updatedPlayer: PlayerState = {
          ...owner,
          board: owner.board.filter((id) => id !== cardId),
          deck: [...owner.deck, cardId],
        };
        next = {
          ...next,
          cards: updatedCards as Readonly<Record<CardId, Card>>,
          players: { ...next.players, [card.ownerId]: updatedPlayer },
        };
      }
      return next;
    }

    // ── AddToLife ─────────────────────────────────────────────────────────────
    case 'AddToLife': {
      // For external protection (OP11-101): move the protected card, not the protector
      const targetId = context.protectedCardId ?? context.sourceCardId;
      const card = state.cards[targetId];
      if (card === undefined) return state;
      const owner = state.players[card.ownerId];
      if (owner === undefined) return state;
      // Move card from board to top of life zone (face-down)
      const updatedCards: Record<string, Card> = {
        ...state.cards,
        [targetId]: { ...card, zone: 'life' as const, tapped: false, faceUp: undefined },
      };
      const updatedPlayer: PlayerState = {
        ...owner,
        board: owner.board.filter((id) => id !== targetId),
        life: [targetId, ...owner.life],
      };
      return {
        ...state,
        cards: updatedCards as Readonly<Record<CardId, Card>>,
        players: { ...state.players, [card.ownerId]: updatedPlayer },
      };
    }

    // ── PlaceOwnCharacterAtBottom ─────────────────────────────────────────────
    case 'PlaceOwnCharacterAtBottom': {
      const player = state.players[context.sourcePlayerId];
      if (player === undefined) return state;
      const candidates = player.board.filter((id) => {
        if (id === context.sourceCardId) return false;
        const c = state.cards[id];
        return c !== undefined && c.type === 'Character';
      });
      const toMove = candidates.slice(0, action.count);
      if (toMove.length === 0) return state;
      let next = state;
      for (const cardId of toMove) {
        const card = next.cards[cardId];
        if (card === undefined) continue;
        const owner = next.players[card.ownerId];
        if (owner === undefined) continue;
        // Detach any attached DON
        const updatedCards: Record<string, Card> = { ...next.cards };
        const attachedDon = Object.keys(next.cards).filter((k) => {
          const d = next.cards[k as CardId];
          return d !== undefined && d.type === 'DON' && d.attachedTo === cardId;
        }) as CardId[];
        for (const donId of attachedDon) {
          const don = updatedCards[donId];
          if (don !== undefined) updatedCards[donId] = { ...don, attachedTo: null, tapped: false };
        }
        updatedCards[cardId] = { ...card, zone: 'deck' as const, tapped: false };
        const updatedPlayer: PlayerState = {
          ...owner,
          board: owner.board.filter((id) => id !== cardId),
          deck: [...owner.deck, cardId],
        };
        next = {
          ...next,
          cards: updatedCards as Readonly<Record<CardId, Card>>,
          players: { ...next.players, [card.ownerId]: updatedPlayer },
        };
      }
      return next;
    }

    // ── SetActive ─────────────────────────────────────────────────────────────
    case 'SetActive': {
      const targets = selectTargets(action.target, context, state);
      if (targets.length === 0) return state;
      const updatedCards: Record<string, Card> = { ...state.cards };
      for (const id of targets) {
        const card = updatedCards[id];
        if (card !== undefined) updatedCards[id] = { ...card, tapped: false };
      }
      return { ...state, cards: updatedCards as Readonly<Record<CardId, Card>> };
    }

    // ── CannotAddLifeToHand ───────────────────────────────────────────────────
    case 'CannotAddLifeToHand': {
      const player = state.players[context.sourcePlayerId];
      if (player === undefined) return state;
      return {
        ...state,
        players: { ...state.players, [context.sourcePlayerId]: { ...player, lifeToHandBlocked: true } },
      };
    }

    default:
      // Unknown action type — silently ignore rather than returning undefined.
      return state;
  }
}

// ─── Pure condition evaluator (used by OR and computePlayCost) ───────────────

function evalCondPure(
  cond: import('../types/index.js').EffectCondition,
  context: EffectContext,
  state: GameState,
  opponentId: PlayerId,
): boolean {
  switch (cond.type) {
    case 'Always': return true;
    case 'TurnCount': {
      const t = state.turnNumber;
      if (cond.min !== undefined && t < cond.min) return false;
      if (cond.max !== undefined && t > cond.max) return false;
      return true;
    }
    case 'TrashCount':
      return (state.players[context.sourcePlayerId]?.trash.length ?? 0) >= cond.min;
    case 'HasCardOnBoard': {
      const has = Object.values(state.cards).some(
        (c) => c.ownerId === context.sourcePlayerId && c.zone === 'board' && (cond.name === undefined || c.name === cond.name),
      );
      return cond.negate === true ? !has : has;
    }
    case 'HasBoardCount': {
      const count = Object.values(state.cards).filter(
        (c) => c.ownerId === context.sourcePlayerId && c.zone === 'board' && (cond.cardType === undefined || c.type === cond.cardType),
      ).length;
      return count >= cond.min;
    }
    case 'HasHandCount': {
      const handSize = state.players[context.sourcePlayerId]?.hand.length ?? 0;
      return cond.operator === '<=' ? handSize <= cond.count :
             cond.operator === '>=' ? handSize >= cond.count :
             handSize === cond.count;
    }
    case 'HandCount': {
      const handSize = state.players[context.sourcePlayerId]?.hand.length ?? 0;
      if (cond.max !== undefined && handSize > cond.max) return false;
      if (cond.min !== undefined && handSize < cond.min) return false;
      return true;
    }
    case 'OpponentHandCount': {
      const oppHandSize = state.players[opponentId]?.hand.length ?? 0;
      if (cond.value !== undefined) {
        if (cond.operator === 'GreaterThanOrEqual') return oppHandSize >= cond.value;
        if (cond.operator === 'LessThanOrEqual') return oppHandSize <= cond.value;
        return oppHandSize === cond.value;
      }
      return true;
    }
    case 'LifeCount': {
      const lifeCount = state.players[context.sourcePlayerId]?.life.length ?? 0;
      if (cond.max !== undefined && lifeCount > cond.max) return false;
      if (cond.min !== undefined && lifeCount < cond.min) return false;
      if (cond.value !== undefined) {
        if (cond.comparison === 'LessOrEqual') return lifeCount <= cond.value;
        if (cond.comparison === 'GreaterOrEqual') return lifeCount >= cond.value;
        if (cond.comparison === 'Equal') return lifeCount === cond.value;
      }
      return true;
    }
    case 'OpponentLifeCount': {
      const oppLife = state.players[opponentId]?.life.length ?? 0;
      if (cond.max !== undefined && oppLife > cond.max) return false;
      if (cond.min !== undefined && oppLife < cond.min) return false;
      if (cond.value !== undefined) {
        const c = cond.comparison;
        if (c === 'LessThanOrEqual' || c === 'LessOrEqual') return oppLife <= cond.value;
        if (c === 'GreaterThanOrEqual' || c === 'GreaterOrEqual') return oppLife >= cond.value;
        if (c === 'Equal') return oppLife === cond.value;
      }
      return true;
    }
    case 'OpponentLife': {
      const oppLife2 = state.players[opponentId]?.life.length ?? 0;
      if (cond.value !== undefined) {
        const c = cond.comparison;
        if (c === 'LessOrEqual' || c === 'LessThanOrEqual') return oppLife2 <= cond.value;
        if (c === 'GreaterOrEqual') return oppLife2 >= cond.value;
        return oppLife2 === cond.value;
      }
      return true;
    }
    case 'HasFewerLifeThanOpponent':
    case 'PlayerLifeLessThanOpponent': {
      const ownLife = state.players[context.sourcePlayerId]?.life.length ?? 0;
      const oppLife3 = state.players[opponentId]?.life.length ?? 0;
      return ownLife < oppLife3;
    }
    case 'HasLife': {
      const ownLife4 = state.players[context.sourcePlayerId]?.life.length ?? 0;
      // { comparison: 'less', opponent: true } means "own life < opponent life"
      if (cond.opponent === true && cond.comparison === 'less') {
        const oppLife4 = state.players[opponentId]?.life.length ?? 0;
        return ownLife4 < oppLife4;
      }
      if (cond.value !== undefined) {
        if (cond.comparison === 'LessThanOrEqual') return ownLife4 <= cond.value;
        if (cond.comparison === 'GreaterThanOrEqual') return ownLife4 >= cond.value;
      }
      return true;
    }
    case 'HasLifeCards': {
      const ownLife5 = state.players[context.sourcePlayerId]?.life.length ?? 0;
      if (cond.value !== undefined) {
        if (cond.operator === 'LessOrEqual') return ownLife5 <= cond.value;
        if (cond.operator === 'GreaterOrEqual') return ownLife5 >= cond.value;
        if (cond.operator === 'Equal') return ownLife5 === cond.value;
      }
      return true;
    }
    case 'HasLifeOrLess': {
      const ownLife6 = state.players[context.sourcePlayerId]?.life.length ?? 0;
      return cond.value === undefined || ownLife6 <= cond.value;
    }
    case 'HasPower': {
      const power = calculatePower(context.sourceCardId, state);
      if (cond.minPower !== undefined && power < cond.minPower) return false;
      if (cond.maxPower !== undefined && power > cond.maxPower) return false;
      return true;
    }
    case 'CardPower': {
      const power2 = calculatePower(context.sourceCardId, state);
      if (cond.amount !== undefined) {
        if (cond.comparison === 'GreaterThanOrEqual') return power2 >= cond.amount;
        if (cond.comparison === 'LessOrEqual') return power2 <= cond.amount;
        if (cond.comparison === 'Equal') return power2 === cond.amount;
      }
      return true;
    }
    case 'LeaderHasLife': {
      const leaderId = state.players[context.sourcePlayerId]?.leader;
      if (!leaderId) return true;
      const leaderOwner = state.cards[leaderId]?.ownerId;
      const lifeCount = leaderOwner !== undefined ? (state.players[leaderOwner]?.life.length ?? 0) : 0;
      if (cond.value !== undefined) {
        if (cond.comparison === 'LessOrEqual') return lifeCount <= cond.value;
        if (cond.comparison === 'GreaterOrEqual') return lifeCount >= cond.value;
        if (cond.comparison === 'Equal') return lifeCount === cond.value;
      }
      return true;
    }
    case 'LifeComparison': {
      const ownLc = state.players[context.sourcePlayerId]?.life.length ?? 0;
      const oppLc = state.players[opponentId]?.life.length ?? 0;
      if (cond.yourSide === true) {
        if (cond.operator === 'LessOrEqual') return ownLc <= oppLc;
        if (cond.operator === 'GreaterOrEqual') return ownLc >= oppLc;
      }
      return true;
    }
    // These conditions require game-state tracking not yet implemented; default to true (optimistic)
    case 'OncePerTurn':
    case 'KOByOpponentEffect':
    case 'PlayedThisTurn':
    case 'FlipCount':
      return true;
    case 'HasTotalAttachedDon': {
      const totalDon = Object.values(state.cards).filter(
        (d) => d.type === 'DON' && d.attachedTo !== null && state.cards[d.attachedTo]?.ownerId === context.sourcePlayerId,
      ).length;
      return totalDon >= cond.min;
    }
    case 'LeaderHasType': {
      const leaderId = state.players[context.sourcePlayerId]?.leader;
      return leaderId !== undefined && leaderId !== null && hasSubType(state.cards[leaderId]?.subTypes, cond.subType);
    }
    case 'LeaderHasAnyType': {
      const leaderId = state.players[context.sourcePlayerId]?.leader;
      const leader = leaderId !== null && leaderId !== undefined ? state.cards[leaderId] : undefined;
      return cond.subTypes.some((t) => hasSubType(leader?.subTypes, t));
    }
    case 'LeaderIsName': {
      const leaderId = state.players[context.sourcePlayerId]?.leader;
      const leader = leaderId !== null && leaderId !== undefined ? state.cards[leaderId] : undefined;
      return leader?.name.includes(cond.name) === true;
    }
    case 'HasCharacterWithMinPower': {
      const targetPlayerId = cond.controller === 'Opponent' ? opponentId : context.sourcePlayerId;
      const board = state.players[targetPlayerId]?.board ?? [];
      const required = cond.minCount ?? 1;
      let count = 0;
      for (const id of board) {
        const c = state.cards[id];
        if (c !== undefined && c.type === 'Character' && calculatePower(id, state) >= cond.minPower) {
          count++;
        }
      }
      if (cond.includeLeader === true) {
        const leaderId = state.players[targetPlayerId]?.leader;
        if (leaderId !== undefined && leaderId !== null) {
          const lc = state.cards[leaderId];
          if (lc !== undefined && calculatePower(leaderId, state) >= cond.minPower) {
            count++;
          }
        }
      }
      return count >= required;
    }
    case 'LeaderHasAttachedDon':
      return countAttachedDon(state.cards, context.sourceCardId) >= cond.count;
    case 'HasAttachedDon':
      return countAttachedDon(state.cards, context.sourceCardId) >= cond.count;
    case 'AnyPlayerHasNoLife':
      return Object.values(state.players).some((p) => p.life.length === 0);
    case 'OR':
      return cond.conditions.some((child) => evalCondPure(child, context, state, opponentId));
    case 'And':
      return cond.conditions.every((child) => evalCondPure(child, context, state, opponentId));
    case 'HasPowerThreshold': {
      const currentPower = calculatePower(context.sourceCardId, state);
      return cond.comparison === 'GreaterOrEqual' ? currentPower >= cond.power
           : cond.comparison === 'LessOrEqual'   ? currentPower <= cond.power
           : currentPower === cond.power;
    }
    case 'DonDifference': {
      const ownDon = (state.players[context.sourcePlayerId]?.donArea ?? []).length;
      const oppDon = (state.players[opponentId]?.donArea ?? []).length;
      return ownDon + cond.gap <= oppDon;
    }
    case 'LeaderPowerAtMost': {
      const leaderId = state.players[context.sourcePlayerId]?.leader;
      return leaderId !== null && leaderId !== undefined && calculatePower(leaderId, state) <= cond.max;
    }
    case 'RevealedCardHasType': {
      const revealed = ([] as CardId[]).map((id) => state.cards[id]).filter(Boolean);
      return revealed.some((c) => c!.type === cond.cardType || (c!.subTypes ?? '').includes(cond.cardType));
    }
    case 'HasRestingDon': {
      const activeDon = (state.players[context.sourcePlayerId]?.donArea ?? []).filter((id) => {
        const d = state.cards[id];
        return d !== undefined && !d.tapped && d.attachedTo === null;
      });
      return activeDon.length >= cond.count;
    }
    case 'HasRestedCharacters': {
      const restedChars = (state.players[context.sourcePlayerId]?.board ?? []).filter((id) => {
        const c = state.cards[id];
        return c !== undefined && c.type === 'Character' && c.tapped === true
          && (cond.subType === undefined || hasSubType(c.subTypes, cond.subType));
      });
      return restedChars.length >= cond.count;
    }
    case 'HasRestedCards': {
      const targetId = (cond as { player?: string }).player === 'opponent' ? opponentId : context.sourcePlayerId;
      const player = state.players[targetId];
      const restedChars = (player?.board ?? []).filter((id) => state.cards[id]?.tapped === true).length;
      const restedDon = (player?.donArea ?? []).filter((id) => state.cards[id]?.tapped === true).length;
      return (restedChars + restedDon) >= cond.count;
    }
    case 'TotalDonCount': {
      const totalDon = (state.players[context.sourcePlayerId]?.donArea ?? []).length;
      if (cond.comparison === 'LessOrEqual') return totalDon <= cond.count;
      if (cond.comparison === 'GreaterOrEqual') return totalDon >= cond.count;
      return totalDon === cond.count;
    }
    case 'AllDonRested': {
      const donArea = state.players[context.sourcePlayerId]?.donArea ?? [];
      if (donArea.length === 0) return false;
      return donArea.every((id) => state.cards[id]?.tapped === true);
    }
    case 'DonCountVsOpponent': {
      const ownActive = (state.players[context.sourcePlayerId]?.donArea ?? []).filter((id) => {
        const d = state.cards[id];
        return d !== undefined && !d.tapped && d.attachedTo === null;
      }).length;
      const oppActive = (state.players[opponentId]?.donArea ?? []).filter((id) => {
        const d = state.cards[id];
        return d !== undefined && !d.tapped && d.attachedTo === null;
      }).length;
      if (cond.operator === 'LessOrEqual') return ownActive <= oppActive;
      if (cond.operator === 'GreaterOrEqual') return ownActive >= oppActive;
      return ownActive === oppActive;
    }
    case 'OnlyTypeOnBoard': {
      const board = state.players[context.sourcePlayerId]?.board ?? [];
      if (board.length === 0) return false;
      return board.every((id) => {
        const c = state.cards[id];
        return c !== undefined && c.type === 'Character' && hasSubType(c.subTypes, cond.subType);
      });
    }
    case 'Not':
      return !evalCondPure(cond.condition, context, state, opponentId);
    case 'FaceUpLifeCard': {
      const life = state.players[context.sourcePlayerId]?.life ?? [];
      return life.some((id) => state.cards[id]?.faceUp === true);
    }
    case 'MulticoloredLeader': {
      const leaderId = state.players[context.sourcePlayerId]?.leader;
      const leader = leaderId !== null && leaderId !== undefined ? state.cards[leaderId] : undefined;
      return leader?.color !== undefined && (leader.color as string).includes('/');
    }
    case 'OpponentDonCount': {
      const oppDonCount = state.players[opponentId]?.donArea?.length ?? 0;
      if (cond.max !== undefined && oppDonCount > cond.max) return false;
      if (cond.min !== undefined && oppDonCount < cond.min) return false;
      return true;
    }
    default:
      return true;
  }
}

// ─── Cost computation for Permanent ModifyCost effects ────────────────────────

/**
 * Compute the effective play cost for a card, accounting for Permanent ModifyCost effects.
 * Returns the raw card.cost if no cost-reducing effects apply.
 */
export function computePlayCost(cardId: CardId, state: GameState, playerId: PlayerId): number {
  const card = state.cards[cardId];
  if (!card) return 0;
  const [p1, p2] = state.playerOrder;
  const opponentId = playerId === p1 ? p2 : p1;
  const context: EffectContext = { sourceCardId: cardId, sourcePlayerId: playerId };
  let reduction = 0;

  // Self-reduction: check this card's own Permanent effects
  for (const effect of card.effects ?? []) {
    if (effect.trigger !== 'Permanent') continue;
    const condPasses = !effect.condition || evalCondPure(effect.condition, context, state, opponentId);
    if (!condPasses) continue;
    for (const action of effect.actions) {
      if (action.type === 'ModifyCost' && !(action as { subType?: string }).subType && !(action as { minCost?: number }).minCost) {
        reduction += action.amount;
      }
    }
  }

  // External reduction: check board cards' Permanent effects for reductions that apply to this card
  const player = state.players[playerId];
  const boardAndLeader: CardId[] = [...(player?.board ?? [])];
  if (player?.leader !== null && player?.leader !== undefined) boardAndLeader.push(player.leader);
  for (const boardCardId of boardAndLeader) {
    const boardCard = state.cards[boardCardId];
    if (!boardCard?.effects?.length) continue;
    const boardCtx: EffectContext = { sourceCardId: boardCardId, sourcePlayerId: playerId };
    for (const effect of boardCard.effects) {
      if (effect.trigger !== 'Permanent') continue;
      const condPasses = !effect.condition || evalCondPure(effect.condition, boardCtx, state, opponentId);
      if (!condPasses) continue;
      for (const action of effect.actions) {
        if (action.type !== 'ModifyCost') continue;
        const modAction = action as { type: 'ModifyCost'; amount: number; subType?: string; minCost?: number };
        if (!modAction.subType && !modAction.minCost) continue; // self-reduction — skip for board scan
        if (modAction.subType && !hasSubType(card.subTypes, modAction.subType)) continue;
        if (modAction.minCost !== undefined && card.cost < modAction.minCost) continue;
        reduction += modAction.amount;
      }
    }
  }

  return Math.max(0, card.cost + reduction);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fire OnReturnDonToDeck on all board cards + leader for a player.
 * Called after a player pays a ReturnDon cost on any effect.
 */
function fireReturnDonTrigger(state: GameState, playerId: PlayerId): GameState {
  const player = state.players[playerId];
  if (player === undefined) return state;
  let next = state;
  // Snapshot IDs in case effects modify the board
  const allCards: CardId[] = [];
  if (player.leader !== null) allCards.push(player.leader);
  allCards.push(...(state.players[playerId]?.board ?? []));
  for (const cardId of allCards) {
    const card = next.cards[cardId];
    if (!card?.effects?.length) continue;
    if (!card.effects.some((e) => e.trigger === 'OnReturnDonToDeck')) continue;
    next = resolveEffects(card.effects, 'OnReturnDonToDeck', { sourceCardId: cardId, sourcePlayerId: playerId }, next);
  }
  return next;
}

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

  // If the source card's effects are negated, skip all effect resolution
  if (next.cards[context.sourceCardId]?.effectsNegated === true) return next;

  for (let ei = 0; ei < effects.length; ei++) {
    const effect = effects[ei]!;
    if (effect.trigger !== trigger) continue;

    // Once-per-turn enforcement for non-Activated effects
    if ((effect as { oncePerTurn?: boolean }).oncePerTurn === true && trigger !== 'Activated') {
      const optKey = `${context.sourceCardId}:${ei}`;
      if (next.usedOncePerTurnEffects.includes(optKey)) continue;
    }

    // Check and pay effect-level DON cost
    if (effect.cost !== undefined) {
      const costDef = effect.cost as { don?: number; type?: string; count?: number; amount?: number };
      if (costDef.type === 'ReturnDon' || costDef.type === 'ReturnDonToDeck') {
        // Return N active DON from player's donArea to donDeck
        const returnCount = costDef.count ?? costDef.amount ?? 1;
        const player = next.players[context.sourcePlayerId];
        const freeDon = (player?.donArea ?? []).filter((id) => {
          const d = next.cards[id];
          return d !== undefined && !d.tapped && d.attachedTo === null;
        });
        if (freeDon.length < returnCount) continue; // can't pay — skip effect
        const toReturn = freeDon.slice(0, returnCount);
        const updatedCards: Record<string, Card> = { ...next.cards };
        for (const id of toReturn) {
          updatedCards[id] = { ...updatedCards[id]!, zone: 'donDeck' as const };
        }
        const updatedPlayer: PlayerState = {
          ...player!,
          donArea: player!.donArea.filter((id) => !toReturn.includes(id)),
          donDeck: [...player!.donDeck, ...toReturn],
        };
        next = {
          ...next,
          cards: updatedCards as Readonly<Record<CardId, Card>>,
          players: { ...next.players, [context.sourcePlayerId]: updatedPlayer },
        };
        // Fire OnReturnDonToDeck on all board cards + leader
        next = fireReturnDonTrigger(next, context.sourcePlayerId);
      } else if (costDef.don !== undefined && costDef.don > 0) {
        const player = next.players[context.sourcePlayerId];
        const activeDon = (player?.donArea ?? []).filter((id) => {
          const d = next.cards[id];
          return d !== undefined && !d.tapped && d.attachedTo === null;
        });
        if (activeDon.length < costDef.don) continue; // can't pay — skip effect
        // Pay by resting N active DON
        for (const donId of activeDon.slice(0, costDef.don)) {
          next = { ...next, cards: { ...next.cards, [donId]: { ...next.cards[donId]!, tapped: true } } };
        }
      }
    }

    // Evaluate optional condition
    if (effect.condition !== undefined && effect.condition !== null) {
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
          (c) =>
            c.ownerId === context.sourcePlayerId &&
            c.zone === 'board' &&
            (cond.name === undefined || c.name === cond.name),
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
        // Leader included only when includeLeader:true; default excludes leader.
        const [cp1, cp2] = next.playerOrder;
        const checkOpponent = cond.controller === 'Opponent';
        const targetPlayerId = checkOpponent
          ? (context.sourcePlayerId === cp1 ? cp2 : cp1)
          : context.sourcePlayerId;
        const board = next.players[targetPlayerId]?.board ?? [];
        const required = cond.minCount ?? 1;
        let cnt = 0;
        for (const id of board) {
          const c = next.cards[id];
          if (c !== undefined && c.type === 'Character' && calculatePower(id, next) >= cond.minPower) cnt++;
        }
        if (cond.includeLeader === true) {
          const lId = next.players[targetPlayerId]?.leader;
          if (lId !== undefined && lId !== null) {
            const lc = next.cards[lId];
            if (lc !== undefined && calculatePower(lId, next) >= cond.minPower) cnt++;
          }
        }
        if (cnt < required) continue;
      }
      if (cond.type === 'RevealedCardHasType') {
        const revealed = (context.revealedCardIds ?? []).map((id) => next.cards[id]).filter(Boolean);
        const passes = revealed.some((c) => c!.type === cond.cardType || (c!.subTypes ?? '').includes(cond.cardType));
        if (!passes) continue;
      }
      if (cond.type === 'OR') {
        const [op1, op2] = next.playerOrder;
        const oppId2 = context.sourcePlayerId === op1 ? op2 : op1;
        const passes = cond.conditions.some((child) => evalCondPure(child, context, next, oppId2));
        if (!passes) continue;
      }
      if (cond.type === 'And') {
        const [ap1, ap2] = next.playerOrder;
        const aOppId = context.sourcePlayerId === ap1 ? ap2 : ap1;
        const passes = cond.conditions.every((child) => evalCondPure(child, context, next, aOppId));
        if (!passes) continue;
      }
      if (cond.type === 'HasPowerThreshold') {
        const currentPower = calculatePower(context.sourceCardId, next);
        const passes = cond.comparison === 'GreaterOrEqual' ? currentPower >= cond.power
                     : cond.comparison === 'LessOrEqual'   ? currentPower <= cond.power
                     : currentPower === cond.power;
        if (!passes) continue;
      }
      if (cond.type === 'DonDifference') {
        const [dp1, dp2] = next.playerOrder;
        const dOppId = context.sourcePlayerId === dp1 ? dp2 : dp1;
        const ownDon = (next.players[context.sourcePlayerId]?.donArea ?? []).length;
        const oppDon = (next.players[dOppId]?.donArea ?? []).length;
        if (ownDon + cond.gap > oppDon) continue;
      }
      if (cond.type === 'LeaderPowerAtMost') {
        const leaderId = next.players[context.sourcePlayerId]?.leader;
        if (!leaderId || calculatePower(leaderId, next) > cond.max) continue;
      }
      if (cond.type === 'HandCount') {
        const handSize = next.players[context.sourcePlayerId]?.hand.length ?? 0;
        if (cond.max !== undefined && handSize > cond.max) continue;
        if (cond.min !== undefined && handSize < cond.min) continue;
      }
      if (cond.type === 'OpponentHandCount') {
        const [hc1, hc2] = next.playerOrder;
        const hcOppId = context.sourcePlayerId === hc1 ? hc2 : hc1;
        const oppHand = next.players[hcOppId]?.hand.length ?? 0;
        if (cond.value !== undefined) {
          const passes = cond.operator === 'GreaterThanOrEqual' ? oppHand >= cond.value
                       : cond.operator === 'LessThanOrEqual' ? oppHand <= cond.value
                       : oppHand === cond.value;
          if (!passes) continue;
        }
      }
      if (cond.type === 'LifeCount') {
        const lifeCount = next.players[context.sourcePlayerId]?.life.length ?? 0;
        if (cond.max !== undefined && lifeCount > cond.max) continue;
        if (cond.min !== undefined && lifeCount < cond.min) continue;
        if (cond.value !== undefined) {
          const passes = cond.comparison === 'LessOrEqual' ? lifeCount <= cond.value
                       : cond.comparison === 'GreaterOrEqual' ? lifeCount >= cond.value
                       : lifeCount === cond.value;
          if (!passes) continue;
        }
      }
      if (cond.type === 'OpponentLifeCount' || cond.type === 'OpponentLife') {
        const [lc1, lc2] = next.playerOrder;
        const lcOppId = context.sourcePlayerId === lc1 ? lc2 : lc1;
        const oppLife = next.players[lcOppId]?.life.length ?? 0;
        if ('max' in cond && cond.max !== undefined && oppLife > cond.max) continue;
        if ('min' in cond && cond.min !== undefined && oppLife < cond.min) continue;
        if (cond.value !== undefined) {
          const c2 = cond.comparison;
          const passes = (c2 === 'LessThanOrEqual' || c2 === 'LessOrEqual') ? oppLife <= cond.value
                       : (c2 === 'GreaterThanOrEqual' || c2 === 'GreaterOrEqual') ? oppLife >= cond.value
                       : oppLife === cond.value;
          if (!passes) continue;
        }
      }
      if (cond.type === 'HasFewerLifeThanOpponent' || cond.type === 'PlayerLifeLessThanOpponent') {
        const [fl1, fl2] = next.playerOrder;
        const flOppId = context.sourcePlayerId === fl1 ? fl2 : fl1;
        const ownLf = next.players[context.sourcePlayerId]?.life.length ?? 0;
        const oppLf = next.players[flOppId]?.life.length ?? 0;
        if (ownLf >= oppLf) continue;
      }
      if (cond.type === 'HasLife') {
        const [hl1, hl2] = next.playerOrder;
        const hlOppId = context.sourcePlayerId === hl1 ? hl2 : hl1;
        const ownLf2 = next.players[context.sourcePlayerId]?.life.length ?? 0;
        if (cond.opponent === true && cond.comparison === 'less') {
          const oppLf2 = next.players[hlOppId]?.life.length ?? 0;
          if (ownLf2 >= oppLf2) continue;
        } else if (cond.value !== undefined) {
          const passes = cond.comparison === 'LessThanOrEqual' ? ownLf2 <= cond.value
                       : cond.comparison === 'GreaterThanOrEqual' ? ownLf2 >= cond.value
                       : true;
          if (!passes) continue;
        }
      }
      if (cond.type === 'HasLifeCards') {
        const ownLf3 = next.players[context.sourcePlayerId]?.life.length ?? 0;
        if (cond.value !== undefined) {
          const passes = cond.operator === 'LessOrEqual' ? ownLf3 <= cond.value
                       : cond.operator === 'GreaterOrEqual' ? ownLf3 >= cond.value
                       : ownLf3 === cond.value;
          if (!passes) continue;
        }
      }
      if (cond.type === 'HasLifeOrLess') {
        const ownLf4 = next.players[context.sourcePlayerId]?.life.length ?? 0;
        if (cond.value !== undefined && ownLf4 > cond.value) continue;
      }
      if (cond.type === 'HasPower') {
        const pw = calculatePower(context.sourceCardId, next);
        if (cond.minPower !== undefined && pw < cond.minPower) continue;
        if (cond.maxPower !== undefined && pw > cond.maxPower) continue;
      }
      if (cond.type === 'CardPower') {
        const pw2 = calculatePower(context.sourceCardId, next);
        if (cond.amount !== undefined) {
          const passes = cond.comparison === 'GreaterThanOrEqual' ? pw2 >= cond.amount
                       : cond.comparison === 'LessOrEqual' ? pw2 <= cond.amount
                       : pw2 === cond.amount;
          if (!passes) continue;
        }
      }
      if (cond.type === 'LeaderHasLife') {
        const leaderId = next.players[context.sourcePlayerId]?.leader;
        const leaderOwner = leaderId ? next.cards[leaderId]?.ownerId : undefined;
        const lhLife = leaderOwner ? (next.players[leaderOwner]?.life.length ?? 0) : 0;
        if (cond.value !== undefined) {
          const passes = cond.comparison === 'LessOrEqual' ? lhLife <= cond.value
                       : cond.comparison === 'GreaterOrEqual' ? lhLife >= cond.value
                       : lhLife === cond.value;
          if (!passes) continue;
        }
      }
      if (cond.type === 'LifeComparison') {
        const [lcp1, lcp2] = next.playerOrder;
        const lcOpp2 = context.sourcePlayerId === lcp1 ? lcp2 : lcp1;
        const ownLc2 = next.players[context.sourcePlayerId]?.life.length ?? 0;
        const oppLc2 = next.players[lcOpp2]?.life.length ?? 0;
        if (cond.yourSide === true) {
          const passes = cond.operator === 'LessOrEqual' ? ownLc2 <= oppLc2 : ownLc2 >= oppLc2;
          if (!passes) continue;
        }
      }
      if (cond.type === 'HasRestedCharacters') {
        const restedChars = (next.players[context.sourcePlayerId]?.board ?? []).filter((id) => {
          const c = next.cards[id];
          return c !== undefined && c.type === 'Character' && c.tapped === true
            && (cond.subType === undefined || hasSubType(c.subTypes, cond.subType));
        });
        if (restedChars.length < cond.count) continue;
      }
      if (cond.type === 'HasRestedCards') {
        const rcTargetId = (cond as { player?: string }).player === 'opponent' ? opponentId : context.sourcePlayerId;
        const rPlayer = next.players[rcTargetId];
        const rChars = (rPlayer?.board ?? []).filter((id) => next.cards[id]?.tapped === true).length;
        const rDon = (rPlayer?.donArea ?? []).filter((id) => next.cards[id]?.tapped === true).length;
        if (rChars + rDon < cond.count) continue;
      }
      if (cond.type === 'TotalDonCount') {
        const totalDon = (next.players[context.sourcePlayerId]?.donArea ?? []).length;
        const passes = cond.comparison === 'LessOrEqual' ? totalDon <= cond.count
                     : cond.comparison === 'GreaterOrEqual' ? totalDon >= cond.count
                     : totalDon === cond.count;
        if (!passes) continue;
      }
      if (cond.type === 'AllDonRested') {
        const donArea = next.players[context.sourcePlayerId]?.donArea ?? [];
        if (donArea.length === 0) continue; // empty donArea → condition fails
        if (!donArea.every((id) => next.cards[id]?.tapped === true)) continue;
      }
      if (cond.type === 'DonCountVsOpponent') {
        const [dv1, dv2] = next.playerOrder;
        const dvOppId = context.sourcePlayerId === dv1 ? dv2 : dv1;
        const ownActive = (next.players[context.sourcePlayerId]?.donArea ?? []).filter((id) => {
          const d = next.cards[id];
          return d !== undefined && !d.tapped && d.attachedTo === null;
        }).length;
        const oppActive = (next.players[dvOppId]?.donArea ?? []).filter((id) => {
          const d = next.cards[id];
          return d !== undefined && !d.tapped && d.attachedTo === null;
        }).length;
        const passes = cond.operator === 'LessOrEqual' ? ownActive <= oppActive
                     : cond.operator === 'GreaterOrEqual' ? ownActive >= oppActive
                     : ownActive === oppActive;
        if (!passes) continue;
      }
      if (cond.type === 'OnlyTypeOnBoard') {
        const board = next.players[context.sourcePlayerId]?.board ?? [];
        if (board.length === 0) { continue; }
        const allMatch = board.every((id) => {
          const c = next.cards[id];
          return c !== undefined && c.type === 'Character' && hasSubType(c.subTypes, cond.subType);
        });
        if (!allMatch) continue;
      }
      if (cond.type === 'Not') {
        const [np1, np2] = next.playerOrder;
        const nOppId = context.sourcePlayerId === np1 ? np2 : np1;
        const innerPasses = evalCondPure(cond.condition, context, next, nOppId);
        if (innerPasses) continue; // 'Not' → fail if inner passes
      }
      if (cond.type === 'FaceUpLifeCard') {
        const life = next.players[context.sourcePlayerId]?.life ?? [];
        const hasFaceUp = life.some((id) => next.cards[id]?.faceUp === true);
        if (!hasFaceUp) continue;
      }
      if (cond.type === 'MulticoloredLeader') {
        const lId = next.players[context.sourcePlayerId]?.leader;
        const lCard = lId !== null && lId !== undefined ? next.cards[lId] : undefined;
        if (!lCard || !(lCard.color as string).includes('/')) continue;
      }
      if (cond.type === 'OpponentDonCount') {
        const [cp1, cp2] = next.playerOrder;
        const oppId = context.sourcePlayerId === cp1 ? cp2 : cp1;
        const oppDonCount = next.players[oppId]?.donArea?.length ?? 0;
        if (cond.max !== undefined && oppDonCount > cond.max) continue;
        if (cond.min !== undefined && oppDonCount < cond.min) continue;
      }
      // 'Always', 'OncePerTurn', 'KOByOpponentEffect', 'PlayedThisTurn', 'FlipCount' → always passes

    }
    next = {
      ...next,
      gameLog: [...next.gameLog, {
        seq: next.gameLog.length,
        event: 'EFFECT_TRIGGERED' as const,
        message: `[${trigger}] effect triggered by "${next.cards[context.sourceCardId]?.name ?? context.sourceCardId}"`,
        cardId: context.sourceCardId,
        cardName: next.cards[context.sourceCardId]?.name,
        playerId: context.sourcePlayerId,
        turn: next.turnNumber,
      }],
    };
    // Mark once-per-turn effect as used (non-Activated; Activated is tracked by activatedAbilityIds)
    if ((effect as { oncePerTurn?: boolean }).oncePerTurn === true && trigger !== 'Activated') {
      const optKey = `${context.sourceCardId}:${ei}`;
      if (!next.usedOncePerTurnEffects.includes(optKey)) {
        next = { ...next, usedOncePerTurnEffects: [...next.usedOncePerTurnEffects, optKey] };
      }
    }
    for (let ai = 0; ai < effect.actions.length; ai++) {
      const action = effect.actions[ai]!;

      // Action-level condition (e.g. RevealedCardHasType on AttachDon / DrawCard / ForceDiscard)
      {
        const actionCond = (action as { condition?: { type: string; cardType?: string } }).condition;
        if (actionCond !== undefined) {
          if (actionCond.type === 'RevealedCardHasType') {
            const cardType = actionCond.cardType ?? '';
            const revealed = context.revealedCardIds ?? [];
            const matches = revealed.some((id) => {
              const c = next.cards[id];
              return c !== undefined && hasSubType(c.subTypes, cardType);
            });
            if (!matches) continue;
          }
        }
      }

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
            const minPower = (t as { minPower?: number }).minPower;
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
              if (minPower !== undefined && calculatePower(id, next) < minPower)      return false;
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
                ...(minPower !== undefined ? { minPower } : {}),
                ...(subType  !== undefined ? { subType }  : {}),
                pendingAction: action,
                pendingEffectActions: effect.actions.slice(ai + 1),
                pendingEffects: effects.slice(ei + 1),
                trigger,
                ...(context.revealedCardIds !== undefined ? { revealedCardIds: context.revealedCardIds } : {}),
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

      // Detect RevealFromDeck — peek top N cards and pause for player acknowledgment
      if (action.type === 'RevealFromDeck') {
        const player = next.players[context.sourcePlayerId];
        if (player === undefined || player.deck.length === 0) continue; // empty deck → skip
        const actual = Math.min(action.count, player.deck.length);
        const revealedIds = player.deck.slice(0, actual) as unknown as readonly CardId[];
        return {
          ...next,
          pendingRevealInteraction: {
            playerId: context.sourcePlayerId,
            count: actual,
            sourceCardId: context.sourceCardId,
            sourcePlayerId: context.sourcePlayerId,
            thenActions: action.thenActions,
            pendingEffectActions: effect.actions.slice(ai + 1),
            pendingEffects: effects.slice(ei + 1),
            trigger,
            revealedCardIds: revealedIds,
            returnTo: action.returnTo,
          },
        };
      }

      // Detect SearchDeck with lookCount/count — reveal top N cards and pause for player choice.
      // Intercepted here (not in resolveAction) to capture pendingEffectActions for resumption.
      if (action.type === 'SearchDeck') {
        const sd = action as { source?: string; lookCount?: number; count?: number; filter?: unknown; destination?: string; restTo?: string; optional?: boolean; thenActions?: readonly EffectAction[]; cardType?: string; cardTypeFilter?: string };

        // ── Trash-source branch: return cards from own trash to deck/hand ───────
        const sdSrc = sd.source;
        if (sdSrc === 'Trash' || sdSrc === 'trash') {
          const trashPlayer = next.players[context.sourcePlayerId];
          if (trashPlayer === undefined) continue;
          const normF = normalizeFilter(sd.filter);
          const legacySubType = (sd.cardType ?? sd.cardTypeFilter) as string | undefined;
          const matchingIds = trashPlayer.trash.filter((id) => {
            const c = next.cards[id];
            if (c === undefined) return false;
            return matchesDeckFilter(c, normF, legacySubType);
          });
          if (matchingIds.length === 0) continue; // no matching cards → skip
          const count = sd.count ?? 1;
          const rawDest = sd.destination ?? 'bottomOfDeck';
          const normDest: 'hand' | 'bottomOfDeck' = rawDest === 'hand' ? 'hand' : 'bottomOfDeck';
          return {
            ...next,
            pendingSearchInteraction: {
              playerId: context.sourcePlayerId,
              revealedCardIds: matchingIds as readonly CardId[],
              filter: normF,
              destination: normDest,
              source: 'trash' as const,
              maxSelect: count,
              sourceCardId: context.sourceCardId,
              sourcePlayerId: context.sourcePlayerId,
              ...(sd.thenActions !== undefined ? { thenActions: sd.thenActions } : {}),
              pendingEffectActions: effect.actions.slice(ai + 1),
              pendingEffects: effects.slice(ei + 1),
              trigger,
            },
          };
        }

        const sdTyped = action as { lookCount?: number; count?: number; filter: DeckFilter; destination: string; restTo?: string; optional?: boolean; thenActions?: readonly EffectAction[] };
        const lookN = sdTyped.lookCount ?? sdTyped.count;
        if (lookN !== undefined) {
          const sdPlayer = next.players[context.sourcePlayerId];
          if (sdPlayer === undefined || sdPlayer.deck.length === 0) continue; // empty deck → skip
          const actual = Math.min(lookN, sdPlayer.deck.length);
          const revealedCardIds = sdPlayer.deck.slice(0, actual) as unknown as readonly CardId[];
          const maxSelect = sdTyped.lookCount !== undefined && sdTyped.count !== undefined ? sdTyped.count : undefined;
          const rawDest = sdTyped.destination as string;
          const normDest = (rawDest === 'TopOfLifeCards' || rawDest === 'TopOfLife')
            ? 'TopOfLife' as const
            : rawDest as 'hand' | 'board' | 'bottomOfDeck';
          return {
            ...next,
            pendingSearchInteraction: {
              playerId: context.sourcePlayerId,
              revealedCardIds,
              filter: sdTyped.filter,
              destination: normDest,
              ...(sdTyped.restTo !== undefined ? { restTo: sdTyped.restTo as 'top' | 'bottom' } : {}),
              ...(maxSelect !== undefined ? { maxSelect } : {}),
              sourceCardId: context.sourceCardId,
              sourcePlayerId: context.sourcePlayerId,
              ...(sdTyped.thenActions !== undefined ? { thenActions: sdTyped.thenActions } : {}),
              pendingEffectActions: effect.actions.slice(ai + 1),
              pendingEffects: effects.slice(ei + 1),
              trigger,
            },
          };
        }
      }

      // Detect ChooseOne — pause and wait for ResolveChoiceInteraction
      if (action.type === 'ChooseOne') {
        const [co1, co2] = state.playerOrder;
        const coOpponentId = context.sourcePlayerId === co1 ? co2 : co1;
        const choicePlayerId = (action as { forOpponent?: boolean }).forOpponent === true
          ? coOpponentId
          : context.sourcePlayerId;
        return {
          ...next,
          pendingChoiceInteraction: {
            playerId: choicePlayerId,
            choices: action.choices,
            sourceCardId: context.sourceCardId,
            sourcePlayerId: context.sourcePlayerId,
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
            ...(action.thenActions !== undefined ? { thenActions: action.thenActions } : {}),
            pendingEffectActions: effect.actions.slice(ai + 1),
            pendingEffects: effects.slice(ei + 1),
            trigger,
          },
        };
      }

      // Detect Rest targeting opponent's card with OnWouldBeRestedByEffect
      if (action.type === 'Rest') {
        const restTargets = selectTargets((action as { target: TargetSelector }).target, context, next);
        for (const tId of restTargets) {
          const tCard = next.cards[tId];
          if (!tCard) continue;
          // Only intercept if card is opponent's and has OnWouldBeRestedByEffect
          if (tCard.ownerId === context.sourcePlayerId) continue;
          const restSubEffect = tCard.effects?.find((e) => e.trigger === 'OnWouldBeRestedByEffect');
          if (!restSubEffect) continue;
          return {
            ...next,
            pendingRestSubstituteInteraction: {
              playerId: tCard.ownerId,
              targetCardId: tId,
              substituteActions: restSubEffect.actions,
              pendingEffectActions: effect.actions.slice(ai + 1),
              pendingEffects: effects.slice(ei + 1),
              trigger,
              sourceCardId: context.sourceCardId,
              sourcePlayerId: context.sourcePlayerId,
            },
          };
        }
      }

      // Detect KO — check if any target has OnWouldBeKOByEffect and can pay the cost
      if (action.type === 'KO') {
        const targets = selectTargets(action.target, context, next);
        for (const targetId of targets) {
          const targetCard = next.cards[targetId];
          if (!targetCard) continue;
          const alreadyUsed = next.koSubstituteUsedIds.includes(targetId);
          if (alreadyUsed) continue;

          // 1. Self-protection: target card has its own OnWouldBeKOByEffect
          const selfEffect = targetCard.effects?.find((e) => e.trigger === 'OnWouldBeKOByEffect' && !e.protects);
          if (selfEffect) {
            // Evaluate condition with context relative to the target card's owner
            const [sp1, sp2] = next.playerOrder;
            const selfOppId = targetCard.ownerId === sp1 ? sp2 : sp1;
            const selfCtx: EffectContext = { sourceCardId: targetId, sourcePlayerId: targetCard.ownerId };
            const conditionMet = selfEffect.condition === undefined
              || evalCondPure(selfEffect.condition, selfCtx, next, selfOppId);

            if (conditionMet) {
              const trashAction = selfEffect.actions.find((a) => a.type === 'TrashFromHand');
              if (trashAction) {
                const ta = trashAction as { filter: HandFilter };
                const owner = next.players[targetCard.ownerId];
                if (owner && owner.hand.length > 0) {
                  return {
                    ...next,
                    pendingKOSubstituteInteraction: {
                      playerId: targetCard.ownerId,
                      cardId: targetId,
                      filter: ta.filter,
                      sourceCardId: context.sourceCardId,
                      sourcePlayerId: context.sourcePlayerId,
                      pendingEffectActions: effect.actions.slice(ai + 1),
                      pendingEffects: effects.slice(ei + 1),
                      trigger,
                      costType: 'TrashFromHand',
                      costActions: [],
                    },
                  };
                }
              } else {
                // Auto cost (e.g. Sabo: power debuff instead of KO) — no player choice needed for cost
                return {
                  ...next,
                  pendingKOSubstituteInteraction: {
                    playerId: targetCard.ownerId,
                    cardId: targetId,
                    filter: { type: 'Any' } as HandFilter,
                    sourceCardId: context.sourceCardId,
                    sourcePlayerId: context.sourcePlayerId,
                    pendingEffectActions: effect.actions.slice(ai + 1),
                    pendingEffects: effects.slice(ei + 1),
                    trigger,
                    costType: 'Auto',
                    costActions: selfEffect.actions,
                    protectorCardId: targetId,
                  },
                };
              }
            }
          }

          // 2. External protection: another allied card on board has OnWouldBeKOByEffect with protects selector
          const protector = Object.values(next.cards).find((c) => {
            if (c.id === targetId) return false;
            if (c.ownerId !== targetCard.ownerId) return false;
            if (c.zone !== 'board') return false;
            const ext = c.effects?.find((e) => e.trigger === 'OnWouldBeKOByEffect' && e.protects !== undefined);
            if (!ext) return false;
            // Check the protector hasn't already been used
            if (next.koSubstituteUsedIds.includes(c.id)) return false;
            // Check protects selector matches targetCard
            const pts = selectTargets(ext.protects!, { sourceCardId: c.id, sourcePlayerId: c.ownerId }, next);
            return pts.includes(targetId);
          });
          if (protector) {
            const extEffect = protector.effects!.find((e) => e.trigger === 'OnWouldBeKOByEffect' && e.protects !== undefined)!;
            return {
              ...next,
              pendingKOSubstituteInteraction: {
                playerId: targetCard.ownerId,
                cardId: targetId,
                filter: { type: 'Any' } as HandFilter,
                sourceCardId: context.sourceCardId,
                sourcePlayerId: context.sourcePlayerId,
                pendingEffectActions: effect.actions.slice(ai + 1),
                pendingEffects: effects.slice(ei + 1),
                trigger,
                protectorCardId: protector.id,
                costType: 'Auto',
                costActions: extEffect.actions,
              },
            };
          }
        }
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
              ...(action.destination !== undefined ? { destination: action.destination } : {}),
              pendingEffectActions: effect.actions.slice(ai + 1),
              pendingEffects: effects.slice(ei + 1),
              trigger,
            },
          };
        }
        // Opponent has empty hand — nothing to discard, continue
        continue;
      }

      // Detect RearrangeLife — pause and wait for ResolveLifeInteraction
      if (action.type === 'RearrangeLife') {
        const lifePlayer = next.players[context.sourcePlayerId];
        if (lifePlayer === undefined || lifePlayer.life.length === 0) continue;
        return {
          ...next,
          pendingLifeInteraction: {
            playerId: context.sourcePlayerId,
            sourceCardId: context.sourceCardId,
            mode: 'Rearrange',
            lifeCards: lifePlayer.life,
            lifeOwnerId: context.sourcePlayerId,
            pendingEffectActions: effect.actions.slice(ai + 1),
            pendingEffects: effects.slice(ei + 1),
            trigger,
          },
        };
      }

      // Detect TakeLifeToHand — pause for optional take + rearrange
      if (action.type === 'TakeLifeToHand') {
        const lifePlayer = next.players[context.sourcePlayerId];
        if (lifePlayer === undefined || lifePlayer.life.length === 0) continue;
        return {
          ...next,
          pendingLifeInteraction: {
            playerId: context.sourcePlayerId,
            sourceCardId: context.sourceCardId,
            mode: 'MoveOne',
            lifeCards: lifePlayer.life,
            lifeOwnerId: context.sourcePlayerId,
            pendingEffectActions: effect.actions.slice(ai + 1),
            pendingEffects: effects.slice(ei + 1),
            trigger,
          },
        };
      }

      // Detect MoveLifeCard — pause for player to pick 1 life card + destination
      if (action.type === 'MoveLifeCard') {
        const [mp1, mp2] = state.playerOrder;
        const lifeOwnerId = action.target === 'opponent'
          ? (context.sourcePlayerId === mp1 ? mp2 : mp1)
          : context.sourcePlayerId;
        const lifePlayer = next.players[lifeOwnerId];
        if (lifePlayer === undefined || lifePlayer.life.length === 0) continue;
        return {
          ...next,
          pendingLifeInteraction: {
            playerId: context.sourcePlayerId,
            sourceCardId: context.sourceCardId,
            mode: 'MoveOne',
            lifeCards: lifePlayer.life,
            lifeOwnerId,
            pendingEffectActions: effect.actions.slice(ai + 1),
            pendingEffects: effects.slice(ei + 1),
            trigger,
          },
        };
      }

      next = resolveAction(action, context, next);
      // Propagate if a nested resolveEffects call set a pending interaction
      if (next.pendingOnKOInteraction !== null) return next;
      if (next.pendingTargetInteraction !== null) return next;
      if (next.pendingRevealInteraction !== null) return next;
      if (next.pendingSearchInteraction !== null) return next;
      if (next.pendingTrashInteraction !== null) return next;
      if (next.pendingForceDiscardInteraction !== null) return next;
      if (next.pendingForcedAttack !== null) return next;
      if (next.pendingKOSubstituteInteraction !== null) return next;
      if (next.pendingChoiceInteraction !== null) return next;
      if (next.pendingRestSubstituteInteraction !== null) return next;
      if (next.pendingLifeInteraction != null) return next;
    }
  }
  return next;
}
