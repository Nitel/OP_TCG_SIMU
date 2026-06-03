/**
 * uiRegression.test.tsx — UR1–UR5
 *
 * Non-regression tests that guard against previously fixed bugs re-appearing.
 * Each test encodes a specific invariant discovered through a bug/fix cycle.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { applyAction, isGameError, makeCardId, makePlayerId } from 'game-engine';
import type { CardId, GameState } from 'game-engine';
import { ActionPanel, computeIsCombatPaused } from '../ui/ActionPanel';
import { IDLE_UI } from '../ui/uiState';
import type { UIState } from '../ui/uiState';
import { bootstrapGame, makeChar, makeDon, P1, P2 } from './gameTestUtils';

// ─── UR1 : Event Counter coût 2 avec 1 DON → PlayCounter rejeté ───────────────

describe('UR1: Event counter cost-2 with only 1 active DON — PlayCounter rejected', () => {
  it('engine returns INSUFFICIENT_DON when counter cost exceeds active DON', () => {
    const base  = bootstrapGame();
    const atkId = makeCardId('ur1-atk') as CardId;
    const tgtId = makeCardId('ur1-tgt') as CardId;
    const ctrId = makeCardId('ur1-ctr') as CardId;
    const don1  = makeDon('ur1-d1', P2);

    const st: GameState = {
      ...base,
      activePlayerId: P1,
      cards: {
        ...base.cards,
        [atkId]: makeChar('ur1-atk', P1, { zone: 'board', tapped: false }),
        [tgtId]: makeChar('ur1-tgt', P2, { zone: 'board', tapped: true }),
        [ctrId]: makeChar('ur1-ctr', P2, { zone: 'hand', type: 'Event', cost: 2, counter: 2000 }),
        [don1.id]: don1,
      },
      players: {
        ...base.players,
        [P1]: { ...base.players[P1]!, board: [...base.players[P1]!.board, atkId] },
        [P2]: { ...base.players[P2]!, board: [...base.players[P2]!.board, tgtId], hand: [ctrId], donArea: [don1.id] },
      },
    };

    const afterAtk = applyAction(st, { type: 'DeclareAttack', playerId: P1, attackerId: atkId, targetId: tgtId });
    expect(isGameError(afterAtk)).toBe(false);

    const result = applyAction(afterAtk as GameState, { type: 'PlayCounter', playerId: P2, cardId: ctrId });
    expect(isGameError(result)).toBe(true);
    if (isGameError(result)) expect(result.code).toBe('INSUFFICIENT_DON');
  });
});

// ─── UR2 : Counter Character → toujours accepté sans vérification DON ─────────

describe('UR2: Character counter — PlayCounter always accepted regardless of DON', () => {
  it('Character counter with 0 active DON is accepted by the engine', () => {
    const base  = bootstrapGame();
    const atkId = makeCardId('ur2-atk') as CardId;
    const tgtId = makeCardId('ur2-tgt') as CardId;
    const ctrId = makeCardId('ur2-ctr') as CardId;

    const st: GameState = {
      ...base,
      activePlayerId: P1,
      cards: {
        ...base.cards,
        [atkId]: makeChar('ur2-atk', P1, { zone: 'board', tapped: false }),
        [tgtId]: makeChar('ur2-tgt', P2, { zone: 'board', tapped: true }),
        // Character counter: type 'Character', has counter value, zero cost to play as counter
        [ctrId]: makeChar('ur2-ctr', P2, { zone: 'hand', type: 'Character', cost: 3, counter: 1000 }),
      },
      players: {
        ...base.players,
        [P1]: { ...base.players[P1]!, board: [...base.players[P1]!.board, atkId] },
        [P2]: { ...base.players[P2]!, board: [...base.players[P2]!.board, tgtId], hand: [ctrId], donArea: [] },
      },
    };

    const afterAtk = applyAction(st, { type: 'DeclareAttack', playerId: P1, attackerId: atkId, targetId: tgtId });
    expect(isGameError(afterAtk)).toBe(false);

    const result = applyAction(afterAtk as GameState, { type: 'PlayCounter', playerId: P2, cardId: ctrId });
    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) {
      expect((result as GameState).activeCombat?.counterPower).toBe(1000);
    }
  });
});

// ─── UR3 : pendingTargetInteraction → "Résoudre le combat" masqué ─────────────

describe('UR3: pendingTargetInteraction pauses combat — "Résoudre le combat" hidden', () => {
  it('"Résoudre le combat" is not rendered while pendingTargetInteraction is active', () => {
    const atkId = makeCardId('ur3-atk') as CardId;
    const tgtId = makeCardId('ur3-tgt') as CardId;
    const srcId = makeCardId('ur3-src') as CardId;
    const base  = bootstrapGame();
    const st: GameState = {
      ...base,
      activeCombat: { attackerId: atkId, targetId: tgtId, blockerId: null, counterPower: 0 },
      cards: {
        ...base.cards,
        [atkId]: makeChar('ur3-atk', P1, { zone: 'board', tapped: true }),
        [tgtId]: makeChar('ur3-tgt', P2, { zone: 'board', tapped: true }),
        [srcId]: makeChar('ur3-src', P1, { zone: 'board' }),
      },
      pendingTargetInteraction: {
        playerId: P1, scope: 'ChooseOpponentCharacter',
        sourceCardId: srcId, sourcePlayerId: P1,
        pendingAction: { type: 'KO', target: { scope: 'ChooseOpponentCharacter' } } as never,
        pendingEffectActions: [], pendingEffects: [], trigger: 'OnPlay',
      },
    };

    // Sanity: combat IS paused
    expect(computeIsCombatPaused(st)).toBe(true);

    const chooseUI: UIState = { ...IDLE_UI, selectionMode: 'chooseTarget', targetScope: 'ChooseOpponentCharacter' };
    render(<ActionPanel gameState={st} uiState={chooseUI} onAction={vi.fn()} myPlayerId={P1} />);

    expect(screen.queryByRole('button', { name: /Résoudre le combat/i })).not.toBeInTheDocument();
  });
});

// ─── UR4 : pendingOnKOInteraction pendant le tour bot → prompt visible humain ──

describe('UR4: pendingOnKOInteraction during bot turn — prompt shown for human', () => {
  it('human (P1) sees OnKO prompt even though it is P2\'s active turn', () => {
    const srcId = makeCardId('ur4-src') as CardId;
    const base  = bootstrapGame();
    const st: GameState = {
      ...base,
      activePlayerId: P2,  // bot's turn
      pendingOnKOInteraction: {
        playerId: P1,
        filter: {},
        sourceCardId: srcId,
      },
    };

    // P1 is the human; uiState reflects resolveOnKO for P1
    const ui: UIState = {
      ...IDLE_UI,
      selectionMode: 'resolveOnKO',
      onKOInteraction: { filter: {}, sourceCardId: srcId },
    };

    render(<ActionPanel gameState={st} uiState={ui} onAction={vi.fn()} myPlayerId={P1} />);

    // ActionPanel must show the OnKO prompt and Passer button for P1
    expect(screen.getByText(/Effet \[On K\.O\.\]/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Passer/i })).toBeInTheDocument();
  });
});

// ─── UR5 : Bot ne joue pas pendant le tour bot — ActionPanel null pour humain ─

describe('UR5: during bot\'s turn, human ActionPanel renders nothing (no pending)', () => {
  it('ActionPanel returns null for P1 when P2 is active and no pending interaction', () => {
    const base = bootstrapGame();
    const st: GameState = { ...base, activePlayerId: P2 };

    // myPlayerId=P1, no pending interaction → ActionPanel must render nothing
    render(<ActionPanel gameState={st} uiState={IDLE_UI} onAction={vi.fn()} myPlayerId={P1} />);

    expect(screen.queryByRole('button')).toBeNull();
  });

  it('ActionPanel DOES appear for P1 when pendingTargetInteraction targets P1 during P2 turn', () => {
    const srcId = makeCardId('ur5-src') as CardId;
    const base  = bootstrapGame();
    const st: GameState = {
      ...base,
      activePlayerId: P2,
      pendingTargetInteraction: {
        playerId: P1, scope: 'ChooseOpponentCharacter',
        sourceCardId: srcId, sourcePlayerId: P1,
        pendingAction: { type: 'KO', target: { scope: 'ChooseOpponentCharacter' } } as never,
        pendingEffectActions: [], pendingEffects: [], trigger: 'OnPlay',
      },
    };

    const ui: UIState = { ...IDLE_UI, selectionMode: 'chooseTarget', targetScope: 'ChooseOpponentCharacter' };
    render(<ActionPanel gameState={st} uiState={ui} onAction={vi.fn()} myPlayerId={P1} />);

    // P1 must see "Choisissez une cible" and "Passer" even on P2's turn
    expect(screen.getByText(/Choisissez une cible/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Passer/i })).toBeInTheDocument();
  });
});
