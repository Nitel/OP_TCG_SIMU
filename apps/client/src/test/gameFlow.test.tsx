/**
 * gameFlow.test.tsx — GF1–GF17
 *
 * GF1–GF4:  existing render + engine tests (ActionPanel & PlayCounter).
 * GF5–GF7:  card playability — pure engine validation.
 * GF8–GF10: combat flow — ActionPanel buttons after attack declaration.
 * GF11–GF13: pending search interaction — observable messages + engine resolution.
 * GF14–GF15: counter mechanic — ActionPanel hint + engine resolve.
 * GF16–GF17: bot-turn — greedyBotDecide and ActionPanel lockout.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  makeEmptyState,
  makeCardId,
  applyAction,
  isGameError,
  greedyBotDecide,
} from 'game-engine';
import type { Card, CardId, GameState } from 'game-engine';
import { ActionPanel } from '../ui/ActionPanel';
import { IDLE_UI } from '../ui/uiState';
import type { UIState } from '../ui/uiState';
import { renderWithEngine, P1, P2, makeChar, makeDon, bootstrapGame } from './gameTestUtils';

// ─── GF1 : ActionPanel — "Jouer la carte" button with selection mode ──────────

describe('GF1: ActionPanel — play card button when card is selected', () => {
  const cardId = makeCardId('gf1-card') as CardId;

  function makePlayState(): { state: GameState; uiState: UIState } {
    const base = makeEmptyState(P1, P2);
    const card = makeChar('gf1-card', P1, { zone: 'hand', cost: 2 });
    const state: GameState = {
      ...base,
      phase: 'Main',
      activePlayerId: P1,
      playerOrder: [P1, P2],
      turnNumber: 3,
      winner: null,
      cards: { ...base.cards, [cardId]: card },
      players: { ...base.players, [P1]: { ...base.players[P1]!, hand: [cardId] } },
    };
    const uiState: UIState = { ...IDLE_UI, selectionMode: 'play', selectedCardId: cardId };
    return { state, uiState };
  }

  it('renders "Jouer la carte" button when a Character is selected for play', () => {
    const { state, uiState } = makePlayState();
    render(<ActionPanel gameState={state} uiState={uiState} onAction={vi.fn()} myPlayerId={P1} />);
    expect(screen.getByRole('button', { name: /Jouer la carte/ })).toBeInTheDocument();
  });

  it('clicking "Jouer la carte" dispatches PlayCharacterFromHand', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const { state, uiState } = makePlayState();
    render(<ActionPanel gameState={state} uiState={uiState} onAction={onAction} myPlayerId={P1} />);
    await user.click(screen.getByRole('button', { name: /Jouer la carte/ }));
    expect(onAction).toHaveBeenCalledWith({ type: 'PlayCharacterFromHand', playerId: P1, cardId });
  });

  it('renders "Jouer l\'événement" for Event cards', () => {
    const evtId = makeCardId('gf1-event') as CardId;
    const base = makeEmptyState(P1, P2);
    const evt = makeChar('gf1-event', P1, { zone: 'hand', type: 'Event', cost: 1 });
    const state: GameState = {
      ...base,
      phase: 'Main', activePlayerId: P1, playerOrder: [P1, P2], turnNumber: 3, winner: null,
      cards: { ...base.cards, [evtId]: evt },
      players: { ...base.players, [P1]: { ...base.players[P1]!, hand: [evtId] } },
    };
    const uiState: UIState = { ...IDLE_UI, selectionMode: 'play', selectedCardId: evtId };
    render(<ActionPanel gameState={state} uiState={uiState} onAction={vi.fn()} myPlayerId={P1} />);
    expect(screen.getByRole('button', { name: /Jouer l.événement/ })).toBeInTheDocument();
  });
});

// ─── GF2 : Event Counter jouable avec assez de DON ───────────────────────────

describe('GF2: Event counter with sufficient DON — PlayCounter succeeds', () => {
  it('Event cost-2, 2 active DON → PlayCounter accepted, counterPower set', () => {
    const base = bootstrapGame();
    const attackerId = makeCardId('gf2-atk') as CardId;
    const targetId   = makeCardId('gf2-tgt') as CardId;
    const counterId  = makeCardId('gf2-ctr') as CardId;
    const don1 = makeDon('gf2-d1', P2);
    const don2 = makeDon('gf2-d2', P2);

    const state: GameState = {
      ...base,
      activePlayerId: P1,
      cards: {
        ...base.cards,
        [attackerId]: makeChar('gf2-atk', P1, { zone: 'board', tapped: false }),
        [targetId]:   makeChar('gf2-tgt', P2, { zone: 'board', tapped: true }),
        [counterId]:  makeChar('gf2-ctr', P2, { zone: 'hand', type: 'Event', cost: 2, counter: 2000 }),
        [don1.id]: don1, [don2.id]: don2,
      },
      players: {
        ...base.players,
        [P1]: { ...base.players[P1]!, board: [...base.players[P1]!.board, attackerId] },
        [P2]: { ...base.players[P2]!, board: [...base.players[P2]!.board, targetId], hand: [counterId], donArea: [don1.id, don2.id] },
      },
    };

    const afterAttack = applyAction(state, { type: 'DeclareAttack', playerId: P1, attackerId, targetId });
    expect(isGameError(afterAttack)).toBe(false);
    const result = applyAction(afterAttack as GameState, { type: 'PlayCounter', playerId: P2, cardId: counterId });
    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) {
      expect((result as GameState).activeCombat!.counterPower).toBe(2000);
    }
  });
});

// ─── GF3 : Event Counter NON jouable sans assez de DON ───────────────────────

describe('GF3: Event counter with insufficient DON — PlayCounter rejected', () => {
  it('Event cost-2, only 1 active DON → INSUFFICIENT_DON', () => {
    const base = bootstrapGame();
    const attackerId = makeCardId('gf3-atk') as CardId;
    const targetId   = makeCardId('gf3-tgt') as CardId;
    const counterId  = makeCardId('gf3-ctr') as CardId;
    const don1 = makeDon('gf3-d1', P2);

    const state: GameState = {
      ...base,
      activePlayerId: P1,
      cards: {
        ...base.cards,
        [attackerId]: makeChar('gf3-atk', P1, { zone: 'board', tapped: false }),
        [targetId]:   makeChar('gf3-tgt', P2, { zone: 'board', tapped: true }),
        [counterId]:  makeChar('gf3-ctr', P2, { zone: 'hand', type: 'Event', cost: 2, counter: 2000 }),
        [don1.id]: don1,
      },
      players: {
        ...base.players,
        [P1]: { ...base.players[P1]!, board: [...base.players[P1]!.board, attackerId] },
        [P2]: { ...base.players[P2]!, board: [...base.players[P2]!.board, targetId], hand: [counterId], donArea: [don1.id] },
      },
    };

    const afterAttack = applyAction(state, { type: 'DeclareAttack', playerId: P1, attackerId, targetId });
    expect(isGameError(afterAttack)).toBe(false);
    const result = applyAction(afterAttack as GameState, { type: 'PlayCounter', playerId: P2, cardId: counterId });
    expect(isGameError(result)).toBe(true);
    if (isGameError(result)) expect(result.code).toBe('INSUFFICIENT_DON');
  });
});

// ─── GF4 : pendingTargetInteraction — ciblage et skip ────────────────────────

describe('GF4: pendingTargetInteraction — ActionPanel renders target prompt', () => {
  const srcId = makeCardId('gf4-src') as CardId;
  const p2tgtId = makeCardId('gf4-tgt') as CardId;

  function makeTargetState(): GameState {
    const base = makeEmptyState(P1, P2);
    return {
      ...base,
      phase: 'Main', activePlayerId: P1, playerOrder: [P1, P2], turnNumber: 3, winner: null,
      cards: {
        ...base.cards,
        [srcId]:  makeChar('gf4-src',  P1, { zone: 'board' }),
        [p2tgtId]: makeChar('gf4-tgt', P2, { zone: 'board', tapped: true }),
      },
      pendingTargetInteraction: {
        playerId: P1, scope: 'ChooseOpponentCharacter', sourceCardId: srcId, sourcePlayerId: P1,
        pendingAction: { type: 'KO', target: { scope: 'ChooseOpponentCharacter' } } as never,
        pendingEffectActions: [], pendingEffects: [], trigger: 'OnPlay',
      },
    };
  }

  const chooseUI: UIState = { ...IDLE_UI, selectionMode: 'chooseTarget', targetScope: 'ChooseOpponentCharacter' };

  it('renders "Cliquez une carte adverse" target hint', () => {
    render(<ActionPanel gameState={makeTargetState()} uiState={chooseUI} onAction={vi.fn()} myPlayerId={P1} />);
    expect(screen.getByText(/Cliquez une carte/)).toBeInTheDocument();
  });

  it('renders "Passer" button for skipping target selection', () => {
    render(<ActionPanel gameState={makeTargetState()} uiState={chooseUI} onAction={vi.fn()} myPlayerId={P1} />);
    expect(screen.getByRole('button', { name: 'Passer' })).toBeInTheDocument();
  });

  it('clicking "Passer" dispatches ResolveTargetInteraction with targetCardId: null', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(<ActionPanel gameState={makeTargetState()} uiState={chooseUI} onAction={onAction} myPlayerId={P1} />);
    await user.click(screen.getByRole('button', { name: 'Passer' }));
    expect(onAction).toHaveBeenCalledWith({ type: 'ResolveTargetInteraction', playerId: P1, targetCardId: null });
  });

  it('pendingTargetInteraction creation via PlayCharacterFromHand + KO effect', () => {
    const gameBase = bootstrapGame();
    const src = makeChar('gf4b-src', P1, {
      zone: 'hand', cost: 0,
      effects: [{ trigger: 'OnPlay', actions: [{ type: 'KO', target: { scope: 'ChooseOpponentCharacter' } }] }],
    });
    const p2t = makeChar('gf4b-tgt', P2, { zone: 'board', tapped: true });
    const srcId2 = src.id as CardId;
    const tgtId2 = p2t.id as CardId;
    const st: GameState = {
      ...gameBase,
      cards: { ...gameBase.cards, [srcId2]: src, [tgtId2]: p2t },
      players: {
        ...gameBase.players,
        [P1]: { ...gameBase.players[P1]!, hand: [srcId2] },
        [P2]: { ...gameBase.players[P2]!, board: [...gameBase.players[P2]!.board, tgtId2] },
      },
    };
    const after = applyAction(st, { type: 'PlayCharacterFromHand', playerId: P1, cardId: srcId2 });
    expect(isGameError(after)).toBe(false);
    if (!isGameError(after)) {
      const gs = after as GameState;
      expect(gs.pendingTargetInteraction).not.toBeNull();
      expect(gs.pendingTargetInteraction?.scope).toBe('ChooseOpponentCharacter');
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GF5–GF7 — Card playability (engine)
// ═══════════════════════════════════════════════════════════════════════════════

describe('GF5: card with cost ≤ active DON — engine accepts PlayCharacterFromHand', () => {
  it('engine accepts PlayCharacterFromHand when card cost ≤ active DON', () => {
    const base = bootstrapGame();
    const cardId = makeCardId('gf5-card') as CardId;
    const don1 = makeDon('gf5-d1', P1);
    const don2 = makeDon('gf5-d2', P1);
    const card = makeChar('gf5-card', P1, { zone: 'hand', cost: 2 });
    const st: GameState = {
      ...base,
      cards: { ...base.cards, [cardId]: card, [don1.id]: don1, [don2.id]: don2 },
      players: {
        ...base.players,
        [P1]: { ...base.players[P1]!, hand: [cardId], donArea: [don1.id, don2.id] },
      },
    };
    const result = applyAction(st, { type: 'PlayCharacterFromHand', playerId: P1, cardId });
    expect(isGameError(result)).toBe(false);
  });
});

describe('GF6: after PlayCharacterFromHand card is in board zone', () => {
  it('card moves from hand to board after playing', () => {
    const base = bootstrapGame();
    const cardId = makeCardId('gf6-card') as CardId;
    const don1 = makeDon('gf6-d1', P1);
    const don2 = makeDon('gf6-d2', P1);
    const card = makeChar('gf6-card', P1, { zone: 'hand', cost: 2 });
    const st: GameState = {
      ...base,
      cards: { ...base.cards, [cardId]: card, [don1.id]: don1, [don2.id]: don2 },
      players: {
        ...base.players,
        [P1]: { ...base.players[P1]!, hand: [cardId], donArea: [don1.id, don2.id] },
      },
    };
    const result = applyAction(st, { type: 'PlayCharacterFromHand', playerId: P1, cardId });
    expect(isGameError(result)).toBe(false);
    const gs = result as GameState;
    expect(gs.cards[cardId]?.zone).toBe('board');
    expect(gs.players[P1]?.board).toContain(cardId);
    expect(gs.players[P1]?.hand).not.toContain(cardId);
  });
});

describe('GF7: card cost > active DON — engine rejects PlayCharacterFromHand', () => {
  it('engine rejects PlayCharacterFromHand when card cost exceeds active DON', () => {
    const base = bootstrapGame();
    const cardId = makeCardId('gf7-card') as CardId;
    // Cost 5, but only 2 active DON
    const don1 = makeDon('gf7-d1', P1);
    const don2 = makeDon('gf7-d2', P1);
    const card = makeChar('gf7-card', P1, { zone: 'hand', cost: 5 });
    const st: GameState = {
      ...base,
      cards: { ...base.cards, [cardId]: card, [don1.id]: don1, [don2.id]: don2 },
      players: {
        ...base.players,
        [P1]: { ...base.players[P1]!, hand: [cardId], donArea: [don1.id, don2.id] },
      },
    };
    const result = applyAction(st, { type: 'PlayCharacterFromHand', playerId: P1, cardId });
    expect(isGameError(result)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GF8–GF10 — Combat flow (ActionPanel + engine)
// ═══════════════════════════════════════════════════════════════════════════════

describe('GF8: selecting a character for attack shows the attack target hint', () => {
  it('ActionPanel shows attack hint when selectionMode is "attack"', () => {
    const base = bootstrapGame();
    const atkId = makeCardId('gf8-atk') as CardId;
    const atk = makeChar('gf8-atk', P1, { zone: 'board', tapped: false });
    const st: GameState = {
      ...base,
      cards: { ...base.cards, [atkId]: atk },
      players: { ...base.players, [P1]: { ...base.players[P1]!, board: [atkId] } },
    };
    const ui: UIState = { ...IDLE_UI, selectionMode: 'attack', selectedCardId: atkId };
    render(<ActionPanel gameState={st} uiState={ui} onAction={vi.fn()} myPlayerId={P1} />);
    expect(screen.getByText(/Cliquez sur le leader ou un personnage adverse/i)).toBeInTheDocument();
  });
});

describe('GF9: after DeclareAttack combat is active — engine state updated', () => {
  it('activeCombat is set after DeclareAttack', () => {
    const base = bootstrapGame();
    const atkId = makeCardId('gf9-atk') as CardId;
    const tgtId = makeCardId('gf9-tgt') as CardId;
    const atk = makeChar('gf9-atk', P1, { zone: 'board', tapped: false });
    const tgt = makeChar('gf9-tgt', P2, { zone: 'board', tapped: true });
    const st: GameState = {
      ...base,
      cards: { ...base.cards, [atkId]: atk, [tgtId]: tgt },
      players: {
        ...base.players,
        [P1]: { ...base.players[P1]!, board: [atkId] },
        [P2]: { ...base.players[P2]!, board: [tgtId] },
      },
    };
    const result = applyAction(st, { type: 'DeclareAttack', playerId: P1, attackerId: atkId, targetId: tgtId });
    expect(isGameError(result)).toBe(false);
    expect((result as GameState).activeCombat).not.toBeNull();
    expect((result as GameState).activeCombat?.attackerId).toBe(atkId);
  });
});

describe('GF10: "Résoudre le combat" button visible to attacker after DeclareAttack', () => {
  it('attacker sees "Résoudre le combat" button', () => {
    const atkId = makeCardId('gf10-atk') as CardId;
    const tgtId = makeCardId('gf10-tgt') as CardId;
    const base = bootstrapGame();
    const st: GameState = {
      ...base,
      activeCombat: { attackerId: atkId, targetId: tgtId, blockerId: null, counterPower: 0 },
      cards: {
        ...base.cards,
        [atkId]: makeChar('gf10-atk', P1, { zone: 'board', tapped: true }),
        [tgtId]: makeChar('gf10-tgt', P2, { zone: 'board', tapped: true }),
      },
    };
    render(<ActionPanel gameState={st} uiState={IDLE_UI} onAction={vi.fn()} myPlayerId={P1} />);
    expect(screen.getByRole('button', { name: /Résoudre le combat/i })).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GF11–GF13 — Pending search interaction
// ═══════════════════════════════════════════════════════════════════════════════

describe('GF11: pendingSearchInteraction — "Cherchez une carte" message visible', () => {
  it('ActionPanel shows search pending message', () => {
    const srcId = makeCardId('gf11-src') as CardId;
    const revId = makeCardId('gf11-rev') as CardId;
    const base = bootstrapGame();
    const st: GameState = {
      ...base,
      pendingSearchInteraction: {
        playerId: P1, sourceCardId: srcId, sourcePlayerId: P1,
        revealedCardIds: [revId],
        filter: { kind: 'Any' } as never,
        destination: 'hand',
        pendingEffectActions: [], pendingEffects: [], trigger: 'OnPlay',
      },
    };
    render(<ActionPanel gameState={st} uiState={IDLE_UI} onAction={vi.fn()} myPlayerId={P1} />);
    expect(screen.getByText(/Cherchez une carte/i)).toBeInTheDocument();
  });
});

describe('GF12: ResolveSearchInteraction with chosen card — card added to hand', () => {
  it('chosen card ends up in P1 hand after resolve', () => {
    const base = bootstrapGame();
    const deckCardId = base.players[P1]!.deck[0]!;
    const srcId = makeCardId('gf12-src') as CardId;
    const st: GameState = {
      ...base,
      pendingSearchInteraction: {
        playerId: P1, sourceCardId: srcId, sourcePlayerId: P1,
        revealedCardIds: [deckCardId],
        filter: { kind: 'Any' } as never,
        destination: 'hand',
        pendingEffectActions: [], pendingEffects: [], trigger: 'OnPlay',
      },
    };
    const result = applyAction(st, {
      type: 'ResolveSearchInteraction', playerId: P1, chosenCardId: deckCardId,
    });
    expect(isGameError(result)).toBe(false);
    const gs = result as GameState;
    expect(gs.players[P1]?.hand).toContain(deckCardId);
    expect(gs.pendingSearchInteraction).toBeNull();
  });
});

describe('GF13: ResolveSearchInteraction with null — no card added, interaction cleared', () => {
  it('skipping search leaves hand unchanged and clears pendingSearchInteraction', () => {
    const base = bootstrapGame();
    const deckCardId = base.players[P1]!.deck[0]!;
    const srcId = makeCardId('gf13-src') as CardId;
    const handBefore = base.players[P1]!.hand;
    const st: GameState = {
      ...base,
      pendingSearchInteraction: {
        playerId: P1, sourceCardId: srcId, sourcePlayerId: P1,
        revealedCardIds: [deckCardId],
        filter: { kind: 'Any' } as never,
        destination: 'hand',
        pendingEffectActions: [], pendingEffects: [], trigger: 'OnPlay',
      },
    };
    const result = applyAction(st, {
      type: 'ResolveSearchInteraction', playerId: P1, chosenCardId: null,
    });
    expect(isGameError(result)).toBe(false);
    const gs = result as GameState;
    expect(gs.pendingSearchInteraction).toBeNull();
    expect(gs.players[P1]?.hand.length).toBe(handBefore.length);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GF14–GF15 — Counter mechanic
// ═══════════════════════════════════════════════════════════════════════════════

describe('GF14: during combat, defender sees counter hint in ActionPanel', () => {
  it('counter hint visible for defender when combat is active and unpaired', () => {
    const atkId = makeCardId('gf14-atk') as CardId;
    const tgtId = makeCardId('gf14-tgt') as CardId;
    const base = bootstrapGame();
    const st: GameState = {
      ...base,
      activeCombat: { attackerId: atkId, targetId: tgtId, blockerId: null, counterPower: 0 },
      cards: {
        ...base.cards,
        [atkId]: makeChar('gf14-atk', P1, { zone: 'board', tapped: true }),
        [tgtId]: makeChar('gf14-tgt', P2, { zone: 'board', tapped: true }),
      },
    };
    // Render as defender (P2)
    render(<ActionPanel gameState={st} uiState={IDLE_UI} onAction={vi.fn()} myPlayerId={P2} />);
    // Defender sees "Cliquez une carte main (cyan) pour contrer" hint
    expect(screen.getByText(/cliquez une carte main.*pour contrer/i)).toBeInTheDocument();
  });
});

describe('GF15: PlayCounter + ResolveCombat resolves the fight', () => {
  it('counterPower is set after PlayCounter and combat resolves cleanly', () => {
    const base = bootstrapGame();
    const atkId  = makeCardId('gf15-atk') as CardId;
    const tgtId  = makeCardId('gf15-tgt') as CardId;
    const ctrId  = makeCardId('gf15-ctr') as CardId;
    const don1   = makeDon('gf15-d1', P2);
    const don2   = makeDon('gf15-d2', P2);
    const st: GameState = {
      ...base,
      activePlayerId: P1,
      cards: {
        ...base.cards,
        [atkId]: makeChar('gf15-atk', P1, { zone: 'board', tapped: false }),
        [tgtId]: makeChar('gf15-tgt', P2, { zone: 'board', tapped: true }),
        [ctrId]: makeChar('gf15-ctr', P2, { zone: 'hand', type: 'Event', cost: 2, counter: 2000 }),
        [don1.id]: don1, [don2.id]: don2,
      },
      players: {
        ...base.players,
        [P1]: { ...base.players[P1]!, board: [...base.players[P1]!.board, atkId] },
        [P2]: { ...base.players[P2]!, board: [...base.players[P2]!.board, tgtId], hand: [ctrId], donArea: [don1.id, don2.id] },
      },
    };
    const afterAtk = applyAction(st, { type: 'DeclareAttack', playerId: P1, attackerId: atkId, targetId: tgtId });
    expect(isGameError(afterAtk)).toBe(false);
    const afterCtr = applyAction(afterAtk as GameState, { type: 'PlayCounter', playerId: P2, cardId: ctrId });
    expect(isGameError(afterCtr)).toBe(false);
    expect((afterCtr as GameState).activeCombat?.counterPower).toBe(2000);
    const afterResolve = applyAction(afterCtr as GameState, { type: 'ResolveCombat', playerId: P1 });
    expect(isGameError(afterResolve)).toBe(false);
    expect((afterResolve as GameState).activeCombat).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GF16–GF17 — Bot turn behaviour
// ═══════════════════════════════════════════════════════════════════════════════

describe('GF16: after end of P1 turn, greedyBotDecide provides an action for P2', () => {
  it('greedyBotDecide returns non-null for P2 when it is P2\'s turn', () => {
    const base = bootstrapGame();
    // Advance past P1's turn to P2's turn
    let s: GameState = base;
    // EndPhase cascades through End→Draw→Refresh→DON→Main for P2 via bot logic
    // Here we just manually set P2 as active to isolate the bot decision
    s = { ...s, activePlayerId: P2 };
    const action = greedyBotDecide(s, P2);
    expect(action).not.toBeNull();
  });
});

describe('GF17: during bot turn (P2 active), P1\'s ActionPanel returns null', () => {
  it('ActionPanel renders nothing when it is not the human player\'s turn and no pending', () => {
    const base = bootstrapGame();
    const st = { ...base, activePlayerId: P2 };
    // P1 is the human; P2 is the bot — no pending interactions for P1
    render(<ActionPanel gameState={st} uiState={IDLE_UI} onAction={vi.fn()} myPlayerId={P1} />);
    // ActionPanel returns null → no buttons in DOM
    expect(screen.queryByRole('button')).toBeNull();
  });
});
