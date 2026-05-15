import { applyAction } from '../core/applyAction.js';
import { isGameError } from '../types/index.js';
import type { GameState, GameAction, PlayerId, CardId } from '../types/index.js';

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

// ─── Phase handlers ───────────────────────────────────────────────────────────

function decideMulligan(state: GameState, botId: PlayerId): GameAction {
  const player = state.players[botId];
  const hand = (player?.hand ?? []).map(id => state.cards[id]).filter((c): c is NonNullable<typeof c> => c !== undefined);
  const playableEarly = hand.filter(c => c.cost <= 2 && c.type !== 'Leader').length;
  return { type: 'Mulligan', playerId: botId, keep: playableEarly >= 2 };
}

function assignOneDon(state: GameState, botId: PlayerId): GameAction | null {
  const free = freeDon(state, botId);
  if (free.length === 0) return null;
  const donCardId = free[0]!;
  const player = state.players[botId];
  if (player === undefined) return null;

  // Prefer board cards ordered by power desc, then leader
  const candidates: CardId[] = [
    ...player.board,
    ...(player.leader !== null ? [player.leader] : []),
  ];
  for (const targetCardId of candidates) {
    const action: GameAction = { type: 'AssignDon', playerId: botId, donCardId, targetCardId };
    if (tryAction(state, action)) return action;
  }
  return null;
}

function playBestCard(state: GameState, botId: PlayerId): GameAction | null {
  const player = state.players[botId];
  if (player === undefined) return null;
  const free = freeDon(state, botId);
  const hand = player.hand
    .map(id => state.cards[id])
    .filter((c): c is NonNullable<typeof c> => c !== undefined && c.type === 'Character' && c.cost <= free.length)
    .sort((a, b) => b.cost - a.cost);

  for (const card of hand) {
    const action: GameAction = { type: 'PlayCharacterFromHand', playerId: botId, cardId: card.id };
    if (tryAction(state, action)) return action;
  }
  return null;
}

function declareAttack(state: GameState, botId: PlayerId): GameAction | null {
  const player = state.players[botId];
  if (player === undefined) return null;
  const opponentId = state.playerOrder.find(id => id !== botId);
  if (opponentId === undefined) return null;
  const opponent = state.players[opponentId];
  if (opponent === undefined) return null;

  // Attackers: board cards not tapped, then leader
  const attackerCandidates: CardId[] = [
    ...player.board.filter(id => !state.cards[id]?.tapped && state.cards[id]?.type === 'Character'),
    ...(player.leader !== null && !state.cards[player.leader]?.tapped ? [player.leader] : []),
  ];

  // Targets: rested opponent characters (weakest first) then leader (always targetable)
  const targetCandidates: CardId[] = [
    ...[...opponent.board]
      .filter(id => state.cards[id]?.tapped === true)
      .sort((a, b) => calcPower(a, state) - calcPower(b, state)),
    ...(opponent.leader !== null ? [opponent.leader] : []),
  ];

  for (const attackerId of attackerCandidates) {
    for (const targetId of targetCandidates) {
      const action: GameAction = { type: 'DeclareAttack', playerId: botId, attackerId, targetId };
      if (tryAction(state, action)) return action;
    }
  }
  return null;
}

function decideMain(state: GameState, botId: PlayerId): GameAction {
  // 1. Play best affordable character (uses free DON as cost payment)
  const playAction = playBestCard(state, botId);
  if (playAction !== null) return playAction;

  // 2. Assign leftover free DON to boost power on board
  const donAction = assignOneDon(state, botId);
  if (donAction !== null) return donAction;

  // 3. Declare an attack
  const attackAction = declareAttack(state, botId);
  if (attackAction !== null) return attackAction;

  // 4. End turn
  return { type: 'EndPhase', playerId: botId };
}

function decideCombatDefense(state: GameState, botId: PlayerId): GameAction | null {
  const combat = state.activeCombat;
  if (combat === null || combat.blockerId !== null) return null;

  const attackerPower = calcPower(combat.attackerId, state);
  const targetPower   = calcPower(combat.targetId, state) + combat.counterPower;

  if (attackerPower <= targetPower) return null; // We survive — take the hit

  const player = state.players[botId];
  if (player === undefined) return null;

  // Try best counter card first
  const counters = player.hand
    .map(id => state.cards[id])
    .filter((c): c is NonNullable<typeof c> =>
      c !== undefined && ((c.counter ?? 0) > 0 || c.effects?.some((e) => e.trigger === 'Counter') === true),
    )
    .sort((a, b) => (b.counter ?? 0) - (a.counter ?? 0));

  for (const card of counters) {
    const action: GameAction = { type: 'PlayCounter', playerId: botId, cardId: card.id };
    if (tryAction(state, action)) return action;
  }

  // Try a blocker
  const blockers = player.board
    .map(id => state.cards[id])
    .filter((c): c is NonNullable<typeof c> =>
      c !== undefined && !c.tapped && (c.keywords ?? []).includes('Blocker'),
    );

  for (const card of blockers) {
    const action: GameAction = { type: 'DeclareBlock', playerId: botId, blockerId: card.id };
    if (tryAction(state, action)) return action;
  }

  return null; // No valid defense
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

  // Handle pending search interaction — bot auto-picks first matching revealed card
  if (state.pendingSearchInteraction !== null && state.pendingSearchInteraction.playerId === botId) {
    const pending = state.pendingSearchInteraction;
    const f = pending.filter;
    const chosen = pending.revealedCardIds.find((id) => {
      const c = state.cards[id];
      if (c === undefined) return false;
      switch (f.kind) {
        case 'Any': return true;
        case 'ByType': return c.type === f.cardType;
        case 'ByCost': return c.cost <= f.maxCost;
        case 'ByName': return c.name === f.name;
      }
    }) ?? null;
    return { type: 'ResolveSearchInteraction', playerId: botId, chosenCardId: chosen };
  }

  // Handle pending trash interaction — bot trashes all eligible cards (maximises power boost)
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
    // Greedy: trash all valid cards to maximise any perTrashedCard power boost
    return { type: 'ResolveTrashInteraction', playerId: botId, trashedCardIds: validCards.map((c) => c.id) };
  }

  if (state.pendingRevealInteraction !== null && state.pendingRevealInteraction.playerId === botId) {
    const pending = state.pendingRevealInteraction;
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

  // Handle pending target interaction
  if (state.pendingTargetInteraction !== null && state.pendingTargetInteraction.playerId === botId) {
    const pending = state.pendingTargetInteraction;
    const opponentId = state.playerOrder.find((id) => id !== botId);
    const isOpponentScope = pending.scope === 'ChooseOpponentCharacter' || pending.scope === 'ChooseOpponentCharacterOrLeader';
    const ownerId = isOpponentScope ? opponentId : botId;
    if (ownerId === undefined) return null;
    const boardIds = state.players[ownerId]?.board ?? [];
    // For ChooseOwnCharacterOrLeader include own leader; for ChooseOpponentCharacterOrLeader include opponent's leader
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
      .sort((a, b) => b.power - a.power);
    if (candidates.length === 0) return null;
    return { type: 'ResolveTargetInteraction', playerId: botId, targetCardId: candidates[0]!.id };
  }

  // Handle pending force-discard interaction — bot discards weakest cards first
  if (state.pendingForceDiscardInteraction !== null && state.pendingForceDiscardInteraction.playerId === botId) {
    const pending = state.pendingForceDiscardInteraction;
    const player = state.players[botId];
    const hand = (player?.hand ?? [])
      .map((id) => state.cards[id])
      .filter((c): c is NonNullable<typeof c> => c !== undefined)
      .sort((a, b) => a.power - b.power);
    const toDiscard = hand.slice(0, pending.count).map((c) => c.id);
    return { type: 'ResolveForceDiscardInteraction', playerId: botId, discardedCardIds: toDiscard };
  }

  // Handle pending forced attack — bot attacks opponent leader with the forced card
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

  // Handle pending OnKO interaction — bot picks the strongest valid card or skips
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

  const { phase, activePlayerId, activeCombat } = state;

  // Bot is the defender during combat (not the active player)
  if (activeCombat !== null && activePlayerId !== botId) {
    const targetCard = state.cards[activeCombat.targetId];
    if (targetCard?.ownerId === botId) {
      // Block until the active player resolves any pending interaction (e.g. [When Attacking])
      const humanHasPending = [
        state.pendingTargetInteraction,
        state.pendingOnKOInteraction,
        state.pendingRevealInteraction,
        state.pendingTrashInteraction,
        state.pendingSearchInteraction,
        state.pendingForceDiscardInteraction,
      ].some((p) => p !== null && p.playerId !== botId);
      if (humanHasPending) return null;
      return decideCombatDefense(state, botId);
    }
    return null;
  }

  if (activePlayerId !== botId) return null;

  switch (phase) {
    case 'Mulligan':
      return decideMulligan(state, botId);
    case 'Refresh':
      return { type: 'EndPhase', playerId: botId };
    case 'Draw':
      return { type: 'DrawPhase', playerId: botId };
    case 'DON':
      // Skip DON attachment here — keep DON free for card costs in Main phase.
      // Any leftover DON are attached in decideMain after cards are played.
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
