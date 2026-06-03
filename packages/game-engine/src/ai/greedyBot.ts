import { applyAction } from '../core/applyAction.js';
import { isGameError } from '../types/index.js';
import type { Card, GameState, GameAction, PlayerId, CardId } from '../types/index.js';

// ─── Internal helpers ─────────────────────────────────────────────────────────

function calcPower(cardId: CardId, state: GameState): number {
  const card = state.cards[cardId];
  if (card === undefined) return 0;
  let donCount = 0;
  for (const c of Object.values(state.cards)) {
    if (c.type === 'DON' && c.attachedTo === cardId) donCount++;
  }
  return card.power + donCount * 1000 + (card.powerModifier ?? 0);
}

function freeDon(state: GameState, playerId: PlayerId): CardId[] {
  const player = state.players[playerId];
  if (player === undefined) return [];
  return player.donArea.filter(id => {
    const c = state.cards[id];
    return c !== undefined && !c.tapped && c.attachedTo === null;
  });
}

function tryAction(state: GameState, action: GameAction): boolean {
  const result = applyAction(state, action);
  return !isGameError(result);
}

/**
 * Scores a card's OnPlay effect quality.
 * 0 = no OnPlay effect, 1 = has effect, 2 = has high-value effect (KO/draw/don/search).
 */
function effectScore(card: Card): number {
  const onPlay = card.effects?.filter((e) => e.trigger === 'OnPlay') ?? [];
  if (onPlay.length === 0) return 0;
  const highValue = new Set(['KO', 'DrawCard', 'SearchDeck', 'GiveDon', 'ForceDiscard',
    'PowerBoost', 'AddToLife', 'RemoveLife', 'RevealFromDeck']);
  for (const eff of onPlay) {
    const acts = eff.actions as readonly { type: string }[] | undefined;
    if (acts?.some((a) => highValue.has(a.type)) === true) return 2;
  }
  return 1;
}

/**
 * Overall hand-card usefulness (higher = more valuable to keep).
 * Used to decide which cards to discard when forced.
 */
function cardUsefulnessScore(card: Card): number {
  let score = card.power / 1000;
  if ((card.effects?.length ?? 0) > 0) score += 3;
  if ((card.keywords ?? []).some((k) => ['Blocker', 'Rush', 'DoubleAttack'].includes(k))) score += 2;
  return score;
}

function cardHasKw(state: GameState, cardId: CardId, kw: string): boolean {
  const c = state.cards[cardId];
  if (c === undefined) return false;
  return (c.keywords ?? []).includes(kw) || (c.temporaryKeywords ?? []).includes(kw);
}

// ─── Phase handlers ───────────────────────────────────────────────────────────

function decideMulligan(state: GameState, botId: PlayerId): GameAction {
  const player = state.players[botId];
  const hand = (player?.hand ?? []).map(id => state.cards[id]).filter((c): c is NonNullable<typeof c> => c !== undefined);
  const playableEarly = hand.filter(c => c.cost <= 2 && c.type !== 'Leader').length;
  return { type: 'Mulligan', playerId: botId, keep: playableEarly >= 2 };
}

/**
 * Try to fire an [Activate: Main] ability.
 * Cards are tried in board-position order; engine validates conditions and once-per-turn.
 */
function tryActivatedAbilities(state: GameState, botId: PlayerId): GameAction | null {
  const player = state.players[botId];
  if (player === undefined) return null;

  const candidates: CardId[] = [
    ...player.board,
    ...(player.leader !== null ? [player.leader] : []),
  ].filter((id) => {
    const c = state.cards[id];
    return c !== undefined && (c.effects?.some((e) => e.trigger === 'Activated') === true);
  });

  for (const cardId of candidates) {
    const action: GameAction = { type: 'ActivatedAbility', playerId: botId, cardId };
    if (tryAction(state, action)) return action;
  }
  return null;
}

/**
 * Attach one free DON to the strongest untapped board card or leader.
 * Boosting the highest-power attacker maximises damage per DON.
 */
function assignOneDon(state: GameState, botId: PlayerId): GameAction | null {
  const free = freeDon(state, botId);
  if (free.length === 0) return null;
  const donCardId = free[0]!;
  const player = state.players[botId];
  if (player === undefined) return null;

  // Prefer the card with the highest current power
  const candidates: CardId[] = [
    ...player.board,
    ...(player.leader !== null ? [player.leader] : []),
  ].sort((a, b) => calcPower(b, state) - calcPower(a, state));

  for (const targetCardId of candidates) {
    const action: GameAction = { type: 'AssignDon', playerId: botId, donCardId, targetCardId };
    if (tryAction(state, action)) return action;
  }
  return null;
}

/**
 * Play the best affordable card from hand.
 * Priority: OnPlay high-value effect > any OnPlay effect > no effect; then cost desc.
 * Handles Character, Event, and Stage cards.
 */
function playBestCard(state: GameState, botId: PlayerId): GameAction | null {
  const player = state.players[botId];
  if (player === undefined) return null;
  const free = freeDon(state, botId);

  const hand = player.hand
    .map(id => state.cards[id])
    .filter((c): c is NonNullable<typeof c> =>
      c !== undefined &&
      (c.type === 'Character' || c.type === 'Event' || c.type === 'Stage') &&
      c.cost <= free.length,
    )
    .sort((a, b) => {
      // 1. OnPlay effect quality desc (KO/draw/don first)
      const sdiff = effectScore(b) - effectScore(a);
      if (sdiff !== 0) return sdiff;
      // 2. Cost desc (spend more DON when effect quality is equal)
      return b.cost - a.cost;
    });

  for (const card of hand) {
    const action: GameAction = card.type === 'Event'
      ? { type: 'PlayEvent',             playerId: botId, cardId: card.id }
      : { type: 'PlayCharacterFromHand', playerId: botId, cardId: card.id };
    if (tryAction(state, action)) return action;
  }
  return null;
}

/**
 * Declare the most profitable attack.
 *
 * Attacker priority: Rush/DoubleAttack first, then power desc.
 * Target priority:   rested characters (weakest first) → active characters
 *                    (weakest that we can beat) → leader (always try).
 */
function declareAttack(state: GameState, botId: PlayerId): GameAction | null {
  const player = state.players[botId];
  if (player === undefined) return null;
  const opponentId = state.playerOrder.find(id => id !== botId);
  if (opponentId === undefined) return null;
  const opponent = state.players[opponentId];
  if (opponent === undefined) return null;

  // Collect untapped attackers, prioritise Rush/DoubleAttack then power
  const attackerIds: CardId[] = [
    ...player.board.filter(id => !state.cards[id]?.tapped && state.cards[id]?.type === 'Character'),
    ...(player.leader !== null && !state.cards[player.leader]?.tapped ? [player.leader] : []),
  ].sort((a, b) => {
    const aRush = cardHasKw(state, a, 'Rush') || cardHasKw(state, a, 'DoubleAttack');
    const bRush = cardHasKw(state, b, 'Rush') || cardHasKw(state, b, 'DoubleAttack');
    if (aRush && !bRush) return -1;
    if (!aRush && bRush) return 1;
    return calcPower(b, state) - calcPower(a, state);
  });

  // Rested opp characters first (guaranteed KO on pass), weakest first within each group
  const restedTargets = [...opponent.board]
    .filter(id => state.cards[id]?.tapped === true)
    .sort((a, b) => calcPower(a, state) - calcPower(b, state));

  // Active characters: only attack if we can beat them
  const activeTargets = [...opponent.board]
    .filter(id => !state.cards[id]?.tapped)
    .sort((a, b) => calcPower(a, state) - calcPower(b, state));

  const targetIds: CardId[] = [
    ...restedTargets,
    ...activeTargets,
    ...(opponent.leader !== null ? [opponent.leader] : []),
  ];

  for (const attackerId of attackerIds) {
    const attackerPower = calcPower(attackerId, state);
    for (const targetId of targetIds) {
      const targetRested = state.cards[targetId]?.tapped === true;
      const isLeader = targetId === opponent.leader;
      // Skip active non-leader targets where we'd lose (waste the attack)
      if (!targetRested && !isLeader) {
        if (attackerPower < calcPower(targetId, state)) continue;
      }
      const action: GameAction = { type: 'DeclareAttack', playerId: botId, attackerId, targetId };
      if (tryAction(state, action)) return action;
    }
  }
  return null;
}

/**
 * Decide how to defend during the opponent's attack.
 * Only defend if the target is "important" (Leader / power ≥ 4000 / has Activated or OnAttack
 * effect) OR the bot is critically low on life (≤ 2 cards).
 */
function decideCombatDefense(state: GameState, botId: PlayerId): GameAction | null {
  const combat = state.activeCombat;
  if (combat === null || combat.blockerId !== null) return null;

  const attackerPower = calcPower(combat.attackerId, state);
  const targetPower   = calcPower(combat.targetId, state) + combat.counterPower;

  if (attackerPower <= targetPower) return null; // target already survives

  const targetCard = state.cards[combat.targetId];
  const player = state.players[botId];
  if (player === undefined) return null;

  const targetIsImportant =
    targetCard?.type === 'Leader' ||
    (targetCard?.power ?? 0) >= 4000 ||
    (targetCard?.effects?.some((e) =>
      e.trigger === 'Activated' || e.trigger === 'OnAttack',
    ) ?? false);

  if (!targetIsImportant && player.life.length > 2) return null;

  // Best counter card first (highest counter value)
  const counters = player.hand
    .map(id => state.cards[id])
    .filter((c): c is NonNullable<typeof c> =>
      c !== undefined &&
      ((c.counter ?? 0) > 0 || c.effects?.some((e) => e.trigger === 'Counter') === true),
    )
    .sort((a, b) => (b.counter ?? 0) - (a.counter ?? 0));

  for (const card of counters) {
    const action: GameAction = { type: 'PlayCounter', playerId: botId, cardId: card.id };
    if (tryAction(state, action)) return action;
  }

  // Blocker: only sacrifice one for an important target
  if (targetIsImportant) {
    const blockers = player.board
      .map(id => state.cards[id])
      .filter((c): c is NonNullable<typeof c> =>
        c !== undefined && !c.tapped && (c.keywords ?? []).includes('Blocker'),
      );

    for (const card of blockers) {
      const action: GameAction = { type: 'DeclareBlock', playerId: botId, blockerId: card.id };
      if (tryAction(state, action)) return action;
    }
  }

  return null;
}

/**
 * Main-phase decision order:
 *   1. Activated abilities (use resources before spending DON on cards)
 *   2. Play best affordable card (effect-quality first, then cost)
 *   3. Assign leftover DON to strongest attacker
 *   4. Declare attack
 *   5. End turn
 */
function decideMain(state: GameState, botId: PlayerId): GameAction {
  const activatedAction = tryActivatedAbilities(state, botId);
  if (activatedAction !== null) return activatedAction;

  const playAction = playBestCard(state, botId);
  if (playAction !== null) return playAction;

  const donAction = assignOneDon(state, botId);
  if (donAction !== null) return donAction;

  const attackAction = declareAttack(state, botId);
  if (attackAction !== null) return attackAction;

  return { type: 'EndPhase', playerId: botId };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Greedy bot: returns the next action the bot should take, or null if it's not
 * the bot's turn (or no action is needed).
 *
 * Call this in a loop (with a delay between calls) until it returns null.
 */
export function greedyBotDecide(state: GameState, botId: PlayerId): GameAction | null {
  if (state.winner !== null) return null;

  // ── Pending interaction handlers ──────────────────────────────────────────

  if (state.pendingSearchInteraction !== null && state.pendingSearchInteraction.playerId === botId) {
    const pending = state.pendingSearchInteraction;

    // Trash-return path: return up to maxSelect cards from matched trash cards
    if (pending.source === 'trash') {
      const maxSel = pending.maxSelect ?? 1;
      const toReturn = pending.revealedCardIds.slice(0, maxSel) as unknown as readonly CardId[];
      return { type: 'ResolveSearchInteraction', playerId: botId, chosenCardId: null, chosenCardIds: toReturn };
    }

    // Deck-search path: pick the most useful matching card
    const f = pending.filter;
    const matchingIds = pending.revealedCardIds.filter((id) => {
      const c = state.cards[id];
      if (c === undefined) return false;
      switch (f.kind) {
        case 'Any': return true;
        case 'ByType': return c.type === f.cardType;
        case 'ByCost': return c.cost <= f.maxCost;
        case 'ByName': return c.name === f.name;
        case 'BySubType': {
          if (f.cardType !== undefined && c.type !== f.cardType) return false;
          if (c.subTypes === undefined || !c.subTypes.includes(f.subType)) return false;
          if (f.excludeNames !== undefined && f.excludeNames.includes(c.name)) return false;
          return true;
        }
      }
    });
    // Sort by usefulness desc — pick the card with the most value
    const sortedIds = [...matchingIds].sort((a, b) => {
      const ca = state.cards[a];
      const cb = state.cards[b];
      if (ca === undefined || cb === undefined) return 0;
      return cardUsefulnessScore(cb) - cardUsefulnessScore(ca);
    });
    const chosen = sortedIds[0] ?? null;
    return { type: 'ResolveSearchInteraction', playerId: botId, chosenCardId: chosen };
  }

  if (state.pendingTrashInteraction !== null && state.pendingTrashInteraction.playerId === botId) {
    const pending = state.pendingTrashInteraction;
    const player = state.players[botId];
    const f = pending.filter;
    const validCards = (player?.hand ?? [])
      .map((id) => state.cards[id])
      .filter((c): c is NonNullable<typeof c> => {
        if (c === undefined) return false;
        if (f.color     !== undefined && c.color !== f.color) return false;
        if (f.cardType  !== undefined && (c.type as string) !== f.cardType) return false;
        if (f.cardTypes !== undefined && !(f.cardTypes as readonly string[]).includes(c.type)) return false;
        if (f.maxPower  !== undefined && c.power > f.maxPower) return false;
        if (f.excludeSelf === true && c.id === pending.sourceCardId) return false;
        if (f.subType !== undefined && c.subTypes !== undefined && !c.subTypes.includes(f.subType)) return false;
        return true;
      });
    if (pending.optional === true && validCards.length === 0) {
      return { type: 'ResolveTrashInteraction', playerId: botId, trashedCardIds: [] };
    }
    const maxCount = pending.count ?? validCards.length;
    const toTrash = validCards.slice(0, maxCount);
    return { type: 'ResolveTrashInteraction', playerId: botId, trashedCardIds: toTrash.map((c) => c.id) };
  }

  if (state.pendingRevealInteraction !== null && state.pendingRevealInteraction.playerId === botId) {
    const pending = state.pendingRevealInteraction;
    if (pending.filter === undefined) {
      return { type: 'ResolveRevealInteraction', playerId: botId, revealedCardIds: pending.revealedCardIds ?? [] };
    }
    const player = state.players[botId];
    const f = pending.filter;
    const validCards = (player?.hand ?? [])
      .map((id) => state.cards[id])
      .filter((c): c is NonNullable<typeof c> => {
        if (c === undefined) return false;
        if (f.color !== undefined && c.color !== f.color) return false;
        if (f.cardType !== undefined && c.type !== f.cardType) return false;
        if (f.maxPower !== undefined && c.power > f.maxPower) return false;
        if (f.excludeSelf === true && c.id === pending.sourceCardId) return false;
        if (f.subType !== undefined && c.subTypes !== undefined && !c.subTypes.includes(f.subType)) return false;
        return true;
      });
    if (validCards.length < pending.count) {
      return { type: 'ResolveRevealInteraction', playerId: botId, revealedCardIds: [] };
    }
    const toReveal = validCards.slice(0, pending.count).map((c) => c.id);
    return { type: 'ResolveRevealInteraction', playerId: botId, revealedCardIds: toReveal };
  }

  if (state.pendingTargetInteraction !== null && state.pendingTargetInteraction.playerId === botId) {
    const pending = state.pendingTargetInteraction;
    const opponentId = state.playerOrder.find((id) => id !== botId);
    const isOpponentScope = pending.scope === 'ChooseOpponentCharacter' || pending.scope === 'ChooseOpponentCharacterOrLeader';
    const ownerId = isOpponentScope ? opponentId : botId;
    if (ownerId === undefined) return null;
    const boardIds = state.players[ownerId]?.board ?? [];
    const isLeaderScope = pending.scope === 'ChooseOwnCharacterOrLeader' || pending.scope === 'ChooseOpponentCharacterOrLeader';
    const leaderIds: readonly CardId[] = isLeaderScope && state.players[ownerId]?.leader !== null
      ? [state.players[ownerId]!.leader!]
      : [];
    const candidates = [...boardIds, ...leaderIds]
      .map((id) => state.cards[id])
      .filter((c): c is NonNullable<typeof c> => {
        if (c === undefined) return false;
        if (c.type !== 'Character' && c.type !== 'Leader') return false;
        if (pending.maxCost  !== undefined && c.cost  > pending.maxCost)  return false;
        if (pending.maxPower !== undefined && c.power > pending.maxPower) return false;
        return true;
      })
      .sort((a, b) => b.power - a.power); // target strongest opponent / buff strongest own
    if (candidates.length === 0) return null;
    return { type: 'ResolveTargetInteraction', playerId: botId, targetCardId: candidates[0]!.id };
  }

  // ForceDiscard: discard least-useful cards first (lowest usefulness score)
  if (state.pendingForceDiscardInteraction !== null && state.pendingForceDiscardInteraction.playerId === botId) {
    const pending = state.pendingForceDiscardInteraction;
    const player = state.players[botId];
    const hand = (player?.hand ?? [])
      .map((id) => state.cards[id])
      .filter((c): c is NonNullable<typeof c> => c !== undefined)
      .sort((a, b) => cardUsefulnessScore(a) - cardUsefulnessScore(b)); // least useful first
    const toDiscard = hand.slice(0, pending.count).map((c) => c.id);
    return { type: 'ResolveForceDiscardInteraction', playerId: botId, discardedCardIds: toDiscard };
  }

  if (state.pendingForcedAttack !== null && state.pendingForcedAttack.ownerId === botId) {
    const forced = state.pendingForcedAttack;
    const opponentId = state.playerOrder.find((id) => id !== botId);
    if (opponentId === undefined) return null;
    const opponent = state.players[opponentId];
    if (opponent === undefined) return null;
    const targetId = opponent.leader ?? (opponent.board.find((id) => state.cards[id]?.tapped === true) ?? null);
    if (targetId === null) return null;
    return { type: 'DeclareAttack', playerId: botId, attackerId: forced.attackerCardId, targetId };
  }

  if (state.pendingKOSubstituteInteraction !== null && state.pendingKOSubstituteInteraction.playerId === botId) {
    return { type: 'ResolveKOSubstitute', playerId: botId, discardedCardId: null };
  }

  // ChooseOne: pick the option with the highest action-value score (draw > KO > don > buff)
  if (state.pendingChoiceInteraction !== null && state.pendingChoiceInteraction.playerId === botId) {
    const choices = state.pendingChoiceInteraction.choices;
    const actionScore = (acts: readonly { type: string }[]): number => {
      let s = 0;
      for (const a of acts) {
        if (a.type === 'KO')         s += 4;
        else if (a.type === 'DrawCard')  s += 3;
        else if (a.type === 'SearchDeck') s += 3;
        else if (a.type === 'GiveDon')   s += 2;
        else if (a.type === 'PowerBoost') s += 1;
      }
      return s;
    };
    const bestIdx = choices
      .map((c, i) => ({ i, s: actionScore(c.actions as readonly { type: string }[]) }))
      .sort((a, b) => b.s - a.s)[0]?.i ?? 0;
    return { type: 'ResolveChoiceInteraction', playerId: botId, choiceIndex: bestIdx };
  }

  if (state.pendingLifeInteraction != null && state.pendingLifeInteraction.playerId === botId) {
    const li = state.pendingLifeInteraction;
    if (li.mode === 'LookOnly') {
      return { type: 'ResolveLifeInteraction', playerId: botId };
    }
    if (li.mode === 'Rearrange') {
      return { type: 'ResolveLifeInteraction', playerId: botId, newOrder: li.lifeCards };
    }
    if (li.mode === 'MoveOne') {
      const cardId = li.lifeCards[0];
      if (cardId !== undefined) {
        return { type: 'ResolveLifeInteraction', playerId: botId, cardId, destination: 'bottom' };
      }
      return { type: 'ResolveLifeInteraction', playerId: botId };
    }
    if (li.mode === 'OpponentChoice') {
      return { type: 'ResolveLifeInteraction', playerId: botId, choiceIndex: 0 };
    }
    return { type: 'ResolveLifeInteraction', playerId: botId };
  }

  if (state.pendingRestSubstituteInteraction !== null && state.pendingRestSubstituteInteraction.playerId === botId) {
    return { type: 'ResolveRestSubstituteInteraction', playerId: botId, accept: true };
  }

  if (state.pendingOnKOInteraction !== null && state.pendingOnKOInteraction.playerId === botId) {
    const pending = state.pendingOnKOInteraction;
    const player = state.players[botId];
    const f = pending.filter;
    const best = (player?.hand ?? [])
      .map((id) => state.cards[id])
      .filter((c): c is NonNullable<typeof c> => {
        if (c === undefined) return false;
        if (f.color !== undefined && c.color !== f.color) return false;
        if (f.cardType !== undefined && c.type !== f.cardType) return false;
        if (f.maxPower !== undefined && c.power > f.maxPower) return false;
        if (f.excludeSelf === true && c.id === pending.sourceCardId) return false;
        return true;
      })
      .sort((a, b) => b.power - a.power)[0];
    return { type: 'ResolveOnKOInteraction', playerId: botId, cardId: best?.id ?? null };
  }

  // ── Turn / combat routing ─────────────────────────────────────────────────

  const { phase, activePlayerId, activeCombat } = state;

  // Bot is the defender — human must resolve any pending interaction first
  if (activeCombat !== null && activePlayerId !== botId) {
    const targetCard = state.cards[activeCombat.targetId];
    if (targetCard?.ownerId === botId) {
      const humanHasPending = [
        state.pendingTargetInteraction,
        state.pendingOnKOInteraction,
        state.pendingRevealInteraction,
        state.pendingTrashInteraction,
        state.pendingSearchInteraction,
        state.pendingForceDiscardInteraction,
        state.pendingKOSubstituteInteraction,
        state.pendingChoiceInteraction,
        state.pendingRestSubstituteInteraction,
        state.pendingLifeInteraction ?? null,
      ].some((p) => p !== null && p.playerId !== botId);
      if (humanHasPending) return null;
      return decideCombatDefense(state, botId);
    }
    return null;
  }

  if (activePlayerId !== botId) return null;

  // Wait if the human player has any unresolved pending interaction on the bot's turn
  const humanHasAnyPending = [
    state.pendingTargetInteraction,
    state.pendingOnKOInteraction,
    state.pendingRevealInteraction,
    state.pendingTrashInteraction,
    state.pendingSearchInteraction,
    state.pendingForceDiscardInteraction,
    state.pendingKOSubstituteInteraction,
    state.pendingChoiceInteraction,
    state.pendingRestSubstituteInteraction,
    state.pendingLifeInteraction ?? null,
  ].some((p) => p !== null && p.playerId !== botId);
  if (humanHasAnyPending) return null;

  switch (phase) {
    case 'Mulligan':
      return decideMulligan(state, botId);
    case 'Refresh':
      return { type: 'EndPhase', playerId: botId };
    case 'Draw':
      return { type: 'DrawPhase', playerId: botId };
    case 'DON':
      // Skip DON phase — keep DON free for card costs and attack boosts in Main.
      return { type: 'EndPhase', playerId: botId };
    case 'Main':
      if (activeCombat !== null) {
        return { type: 'ResolveCombat', playerId: botId };
      }
      return decideMain(state, botId);
    case 'End':
      return { type: 'EndPhase', playerId: botId };
    default:
      return null;
  }
}
