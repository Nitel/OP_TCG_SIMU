/**
 * DSL Smoke Execution — loads every effect file and calls resolveEffects for each trigger.
 *
 * Catches: runtime crashes in effectResolver when handling real DSL card data.
 * Does NOT verify semantic correctness — use effects.test.ts for that.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  applyAction,
  isGameError,
  makeCardId,
  makePlayerId,
  makeEmptyState,
  resolveEffects,
} from '../src/index.js';
import type { Card, CardId, GameState, PlayerSetup, CardEffect, PlayerId } from '../src/index.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EFFECTS_DIR = path.join(__dirname, '../../data/effects');

const P1 = makePlayerId('p1');
const P2 = makePlayerId('p2');

// ─── Helpers (minimal copies of patterns from keywords.test.ts) ───────────────

function makeChar(id: string, owner: string, power: number, opts: Partial<Card> = {}): Card {
  return {
    id: makeCardId(id),
    name: id,
    cost: 0,
    power,
    color: 'Red',
    type: 'Character',
    zone: 'board',
    ownerId: makePlayerId(owner),
    tapped: false,
    attachedTo: null,
    ...opts,
  };
}

function makeDon(id: string, owner: string, opts: Partial<Card> = {}): Card {
  return {
    id: makeCardId(id),
    name: 'DON!!',
    cost: 0,
    power: 0,
    color: 'Red',
    type: 'DON',
    zone: 'donArea',
    ownerId: makePlayerId(owner),
    tapped: false,
    attachedTo: null,
    ...opts,
  };
}

function makePlayerSetup(idStr: string): PlayerSetup {
  return {
    id: makePlayerId(idStr),
    leaderCard: makeChar(`${idStr}-leader`, idStr, 5000, { type: 'Leader', zone: 'deck' }),
    deckCards: Array.from({ length: 50 }, (_, i) =>
      makeChar(`${idStr}-deck-${i}`, idStr, 2000, { zone: 'deck' }),
    ),
    donCards: Array.from({ length: 10 }, (_, i) => makeDon(`${idStr}-don-${i}`, idStr) as Card),
  };
}

function bootstrapGame(): GameState {
  const seed = makeEmptyState(P1, P2);
  let s = applyAction(seed, {
    type: 'StartGame',
    player1: makePlayerSetup('p1'),
    player2: makePlayerSetup('p2'),
    firstPlayerId: P1,
  });
  if (isGameError(s)) throw new Error(s.message);
  s = applyAction(s, { type: 'Mulligan', playerId: P1, keep: true });
  if (isGameError(s)) throw new Error(s.message);
  s = applyAction(s, { type: 'Mulligan', playerId: P2, keep: true });
  if (isGameError(s)) throw new Error(s.message);
  return { ...s, phase: 'Main', turnNumber: 3 };
}

function addToBoard(state: GameState, card: Card, playerId: PlayerId): GameState {
  return {
    ...state,
    cards: { ...state.cards, [card.id]: { ...card, zone: 'board' } },
    players: {
      ...state.players,
      [playerId]: {
        ...state.players[playerId]!,
        board: [...state.players[playerId]!.board, card.id],
      },
    },
  };
}

/** Add DON!! cards to a player's donArea (with their own tapped/attachedTo set). */
function addDonCards(state: GameState, dons: Card[], playerId: PlayerId): GameState {
  const updatedCards: Record<string, Card> = { ...state.cards };
  for (const d of dons) updatedCards[d.id] = { ...d, zone: 'donArea' };
  return {
    ...state,
    cards: updatedCards as GameState['cards'],
    players: {
      ...state.players,
      [playerId]: {
        ...state.players[playerId]!,
        donArea: [...state.players[playerId]!.donArea, ...dons.map((d) => d.id)],
      },
    },
  };
}

// ─── Smoke state builder ──────────────────────────────────────────────────────

/**
 * Build a minimal game state for smoke-testing a card's effects.
 *
 * - Source card (with its DSL effects) is on P1's board
 * - A tapped P2 character is on P2's board (valid attack target)
 */
function buildSmokeState(
  sourceCardId: CardId,
  effects: CardEffect[],
): GameState {
  let s = bootstrapGame();

  // Source card on P1's board with its real effects
  const sourceCard = makeChar(String(sourceCardId), 'p1', 3000, {
    id: sourceCardId,
    effects,
  });
  s = addToBoard(s, sourceCard, P1);

  // Tapped P2 character (valid target for KO / ReturnToHand / Rest effects)
  const p2Target = makeChar('smoke-p2-target', 'p2', 2000, { tapped: true });
  s = addToBoard(s, p2Target, P2);

  return s;
}

/**
 * Satisfy the conditions for effects with the given trigger so the effects
 * will actually fire (not be skipped by the condition guard).
 */
function satisfyConditions(
  s: GameState,
  sourceCardId: CardId,
  effects: CardEffect[],
  trigger: CardEffect['trigger'],
): GameState {
  const triggerEffects = effects.filter((e) => e.trigger === trigger);
  let next = s;

  for (const effect of triggerEffects) {
    const cond = effect.condition;
    if (cond == null || cond.type === 'Always' || cond.type === 'TurnCount') continue;

    if (cond.type === 'HasRestingDon') {
      // Add N active (untapped, unattached) DON!! to P1's donArea
      const dons = Array.from({ length: cond.count }, (_, i) =>
        makeDon(`smoke-free-don-${i}`, 'p1', { tapped: false, attachedTo: null }),
      );
      next = addDonCards(next, dons, P1);
    }

    if (cond.type === 'HasAttachedDon') {
      // Add N DON!! attached to the source card
      const dons = Array.from({ length: cond.count }, (_, i) =>
        makeDon(`smoke-attached-don-${i}`, 'p1', { tapped: true, attachedTo: sourceCardId }),
      );
      next = addDonCards(next, dons, P1);
    }

    if (cond.type === 'LeaderHasAttachedDon') {
      // Add N DON!! attached to P1's leader
      const leaderId = next.players[P1]!.leader!;
      const dons = Array.from({ length: cond.count }, (_, i) =>
        makeDon(`smoke-leader-don-${i}`, 'p1', { tapped: true, attachedTo: leaderId }),
      );
      next = addDonCards(next, dons, P1);
    }
  }

  return next;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('DSL Smoke Execution', () => {
  const files = fs.readdirSync(EFFECTS_DIR).filter((f) => f.endsWith('.json')).sort();

  for (const file of files) {
    it(file.replace('.json', ''), () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const def = JSON.parse(fs.readFileSync(path.join(EFFECTS_DIR, file), 'utf-8')) as any;
      const effects: CardEffect[] = def.effects ?? [];
      if (effects.length === 0) return;

      const sourceCardId = makeCardId(`smoke-${def.id ?? file}`);
      const triggers = [...new Set(effects.map((e: CardEffect) => e.trigger))];

      for (const trigger of triggers) {
        const base = buildSmokeState(sourceCardId, effects);
        const s = satisfyConditions(base, sourceCardId, effects, trigger);
        const ctx = { sourceCardId, sourcePlayerId: P1 };

        // Primary assertion: no crash
        const result = resolveEffects(effects, trigger, ctx, s);
        expect(result).toBeDefined();
      }
    });
  }
});
