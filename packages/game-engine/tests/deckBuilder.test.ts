/**
 * Tests for the rawToCard defensive guard against undefined eff.effects.
 *
 * Root cause: 473 effect JSON files use a legacy "Variant-B" format that has
 * numeric-keyed effect entries ({"0": {...}, "id": "..."}) without a top-level
 * "effects" field.  deckBuilder.ts typed EffectDef.effects as required, so
 * eff.effects.length threw TypeError at runtime for any such card.
 *
 * Fix: changed `eff.effects.length` to `(eff.effects?.length ?? 0)` and marked
 * EffectDef.effects as optional in the interface.
 *
 * These tests exercise the defensive pattern in isolation so they can run in
 * the game-engine vitest environment without needing Vite / import.meta.glob.
 *
 * DK1 : EffectDef with missing `effects` field → no crash, field treated as empty
 * DK2 : card constructed from such a def gets no effects but retains keywords
 */
import { describe, it, expect } from 'vitest';
import { makeCardId, makePlayerId } from '../src/index.js';
import type { Card, CardEffect, CardKeyword } from '../src/index.js';

// ─── Replicate the EffectDef shape and rawToCard logic ────────────────────────

interface EffectDef {
  readonly id: string;
  readonly keywords?: readonly CardKeyword[];
  readonly effects?: readonly CardEffect[]; // optional — absent in legacy Variant-B files
}

interface RawCard {
  readonly id: string;
  readonly name: string;
  readonly cardType: string;
  readonly cost: number;
  readonly power: number;
  readonly color: string;
  readonly counter: number | null;
  readonly subTypes?: string;
}

/** Mirrors the defensive rawToCard logic from deckBuilder.ts. */
function rawToCard(
  raw: RawCard,
  instanceId: string,
  playerId: ReturnType<typeof makePlayerId>,
  eff: EffectDef | undefined,
  zone: Card['zone'],
): Card {
  const base: Card = {
    id: makeCardId(instanceId),
    name: raw.name,
    cost: raw.cost,
    power: raw.power,
    color: raw.color as Card['color'],
    type: 'Character',
    zone,
    ownerId: playerId,
    tapped: false,
    attachedTo: null,
  };
  return {
    ...base,
    ...(raw.counter !== null ? { counter: raw.counter } : {}),
    ...(raw.subTypes !== undefined ? { subTypes: raw.subTypes } : {}),
    ...(eff !== undefined && (eff.keywords?.length ?? 0) > 0 ? { keywords: eff.keywords } : {}),
    // Defensive fix: was `eff.effects.length`, crashes when effects is absent
    ...(eff !== undefined && (eff.effects?.length ?? 0) > 0 ? { effects: eff.effects } : {}),
  };
}

// ─── Test data ────────────────────────────────────────────────────────────────

const P1 = makePlayerId('p1');

const legacyRaw: RawCard = {
  id: 'OP03-094',
  name: 'Kalifa',
  cardType: 'character',
  cost: 3,
  power: 3000,
  color: 'Blue',
  counter: 1000,
};

/** EffectDef without `effects` — mirrors legacy Variant-B JSON files. */
const legacyEffDef: EffectDef = {
  id: 'OP03-094',
  keywords: ['Rush'],
  // No `effects` field — exactly like the 473 Variant-B files
};

/** EffectDef with a normal `effects` array. */
const normalEffDef: EffectDef = {
  id: 'OP03-094',
  keywords: undefined,
  effects: [
    { trigger: 'OnPlay', actions: [{ type: 'DrawCard', count: 1 }] },
  ],
};

// ─── DK1: no crash when effects is absent ─────────────────────────────────────

describe('DK1 — rawToCard does not crash when eff.effects is absent', () => {

  it('DK1a: (eff.effects?.length ?? 0) returns 0 when effects is undefined', () => {
    const eff: EffectDef = { id: 'X', keywords: undefined };
    // This is the exact guard that was missing (was eff.effects.length, crashed)
    expect(() => (eff.effects?.length ?? 0)).not.toThrow();
    expect(eff.effects?.length ?? 0).toBe(0);
  });

  it('DK1b: rawToCard does not crash for a legacy Variant-B EffectDef (no effects field)', () => {
    expect(() =>
      rawToCard(legacyRaw, 'p1-OP03-094-0', P1, legacyEffDef, 'deck'),
    ).not.toThrow();
  });

  it('DK1c: card built from legacy def has no effects property', () => {
    const card = rawToCard(legacyRaw, 'p1-OP03-094-0', P1, legacyEffDef, 'deck');
    expect(card.effects).toBeUndefined();
  });

  it('DK1d: card built from legacy def DOES carry keywords (keywords field is correctly handled)', () => {
    const card = rawToCard(legacyRaw, 'p1-OP03-094-0', P1, legacyEffDef, 'deck');
    expect(card.keywords).toEqual(['Rush']);
  });

  it('DK1e: rawToCard does not crash when eff is undefined entirely', () => {
    expect(() =>
      rawToCard(legacyRaw, 'p1-OP03-094-0', P1, undefined, 'deck'),
    ).not.toThrow();
  });
});

// ─── DK2: deck construction with edge-case EffectDefs ─────────────────────────

describe('DK2 — card construction is correct across all EffectDef variants', () => {

  it('DK2a: normal EffectDef with effects array → card.effects is populated', () => {
    const card = rawToCard(legacyRaw, 'p1-OP03-094-0', P1, normalEffDef, 'deck');
    expect(card.effects).toHaveLength(1);
    expect(card.effects![0]!.trigger).toBe('OnPlay');
  });

  it('DK2b: EffectDef with empty effects array → card.effects is absent (no empty array spread)', () => {
    const emptyEff: EffectDef = { id: 'X', effects: [] };
    const card = rawToCard(legacyRaw, 'p1-X-0', P1, emptyEff, 'deck');
    expect(card.effects).toBeUndefined();
  });

  it('DK2c: base card fields are always correct regardless of eff shape', () => {
    const card = rawToCard(legacyRaw, 'p1-OP03-094-0', P1, legacyEffDef, 'deck');
    expect(card.name).toBe('Kalifa');
    expect(card.cost).toBe(3);
    expect(card.power).toBe(3000);
    expect(card.color).toBe('Blue');
    expect(card.counter).toBe(1000);
    expect(card.zone).toBe('deck');
    expect(card.ownerId).toBe(P1);
  });

  it('DK2d: 10 cards built from legacy EffectDef all succeed without error', () => {
    const cards = Array.from({ length: 10 }, (_, i) =>
      rawToCard(legacyRaw, `p1-OP03-094-${i}`, P1, legacyEffDef, 'deck'),
    );
    expect(cards).toHaveLength(10);
    for (const card of cards) {
      expect(card.effects).toBeUndefined();
      expect(card.keywords).toEqual(['Rush']);
    }
  });
});
