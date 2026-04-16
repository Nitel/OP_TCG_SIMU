import { useState } from 'react';
import {
  applyAction,
  makeEmptyState,
  makePlayerId,
  makeCardId,
  isGameError,
} from 'game-engine';
import type { Card, GameState, PlayerSetup } from 'game-engine';
import { GameCanvas } from '../pixi/GameCanvas';

// ─── Bootstrap helpers ────────────────────────────────────────────────────────

function stubCard(id: string, ownerId: string, type: Card['type'], cost = 0): Card {
  return {
    id: makeCardId(id),
    name: id,
    cost,
    power: 2000,
    color: 'Red',
    type,
    zone: 'deck',
    ownerId: makePlayerId(ownerId),
    tapped: false,
    attachedTo: null,
  };
}

function buildSetup(idStr: string): PlayerSetup {
  return {
    id: makePlayerId(idStr),
    leaderCard: stubCard(`${idStr}-leader`, idStr, 'Leader'),
    deckCards: Array.from({ length: 20 }, (_, i) =>
      stubCard(`${idStr}-d${i}`, idStr, 'Character', (i % 5) + 1)
    ),
    donCards: Array.from({ length: 10 }, (_, i) =>
      stubCard(`${idStr}-don${i}`, idStr, 'DON')
    ),
  };
}

function createInitialState(): GameState {
  const p1 = makePlayerId('p1');
  const p2 = makePlayerId('p2');
  const seed = makeEmptyState(p1, p2);

  const result = applyAction(seed, {
    type: 'StartGame',
    player1: buildSetup('p1'),
    player2: buildSetup('p2'),
    firstPlayerId: p1,
  });

  if (isGameError(result)) {
    throw new Error(`StartGame failed: ${result.message}`);
  }
  return result;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function App() {
  const [gameState] = useState<GameState>(createInitialState);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: 16 }}>
      <h1 style={{ color: '#cccccc', fontSize: 16, letterSpacing: 2 }}>
        ONE PIECE TCG — SIMULATOR
      </h1>
      <GameCanvas gameState={gameState} />
    </div>
  );
}
