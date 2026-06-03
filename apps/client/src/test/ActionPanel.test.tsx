/**
 * ActionPanel tests — AP1–AP8
 * Render-based tests using @testing-library/react.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { makeEmptyState, makePlayerId, makeCardId } from 'game-engine';
import type { Card, CardId, GameState } from 'game-engine';
import { ActionPanel } from '../ui/ActionPanel';
import { IDLE_UI } from '../ui/uiState';
import type { UIState } from '../ui/uiState';

const P1 = makePlayerId('p1');
const P2 = makePlayerId('p2');

function makeChar(id: string, owner: ReturnType<typeof makePlayerId>, opts: Partial<Card> = {}): Card {
  return {
    id: makeCardId(id), name: id, cost: 2, power: 3000, color: 'Red', type: 'Character',
    zone: 'board', ownerId: owner, tapped: false, attachedTo: null, ...opts,
  };
}

function makeState(overrides: Partial<GameState> = {}): GameState {
  const base = makeEmptyState(P1, P2);
  return {
    ...base,
    phase: 'Main',
    activePlayerId: P1,
    playerOrder: [P1, P2],
    turnNumber: 3,
    winner: null,
    ...overrides,
  };
}

// ─── AP1 : Main Phase, pas de pending ────────────────────────────────────────

describe('AP1: Main phase — no pending', () => {
  it('renders "Fin de tour" button', () => {
    const s = makeState();
    render(<ActionPanel gameState={s} uiState={IDLE_UI} onAction={vi.fn()} myPlayerId={P1} />);
    expect(screen.getByRole('button', { name: /Fin de tour/ })).toBeInTheDocument();
  });

  it('"Résoudre le combat" is absent (no active combat)', () => {
    const s = makeState();
    render(<ActionPanel gameState={s} uiState={IDLE_UI} onAction={vi.fn()} myPlayerId={P1} />);
    expect(screen.queryByText(/Résoudre le combat/)).not.toBeInTheDocument();
  });

  it('clicking "Fin de tour" dispatches EndPhase', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const s = makeState();
    render(<ActionPanel gameState={s} uiState={IDLE_UI} onAction={onAction} myPlayerId={P1} />);
    await user.click(screen.getByRole('button', { name: /Fin de tour/ }));
    expect(onAction).toHaveBeenCalledWith({ type: 'EndPhase', playerId: P1 });
  });
});

// ─── AP2 : Combat actif, pas de pending ──────────────────────────────────────

describe('AP2: Active combat — not paused, player is attacker', () => {
  const attackerId = makeCardId('ap2-atk') as CardId;
  const targetId   = makeCardId('ap2-tgt') as CardId;

  function makeCombatState(): GameState {
    const atk = makeChar('ap2-atk', P1, { zone: 'board', tapped: true });
    const tgt = makeChar('ap2-tgt', P2, { zone: 'board', tapped: true });
    const base = makeState();
    return {
      ...base,
      activeCombat: { attackerId, targetId, blockerId: null, counterPower: 0 },
      cards: { ...base.cards, [attackerId]: atk, [targetId]: tgt },
    };
  }

  it('"Résoudre le combat" button is visible for the attacker', () => {
    render(<ActionPanel gameState={makeCombatState()} uiState={IDLE_UI} onAction={vi.fn()} myPlayerId={P1} />);
    expect(screen.getByRole('button', { name: /Résoudre le combat/ })).toBeInTheDocument();
  });

  it('"Résoudre le combat" dispatches ResolveCombat', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(<ActionPanel gameState={makeCombatState()} uiState={IDLE_UI} onAction={onAction} myPlayerId={P1} />);
    await user.click(screen.getByRole('button', { name: /Résoudre le combat/ }));
    expect(onAction).toHaveBeenCalledWith({ type: 'ResolveCombat', playerId: P1 });
  });
});

// ─── AP3 : pendingTargetInteraction actif ────────────────────────────────────

describe('AP3: pendingTargetInteraction — target prompt visible', () => {
  const srcId = makeCardId('ap3-src') as CardId;
  const attackerId = makeCardId('ap3-atk') as CardId;
  const targetId   = makeCardId('ap3-tgt') as CardId;

  function makePendingTargetState(): GameState {
    const base = makeState({
      activeCombat: { attackerId, targetId, blockerId: null, counterPower: 0 },
    });
    return {
      ...base,
      cards: {
        ...base.cards,
        [attackerId]: makeChar('ap3-atk', P1, { zone: 'board', tapped: true }),
        [targetId]:   makeChar('ap3-tgt', P2, { zone: 'board', tapped: true }),
        [srcId]:      makeChar('ap3-src', P1, { zone: 'board' }),
      },
      pendingTargetInteraction: {
        playerId: P1,
        scope: 'ChooseOpponentCharacter',
        sourceCardId: srcId,
        sourcePlayerId: P1,
        pendingAction: { type: 'KO', target: { scope: 'ChooseOpponentCharacter' } } as never,
        pendingEffectActions: [],
        pendingEffects: [],
        trigger: 'OnPlay',
      },
    };
  }

  const chooseTargetUI: UIState = { ...IDLE_UI, selectionMode: 'chooseTarget', targetScope: 'ChooseOpponentCharacter' };

  it('shows "Choisissez une cible" banner message', () => {
    render(<ActionPanel gameState={makePendingTargetState()} uiState={chooseTargetUI} onAction={vi.fn()} myPlayerId={P1} />);
    expect(screen.getByText(/Choisissez une cible/)).toBeInTheDocument();
  });

  it('shows "Passer" skip button', () => {
    render(<ActionPanel gameState={makePendingTargetState()} uiState={chooseTargetUI} onAction={vi.fn()} myPlayerId={P1} />);
    expect(screen.getByRole('button', { name: 'Passer' })).toBeInTheDocument();
  });

  it('"Résoudre le combat" is hidden while combat is paused', () => {
    render(<ActionPanel gameState={makePendingTargetState()} uiState={chooseTargetUI} onAction={vi.fn()} myPlayerId={P1} />);
    expect(screen.queryByText(/Résoudre le combat/)).not.toBeInTheDocument();
  });

  it('clicking "Passer" dispatches ResolveTargetInteraction with null', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(<ActionPanel gameState={makePendingTargetState()} uiState={chooseTargetUI} onAction={onAction} myPlayerId={P1} />);
    await user.click(screen.getByRole('button', { name: 'Passer' }));
    expect(onAction).toHaveBeenCalledWith({ type: 'ResolveTargetInteraction', playerId: P1, targetCardId: null });
  });
});

// ─── AP4 : pendingOnKOInteraction actif ──────────────────────────────────────

describe('AP4: pendingOnKOInteraction — OnKO message visible', () => {
  it('shows KO pending message in banner', () => {
    const srcId = makeCardId('ap4-src') as CardId;
    const s = makeState({
      pendingOnKOInteraction: { playerId: P1, filter: {}, sourceCardId: srcId },
    });
    render(<ActionPanel gameState={s} uiState={IDLE_UI} onAction={vi.fn()} myPlayerId={P1} />);
    expect(screen.getByText(/choisissez une carte à jouer/)).toBeInTheDocument();
  });
});

// ─── AP5 : pendingRevealInteraction actif ────────────────────────────────────

describe('AP5: pendingRevealInteraction — reveal message visible', () => {
  it('shows reveal message in banner', () => {
    const srcId = makeCardId('ap5-src') as CardId;
    const s = makeState({
      pendingRevealInteraction: {
        playerId: P1, count: 2, sourceCardId: srcId, sourcePlayerId: P1,
        thenActions: [], pendingEffectActions: [], pendingEffects: [], trigger: 'OnPlay',
      },
    });
    render(<ActionPanel gameState={s} uiState={IDLE_UI} onAction={vi.fn()} myPlayerId={P1} />);
    expect(screen.getByText(/Révélez/)).toBeInTheDocument();
  });
});

// ─── AP6 : pendingForceDiscardInteraction actif ───────────────────────────────

describe('AP6: pendingForceDiscardInteraction — discard message visible', () => {
  it('shows force-discard message with count', () => {
    const s = makeState({
      pendingForceDiscardInteraction: {
        playerId: P2, count: 2, pendingEffectActions: [], pendingEffects: [], trigger: 'OnPlay',
      },
    });
    render(<ActionPanel gameState={s} uiState={IDLE_UI} onAction={vi.fn()} myPlayerId={P1} />);
    const msg = screen.getByText(/défausser/);
    expect(msg).toBeInTheDocument();
    expect(msg.textContent).toContain('2');
  });
});

// ─── AP7 : pendingChoiceInteraction actif ─────────────────────────────────────

describe('AP7: pendingChoiceInteraction — choice buttons visible', () => {
  const srcId = makeCardId('ap7-src') as CardId;

  function makeChoiceState(): GameState {
    return makeState({
      pendingChoiceInteraction: {
        playerId: P1,
        choices: [
          { label: 'Option Alpha', actions: [] },
          { label: 'Option Beta',  actions: [] },
        ],
        sourceCardId: srcId,
        sourcePlayerId: P1,
        pendingEffectActions: [],
        pendingEffects: [],
        trigger: 'OnPlay',
      },
    });
  }

  it('renders both choice buttons', () => {
    render(<ActionPanel gameState={makeChoiceState()} uiState={IDLE_UI} onAction={vi.fn()} myPlayerId={P1} />);
    expect(screen.getByRole('button', { name: 'Option Alpha' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Option Beta'  })).toBeInTheDocument();
  });

  it('clicking first choice dispatches ResolveChoiceInteraction choiceIndex:0', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(<ActionPanel gameState={makeChoiceState()} uiState={IDLE_UI} onAction={onAction} myPlayerId={P1} />);
    await user.click(screen.getByRole('button', { name: 'Option Alpha' }));
    expect(onAction).toHaveBeenCalledWith({ type: 'ResolveChoiceInteraction', playerId: P1, choiceIndex: 0 });
  });
});

// ─── AP8 : pendingLifeInteraction actif ───────────────────────────────────────

describe('AP8: pendingLifeInteraction — life panel visible', () => {
  const srcId = makeCardId('ap8-src') as CardId;
  const lifeId = makeCardId('life1') as CardId;

  it('LookOnly mode shows life cards and Confirmer button', () => {
    const lifeCard = makeChar('life1', P1, { zone: 'life' as const });
    const s = makeState({
      cards: { ...makeEmptyState(P1, P2).cards, [lifeId]: lifeCard },
      pendingLifeInteraction: {
        playerId: P1,
        sourceCardId: srcId,
        mode: 'LookOnly',
        lifeCards: [lifeId],
        lifeOwnerId: P1,
        pendingEffectActions: [],
        pendingEffects: [],
        trigger: 'OnDamage',
      },
    });
    render(<ActionPanel gameState={s} uiState={IDLE_UI} onAction={vi.fn()} myPlayerId={P1} />);
    expect(screen.getByText(/Vos cartes Vie/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmer' })).toBeInTheDocument();
  });

  it('clicking Confirmer dispatches ResolveLifeInteraction', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const lifeCard = makeChar('life1b', P1, { zone: 'life' as const });
    const lifeId2 = makeCardId('life1b') as CardId;
    const s = makeState({
      cards: { ...makeEmptyState(P1, P2).cards, [lifeId2]: lifeCard },
      pendingLifeInteraction: {
        playerId: P1,
        sourceCardId: srcId,
        mode: 'LookOnly',
        lifeCards: [lifeId2],
        lifeOwnerId: P1,
        pendingEffectActions: [],
        pendingEffects: [],
        trigger: 'OnDamage',
      },
    });
    render(<ActionPanel gameState={s} uiState={IDLE_UI} onAction={onAction} myPlayerId={P1} />);
    await user.click(screen.getByRole('button', { name: 'Confirmer' }));
    expect(onAction).toHaveBeenCalledWith({ type: 'ResolveLifeInteraction', playerId: P1 });
  });
});
