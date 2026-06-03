/**
 * Integration test helper — connects the real game engine to ActionPanel.
 *
 * Provides:
 *  - P1, P2 player IDs
 *  - makeChar / makeDon / makePlayerSetup / bootstrapGame state builders
 *  - renderWithEngine(state, myPlayerId?) — renders ActionPanel wired to a live GameState
 */
import React, { useCallback, useEffect, useState } from 'react';
import { render } from '@testing-library/react';
import {
  applyAction, isGameError, makeEmptyState, makePlayerId, makeCardId,
} from 'game-engine';
import type { Card, GameAction, GameState, PlayerId, PlayerSetup } from 'game-engine';
import { ActionPanel } from '../ui/ActionPanel';
import { IDLE_UI } from '../ui/uiState';
import type { UIState } from '../ui/uiState';

export { makePlayerId, makeCardId };

export const P1: PlayerId = makePlayerId('p1');
export const P2: PlayerId = makePlayerId('p2');

// ── Fixture builders ──────────────────────────────────────────────────────────

export function makeChar(id: string, owner: PlayerId, opts: Partial<Card> = {}): Card {
  return {
    id: makeCardId(id), name: id, cost: 2, power: 3000,
    color: 'Red', type: 'Character',
    zone: 'hand', ownerId: owner, tapped: false, attachedTo: null,
    ...opts,
  };
}

export function makeDon(id: string, owner: PlayerId, opts: Partial<Card> = {}): Card {
  return {
    id: makeCardId(id), name: 'DON!!', cost: 0, power: 0,
    color: 'Red', type: 'DON',
    zone: 'donArea', ownerId: owner, tapped: false, attachedTo: null,
    ...opts,
  };
}

export function makePlayerSetup(idStr: string): PlayerSetup {
  const pid = makePlayerId(idStr);
  return {
    id: pid,
    leaderCard: makeChar(`${idStr}-leader`, pid, { type: 'Leader', zone: 'deck' }),
    deckCards: Array.from({ length: 50 }, (_, i) =>
      makeChar(`${idStr}-dk-${i}`, pid, { zone: 'deck' }),
    ),
    donCards: Array.from({ length: 10 }, (_, i) => makeDon(`${idStr}-don-${i}`, pid) as Card),
  };
}

/** Returns a fully-started game in Main phase, turn 3 (both mulligans done). */
export function bootstrapGame(): GameState {
  const seed = makeEmptyState(P1, P2);
  let s = applyAction(seed, {
    type: 'StartGame',
    player1: makePlayerSetup('p1'),
    player2: makePlayerSetup('p2'),
    firstPlayerId: P1,
  });
  if (isGameError(s)) throw new Error((s as { message: string }).message);
  s = applyAction(s, { type: 'Mulligan', playerId: P1, keep: true });
  if (isGameError(s)) throw new Error((s as { message: string }).message);
  s = applyAction(s, { type: 'Mulligan', playerId: P2, keep: true });
  if (isGameError(s)) throw new Error((s as { message: string }).message);
  return { ...s as GameState, phase: 'Main', activePlayerId: P1, turnNumber: 3 };
}

// ── Minimal game wrapper ──────────────────────────────────────────────────────

interface WrapperProps {
  initialState: GameState;
  myPlayerId?: PlayerId | null;
  onStateChange?: (s: GameState) => void;
}

function GameWrapper({ initialState, myPlayerId = null, onStateChange }: WrapperProps) {
  const [gameState, setGameState] = useState<GameState>(initialState);
  const [uiState, setUiState] = useState<UIState>(IDLE_UI);

  const dispatch = useCallback((action: GameAction) => {
    const preCheck = applyAction(gameState, action);
    const willSucceed = !isGameError(preCheck);
    setGameState(prev => {
      const result = applyAction(prev, action);
      if (isGameError(result)) {
        setUiState(u => ({ ...u, errorMessage: result.message }));
        return prev;
      }
      onStateChange?.(result);
      return result;
    });
    if (willSucceed) setUiState(IDLE_UI);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState, onStateChange]);

  // Sync pendingTargetInteraction → chooseTarget UI
  useEffect(() => {
    const pending = gameState.pendingTargetInteraction;
    if (pending !== null && (myPlayerId === null || pending.playerId === myPlayerId)) {
      setUiState({
        selectedCardId: null, selectionMode: 'chooseTarget',
        errorMessage: null, targetScope: pending.scope,
      });
    } else if (pending === null) {
      setUiState(prev =>
        prev.selectionMode === 'chooseTarget' && prev.pendingTargetAction === undefined
          ? IDLE_UI : prev,
      );
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState.pendingTargetInteraction]);

  // Sync pendingOnKOInteraction → resolveOnKO UI
  useEffect(() => {
    const pending = gameState.pendingOnKOInteraction;
    if (pending !== null && (myPlayerId === null || pending.playerId === myPlayerId)) {
      setUiState(prev => ({
        ...prev, selectionMode: 'resolveOnKO',
        onKOInteraction: { filter: pending.filter, sourceCardId: pending.sourceCardId },
      }));
    } else if (pending === null) {
      setUiState(prev => prev.selectionMode === 'resolveOnKO' ? IDLE_UI : prev);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState.pendingOnKOInteraction]);

  return (
    <ActionPanel
      gameState={gameState}
      uiState={uiState}
      onAction={dispatch}
      myPlayerId={myPlayerId}
    />
  );
}

/**
 * Renders ActionPanel wired to a real game engine.
 *
 * @param initialState  Starting GameState (use bootstrapGame() or craft manually)
 * @param myPlayerId    null → local/hotseat (all buttons visible)
 * @param onStateChange Optional callback after each engine state advance
 */
export function renderWithEngine(
  initialState: GameState,
  myPlayerId?: PlayerId | null,
  onStateChange?: (s: GameState) => void,
) {
  return render(
    <GameWrapper
      initialState={initialState}
      myPlayerId={myPlayerId ?? null}
      onStateChange={onStateChange}
    />,
  );
}
