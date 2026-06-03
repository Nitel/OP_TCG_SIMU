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

// ─── Inline Permanent condition evaluator ────────────────────────────────────

/**
 * Minimal pure condition evaluator for Permanent effects (no side effects).
 * Handles the subset of conditions that appear in Permanent GiveKeyword/PowerBoost effects.
 * Unknown condition types → false (safe default: no permanent buff applied).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function evalPermCond(cond: any, cardId: CardId, state: GameState): boolean {
  if (!cond) return true;
  const card = state.cards[cardId];
  if (!card) return false;
  const [p1, p2] = state.playerOrder;
  const ownerId = card.ownerId;
  const oppId = ownerId === p1 ? p2 : p1;

  switch (cond.type) {
    case 'Always': return true;
    case 'HasAttachedDon': return countAttachedDon(state.cards, cardId) >= (cond.count ?? 0);
    case 'LeaderHasAttachedDon': {
      const lid = state.players[ownerId]?.leader;
      return lid !== undefined && lid !== null && countAttachedDon(state.cards, lid) >= (cond.count ?? 0);
    }
    case 'HasRestingDon': {
      const donArea = state.players[ownerId]?.donArea ?? [];
      return donArea.filter((id) => {
        const d = state.cards[id];
        return d !== undefined && !d.tapped && d.attachedTo === null;
      }).length >= (cond.count ?? 0);
    }
    case 'LeaderHasType': {
      const leaderId = state.players[ownerId]?.leader;
      if (!leaderId) return false;
      const leader = state.cards[leaderId];
      return typeof leader?.subTypes === 'string' && leader.subTypes.includes(cond.subType);
    }
    case 'LeaderHasAnyType': {
      const leaderId2 = state.players[ownerId]?.leader;
      if (!leaderId2) return false;
      const leader2 = state.cards[leaderId2];
      return Array.isArray(cond.subTypes) && cond.subTypes.some((t: string) =>
        typeof leader2?.subTypes === 'string' && leader2.subTypes.includes(t),
      );
    }
    case 'OpponentLifeCount': case 'OpponentLife': {
      const oppLife = state.players[oppId]?.life.length ?? 0;
      if (cond.max !== undefined && oppLife > cond.max) return false;
      if (cond.min !== undefined && oppLife < cond.min) return false;
      if (cond.value !== undefined) {
        const c = cond.comparison;
        const ok = (c === 'LessThanOrEqual' || c === 'LessOrEqual') ? oppLife <= cond.value
                 : (c === 'GreaterThanOrEqual' || c === 'GreaterOrEqual') ? oppLife >= cond.value
                 : oppLife === cond.value;
        if (!ok) return false;
      }
      return true;
    }
    case 'DonDifference': {
      const ownDon = state.players[ownerId]?.donArea.length ?? 0;
      const oppDon = state.players[oppId]?.donArea.length ?? 0;
      return ownDon + (cond.gap ?? 0) <= oppDon;
    }
    case 'HasCardOnBoard': {
      const hasIt = Object.values(state.cards).some(
        (c) => c.ownerId === ownerId && c.zone === 'board' && (cond.name === undefined || c.name === cond.name),
      );
      return cond.negate === true ? !hasIt : hasIt;
    }
    case 'TrashCount': {
      const trashSize = state.players[ownerId]?.trash.length ?? 0;
      return trashSize >= (cond.min ?? cond.threshold ?? 0);
    }
    case 'TotalDonCount': {
      const totalDon = state.players[ownerId]?.donArea.length ?? 0;
      const comp = cond.comparison;
      return comp === 'LessOrEqual' ? totalDon <= cond.count
           : comp === 'GreaterOrEqual' ? totalDon >= cond.count
           : totalDon === cond.count;
    }
    case 'LifeCount': {
      const lc = state.players[ownerId]?.life.length ?? 0;
      if (cond.max !== undefined && lc > cond.max) return false;
      if (cond.min !== undefined && lc < cond.min) return false;
      return true;
    }
    case 'And': return (cond.conditions ?? []).every((c: unknown) => evalPermCond(c, cardId, state));
    case 'OR':  return (cond.conditions ?? []).some((c: unknown)  => evalPermCond(c, cardId, state));
    case 'Not': return !evalPermCond(cond.condition, cardId, state);
    default:    return false; // unknown condition → no permanent buff
  }
}

// ─── hasKeyword ───────────────────────────────────────────────────────────────

/**
 * Returns true if `card` has `kw` as a permanent keyword, a temporary keyword,
 * or via a Permanent-trigger GiveKeyword effect whose condition is currently met.
 *
 * Pass `state` when permanent conditional keywords (e.g. "If …, gains [Blocker]")
 * should be evaluated. Omitting `state` checks only static/temporary keywords.
 */
export function hasKeyword(card: Card, kw: CardKeyword, state?: GameState): boolean {
  if ((card.keywords ?? []).includes(kw)) return true;
  if ((card.temporaryKeywords ?? []).includes(kw)) return true;
  if (!state) return false;
  // Evaluate Permanent GiveKeyword effects
  for (const eff of card.effects ?? []) {
    if ((eff as { trigger: string }).trigger !== 'Permanent') continue;
    const cond = (eff as { condition?: unknown }).condition;
    if (!evalPermCond(cond, card.id, state)) continue;
    for (const act of eff.actions) {
      if ((act as { type: string }).type === 'GiveKeyword' && (act as { keyword: string }).keyword === kw) return true;
    }
  }
  return false;
}

// ─── computePermanentPowerBonus ───────────────────────────────────────────────

/**
 * Sum of all Permanent+PowerBoost effects on `cardId` whose conditions are currently met.
 * Returns 0 if the card has no Permanent PowerBoost effects.
 */
export function computePermanentPowerBonus(cardId: CardId, state: GameState): number {
  const card = state.cards[cardId];
  if (!card?.effects?.length) return 0;
  let total = 0;
  for (const eff of card.effects) {
    if ((eff as { trigger: string }).trigger !== 'Permanent') continue;
    const cond = (eff as { condition?: unknown }).condition;
    if (!evalPermCond(cond, cardId, state)) continue;
    for (const act of eff.actions) {
      if ((act as { type: string }).type === 'PowerBoost' && typeof (act as { amount: unknown }).amount === 'number') {
        total += (act as { amount: number }).amount;
      }
    }
  }
  return total;
}

// ─── calculatePower ───────────────────────────────────────────────────────────

/**
 * Total power of a card = base power + 1 000 per DON!! attached (owner's turn only)
 * + all temporary/permanent modifiers + conditional Permanent PowerBoost effects.
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

  return card.power + donAttached * 1000
    + (card.powerModifier ?? 0)
    + (card.powerModifierOT ?? 0)
    + (card.powerModifierBattle ?? 0)
    + (card.permanentPowerModifier ?? 0)
    + computePermanentPowerBonus(cardId, state);
}

// ─── clearPowerModifiers ──────────────────────────────────────────────────────

/**
 * Clear `powerModifier` on a set of card IDs (e.g. at end of battle or turn).
 */
export function clearPowerModifiers(state: GameState, cardIds: readonly CardId[]): GameState {
  const updatedCards: Record<string, Card> = { ...state.cards };
  const expired: Array<{ id: CardId; name: string | undefined; amount: number }> = [];
  for (const id of cardIds) {
    const pm = updatedCards[id]?.powerModifier;
    if (pm !== undefined) {
      const { powerModifier: _pm, ...rest } = updatedCards[id]!;
      void _pm;
      updatedCards[id] = rest;
      expired.push({ id, name: state.cards[id]?.name, amount: pm });
    }
  }
  if (expired.length === 0) return state;
  const newState: GameState = { ...state, cards: updatedCards as Readonly<Record<CardId, Card>> };
  const expiredLogs = expired.map((e, i) => ({
    seq: newState.gameLog.length + i,
    event: 'POWER_BOOST_EXPIRED' as const,
    message: `Power modifier ${e.amount > 0 ? '+' : ''}${e.amount} expired on "${e.name ?? e.id}"`,
    cardId: e.id,
    cardName: e.name,
    turn: newState.turnNumber,
  }));
  return { ...newState, gameLog: [...newState.gameLog, ...expiredLogs] };
}

// ─── clearCostModifiers ───────────────────────────────────────────────────────

/**
 * Clear `costModifier` (temporary cost changes) from all cards at end of turn.
 */
export function clearCostModifiers(state: GameState): GameState {
  const updatedCards: Record<string, Card> = { ...state.cards };
  let changed = false;
  for (const [id, card] of Object.entries(state.cards)) {
    if (card.costModifier !== undefined) {
      const { costModifier: _cm, ...rest } = card;
      void _cm;
      updatedCards[id] = rest;
      changed = true;
    }
  }
  // Clear lifeToHandBlocked on all players
  const updatedPlayers = { ...state.players };
  let playerChanged = false;
  for (const [pid, player] of Object.entries(state.players)) {
    if (player.lifeToHandBlocked === true) {
      const { lifeToHandBlocked: _ltb, ...rest } = player;
      void _ltb;
      updatedPlayers[pid as import('../types/index.js').PlayerId] = rest;
      playerChanged = true;
    }
  }
  if (!changed && !playerChanged) return state;
  return {
    ...state,
    ...(changed ? { cards: updatedCards as Readonly<Record<import('../types/index.js').CardId, Card>> } : {}),
    ...(playerChanged ? { players: updatedPlayers as typeof state.players } : {}),
  };
}

// ─── clearBattlePowerModifiers ────────────────────────────────────────────────

/**
 * Clear `powerModifierBattle` (EndOfBattle duration) from ALL cards in play.
 * Called at the end of every combat resolution.
 */
export function clearBattlePowerModifiers(state: GameState): GameState {
  const updatedCards: Record<string, Card> = { ...state.cards };
  const expired: Array<{ id: CardId; name: string | undefined; amount: number }> = [];
  for (const [id, card] of Object.entries(state.cards)) {
    if (card.powerModifierBattle !== undefined) {
      const { powerModifierBattle: _pmb, ...rest } = card;
      void _pmb;
      updatedCards[id] = rest;
      expired.push({ id: id as CardId, name: card.name, amount: card.powerModifierBattle });
    }
  }
  if (expired.length === 0) return state;
  const newState: GameState = { ...state, cards: updatedCards as Readonly<Record<CardId, Card>> };
  const logs = expired.map((e, i) => ({
    seq: newState.gameLog.length + i,
    event: 'POWER_BOOST_EXPIRED' as const,
    message: `Battle power modifier ${e.amount > 0 ? '+' : ''}${e.amount} expired on "${e.name ?? e.id}"`,
    cardId: e.id,
    cardName: e.name,
    turn: newState.turnNumber,
  }));
  return { ...newState, gameLog: [...newState.gameLog, ...logs] };
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
 * Remove all `temporaryKeywords` and `effectsNegated` from every card in state (called at end of turn).
 */
export function clearTemporaryKeywords(state: GameState): GameState {
  const updatedCards: Record<string, Card> = { ...state.cards };
  let changed = false;
  for (const [id, card] of Object.entries(state.cards)) {
    if ((card.temporaryKeywords !== undefined && card.temporaryKeywords.length > 0) || card.effectsNegated === true) {
      const { temporaryKeywords: _tk, effectsNegated: _en, ...rest } = card;
      void _tk; void _en;
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

  // Move card to trash, clear power modifiers
  const { powerModifier: _trashPm, powerModifierBattle: _trashPmb, ...cardNoModifier } = card;
  void _trashPm; void _trashPmb;
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

  const { powerModifier: _pm, powerModifierBattle: _pmb, ...cardNoModifier } = card;
  void _pm; void _pmb;
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

  const { powerModifier: _pm, powerModifierBattle: _pmb2, ...cardWithoutModifier } = card;
  void _pm; void _pmb2;
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
