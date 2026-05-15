/**
 * ST-21 Integration Tests
 *
 * Each scenario simulates a complete sequence of game actions using only
 * public applyAction() calls — the same interface the client UI uses.
 * No internal engine calls, no imports from src/ outside the public index.
 *
 * Mechanics under test:
 *   SCÉNARIO 1 — Sanji ST21-003 : SuppressBlockerForAttacker
 *   SCÉNARIO 2 — Dawn Whip ST21-016 : DisableBlocker
 *   SCÉNARIO 3 — Mole Pistol ST21-017 : HasCharacterWithMinPower
 *   SCÉNARIO 4 — Zoro ST21-015 OnKO : PlayFromHand + excludeName
 *   SCÉNARIO 5 — DoubleAttack + 1 Life (Q&A officiel)
 */
import { describe, it, expect } from 'vitest';
import {
  applyAction,
  isGameError,
  makeCardId,
  makePlayerId,
  makeEmptyState,
} from '../src/index.js';
import type { Card, CardId, CardEffect, GameState, GameLogEntry, PlayerId, PlayerSetup } from '../src/index.js';

// ─── Player IDs (prefixed to avoid collision with st21.test.ts) ───────────────

const P1 = makePlayerId('int-p1');
const P2 = makePlayerId('int-p2');

// ─── Minimal card factories ────────────────────────────────────────────────────

function makeChar(id: string, ownerId: PlayerId, power: number, opts: Partial<Card> = {}): Card {
  return {
    id: makeCardId(id),
    name: id,
    cost: 0,
    power,
    color: 'Red',
    type: 'Character',
    zone: 'board',
    ownerId,
    tapped: false,
    attachedTo: null,
    ...opts,
  };
}

function makeDon(id: string, ownerId: PlayerId, opts: Partial<Card> = {}): Card {
  return {
    id: makeCardId(id),
    name: 'DON!!',
    cost: 0,
    power: 0,
    color: 'Red',
    type: 'DON',
    zone: 'donArea',
    ownerId,
    tapped: false,
    attachedTo: null,
    ...opts,
  };
}

function makePlayerSetup(id: PlayerId): PlayerSetup {
  const idStr = id as string;
  return {
    id,
    leaderCard: makeChar(`${idStr}-leader`, id, 5000, { type: 'Leader', zone: 'deck' }),
    deckCards: Array.from({ length: 50 }, (_, i) =>
      makeChar(`${idStr}-dk-${i}`, id, 2000, { zone: 'deck' }),
    ),
    donCards: Array.from({ length: 10 }, (_, i) =>
      makeDon(`${idStr}-don-${i}`, id) as Card,
    ),
  };
}

// ─── State-builder helpers ─────────────────────────────────────────────────────

/** Bootstrap a clean game at P1's Main phase, turn 3 (attacks unlocked). */
function bootstrapGame(): GameState {
  const seed = makeEmptyState(P1, P2);
  let s = applyAction(seed, {
    type: 'StartGame',
    player1: makePlayerSetup(P1),
    player2: makePlayerSetup(P2),
    firstPlayerId: P1,
  });
  if (isGameError(s)) throw new Error(s.message);
  s = applyAction(s, { type: 'Mulligan', playerId: P1, keep: true });
  if (isGameError(s)) throw new Error(s.message);
  s = applyAction(s, { type: 'Mulligan', playerId: P2, keep: true });
  if (isGameError(s)) throw new Error(s.message);
  return { ...s, phase: 'Main', activePlayerId: P1, turnNumber: 3 };
}

function addToBoard(state: GameState, card: Card, ownerId: PlayerId): GameState {
  return {
    ...state,
    cards: { ...state.cards, [card.id]: { ...card, zone: 'board' } },
    players: {
      ...state.players,
      [ownerId]: {
        ...state.players[ownerId]!,
        board: [...(state.players[ownerId]?.board ?? []), card.id],
      },
    },
  };
}

function addToHand(state: GameState, card: Card, ownerId: PlayerId): GameState {
  return {
    ...state,
    cards: { ...state.cards, [card.id]: { ...card, zone: 'hand' } },
    players: {
      ...state.players,
      [ownerId]: {
        ...state.players[ownerId]!,
        hand: [...(state.players[ownerId]?.hand ?? []), card.id],
      },
    },
  };
}

/**
 * Simulate a turn boundary: clears all per-turn state and sets activePlayerId.
 * Equivalent to what the engine does at turn switch (EndPhase from End phase).
 * Untaps the new active player's board cards too.
 */
function skipToTurnOf(state: GameState, ownerId: PlayerId): GameState {
  const updatedCards: Record<string, Card> = { ...state.cards };
  // Untap all cards belonging to the new active player
  for (const card of Object.values(updatedCards)) {
    if (card !== undefined && (card as Card).ownerId === ownerId) {
      (updatedCards as Record<string, Card>)[(card as Card).id] = { ...(card as Card), tapped: false };
    }
  }
  return {
    ...state,
    cards: updatedCards as GameState['cards'],
    activePlayerId: ownerId,
    phase: 'Main',
    turnNumber: state.turnNumber + 2,
    activeCombat: null,
    blockerSuppressedForAttackerIds: [],
    blockerDisabledIds: [],
    newBoardIds: [],
    activatedAbilityIds: [],
  };
}

// ─── Shared effect definitions ─────────────────────────────────────────────────

const sanji_effect: CardEffect = {
  trigger: 'OnPlay',
  actions: [{
    type: 'SuppressBlockerForAttacker',
    target: { scope: 'ChooseOwnCharacter', subType: 'Straw Hat Crew' },
  }],
};

const disableBlocker_effect: CardEffect = {
  trigger: 'OnPlay',
  actions: [{
    type: 'DisableBlocker',
    target: { scope: 'AllOpponentCharacters', maxPower: 4000 },
    duration: 'EndOfTurn',
  }],
};

const molePistol_condKO_effect: CardEffect = {
  trigger: 'OnPlay',
  condition: { type: 'HasCharacterWithMinPower', minPower: 6000 },
  actions: [{
    type: 'KO',
    target: { scope: 'ChooseOpponentCharacter', maxPower: 2000 },
  }],
};

const zoroOnKO_effect: CardEffect = {
  trigger: 'OnKO',
  actions: [{
    type: 'PlayFromHand',
    filter: {
      color: 'Red',
      cardType: 'Character',
      maxPower: 6000,
      excludeName: 'Roronoa Zoro',
    },
  }],
};

// ──────────────────────────────────────────────────────────────────────────────
// SCÉNARIO 1 — Sanji ST21-003 : SuppressBlockerForAttacker
// ──────────────────────────────────────────────────────────────────────────────

describe('ST-21 integration — SCÉNARIO 1 : Sanji SuppressBlockerForAttacker', () => {
  /**
   * Board :
   *   P1 — Luffy (Straw Hat Crew, 7000)  ← Sanji va le cibler
   *        Zoro  (Straw Hat Crew, 5000)  ← non ciblé
   *        Sanji (3000, hand)
   *   P2 — Sentomaru (Blocker, 5000)
   *        Target (3000, tapped)
   */
  function setupScenario1() {
    const base = bootstrapGame();

    const luffy    = makeChar('s1-luffy',    P1, 7000, { name: 'Monkey D. Luffy', subTypes: 'Straw Hat Crew' });
    const zoro     = makeChar('s1-zoro',     P1, 5000, { name: 'Roronoa Zoro',    subTypes: 'Straw Hat Crew' });
    const sanji    = makeChar('s1-sanji',    P1, 3000, { name: 'Sanji', zone: 'hand', effects: [sanji_effect] });
    const sento    = makeChar('s1-sento',    P2, 5000, { name: 'Sentomaru', keywords: ['Blocker'] });
    const p2target = makeChar('s1-p2target', P2, 3000, { name: 'P2 Target', tapped: true });

    let s = addToBoard(base, luffy, P1);
    s = addToBoard(s, zoro, P1);
    s = addToBoard(s, sento, P2);
    s = addToBoard(s, p2target, P2);
    s = addToHand(s, sanji, P1);
    return { s, luffy, zoro, sanji, sento, p2target };
  }

  it('1a) Luffy ciblé par Sanji attaque → Sentomaru ne peut pas bloquer (BLOCKER_SUPPRESSED)', () => {
    const { s: base, luffy, sanji, sento, p2target } = setupScenario1();

    // P1 joue Sanji, cible Luffy (Straw Hat Crew)
    let s = applyAction(base, {
      type: 'PlayCharacterFromHand',
      playerId: P1,
      cardId: sanji.id,
      chosenTargetId: luffy.id,
    }) as GameState;
    expect(isGameError(s)).toBe(false);
    expect(s.blockerSuppressedForAttackerIds).toContain(luffy.id);

    // Luffy déclare l'attaque
    s = applyAction(s, {
      type: 'DeclareAttack',
      playerId: P1,
      attackerId: luffy.id,
      targetId: p2target.id,
    }) as GameState;
    expect(isGameError(s)).toBe(false);

    // P2 tente d'activer le Blocker de Sentomaru → refusé
    const block = applyAction(s, { type: 'DeclareBlock', playerId: P2, blockerId: sento.id });
    expect(isGameError(block)).toBe(true);
    if (isGameError(block)) expect(block.code).toBe('BLOCKER_SUPPRESSED');
  });

  it('1b) Zoro (non ciblé par Sanji) attaque le même tour → Blocker autorisé', () => {
    const { s: base, luffy, zoro, sanji, sento, p2target } = setupScenario1();

    // P1 joue Sanji, cible Luffy — Zoro n'est PAS marqué
    let s = applyAction(base, {
      type: 'PlayCharacterFromHand',
      playerId: P1,
      cardId: sanji.id,
      chosenTargetId: luffy.id,
    }) as GameState;
    expect(s.blockerSuppressedForAttackerIds).not.toContain(zoro.id);

    // Zoro déclare l'attaque
    s = applyAction(s, {
      type: 'DeclareAttack',
      playerId: P1,
      attackerId: zoro.id,
      targetId: p2target.id,
    }) as GameState;
    expect(isGameError(s)).toBe(false);

    // P2 peut bloquer avec Sentomaru
    const block = applyAction(s, { type: 'DeclareBlock', playerId: P2, blockerId: sento.id });
    expect(isGameError(block)).toBe(false);
    if (!isGameError(block)) expect(block.activeCombat?.blockerId).toBe(sento.id);
  });

  it('1c) Tour suivant → blockerSuppressedForAttackerIds vidé, Luffy peut être bloqué', () => {
    const { s: base, luffy, sanji, sento, p2target } = setupScenario1();

    // Ce tour : Sanji marque Luffy
    let s = applyAction(base, {
      type: 'PlayCharacterFromHand',
      playerId: P1,
      cardId: sanji.id,
      chosenTargetId: luffy.id,
    }) as GameState;
    expect(s.blockerSuppressedForAttackerIds).toContain(luffy.id);

    // Passage au tour suivant (vide la suppression)
    s = skipToTurnOf(s, P1);
    expect(s.blockerSuppressedForAttackerIds).toHaveLength(0);

    // Luffy est now untapped (skipToTurnOf l'a remis actif), p2target doit être tapped
    const nextCards = {
      ...s.cards,
      [p2target.id]: { ...s.cards[p2target.id]!, tapped: true },
    };
    s = { ...s, cards: nextCards as GameState['cards'] };

    // Luffy attaque à nouveau
    s = applyAction(s, {
      type: 'DeclareAttack',
      playerId: P1,
      attackerId: luffy.id,
      targetId: p2target.id,
    }) as GameState;
    expect(isGameError(s)).toBe(false);

    // P2 peut de nouveau bloquer
    const block = applyAction(s, { type: 'DeclareBlock', playerId: P2, blockerId: sento.id });
    expect(isGameError(block)).toBe(false);
    if (!isGameError(block)) expect(block.activeCombat?.blockerId).toBe(sento.id);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// SCÉNARIO 2 — DisableBlocker : Blockers ≤4000 désactivés ce tour
// ──────────────────────────────────────────────────────────────────────────────

describe('ST-21 integration — SCÉNARIO 2 : DisableBlocker (Dawn Whip / ST21-016)', () => {
  /**
   * Board :
   *   P1 — Attacker (7000)
   *        Source (hand, OnPlay → DisableBlocker on AllOpponentCharacters ≤4000)
   *   P2 — SmallBlocker (4000, Blocker)   ← dans la plage → désactivé
   *        BigBlocker   (6000, Blocker)   ← hors plage → pas désactivé
   *        Target (3000, tapped)
   *
   * Note : le vrai ST21-016 déclenche DisableBlocker via Trigger (Life zone).
   * Pour l'intégration, on teste la mécanique DisableBlocker directement via
   * un OnPlay, ce qui est sémantiquement équivalent pour vérifier la règle.
   */
  function setupScenario2() {
    const base = bootstrapGame();

    const attacker     = makeChar('s2-attacker',      P1, 7000);
    const source       = makeChar('s2-source',        P1, 2000, {
      name: 'DisableBlocker Source',
      zone: 'hand',
      effects: [disableBlocker_effect],
    });
    const smallBlocker = makeChar('s2-small-blocker', P2, 4000, { name: 'Small Blocker', keywords: ['Blocker'] });
    const bigBlocker   = makeChar('s2-big-blocker',   P2, 6000, { name: 'Big Blocker',   keywords: ['Blocker'] });
    const p2target     = makeChar('s2-p2target',      P2, 3000, { name: 'P2 Target',     tapped: true });

    let s = addToBoard(base, attacker, P1);
    s = addToBoard(s, smallBlocker, P2);
    s = addToBoard(s, bigBlocker, P2);
    s = addToBoard(s, p2target, P2);
    s = addToHand(s, source, P1);
    return { s, attacker, source, smallBlocker, bigBlocker, p2target };
  }

  it('2a) Après DisableBlocker : SmallBlocker (≤4000) refusé (BLOCKER_DISABLED)', () => {
    const { s: base, attacker, source, smallBlocker, p2target } = setupScenario2();

    // P1 joue la source → DisableBlocker s'applique aux cartes adverses ≤4000
    let s = applyAction(base, {
      type: 'PlayCharacterFromHand',
      playerId: P1,
      cardId: source.id,
    }) as GameState;
    expect(isGameError(s)).toBe(false);
    expect(s.blockerDisabledIds).toContain(smallBlocker.id);

    // P1 attaque
    s = applyAction(s, {
      type: 'DeclareAttack',
      playerId: P1,
      attackerId: attacker.id,
      targetId: p2target.id,
    }) as GameState;
    expect(isGameError(s)).toBe(false);

    // P2 tente SmallBlocker → refusé
    const block = applyAction(s, { type: 'DeclareBlock', playerId: P2, blockerId: smallBlocker.id });
    expect(isGameError(block)).toBe(true);
    if (isGameError(block)) expect(block.code).toBe('BLOCKER_DISABLED');
  });

  it('2b) BigBlocker (6000 > 4000) non désactivé → Blocker autorisé', () => {
    const { s: base, attacker, source, bigBlocker, p2target } = setupScenario2();

    // P1 joue la source → BigBlocker (6000) hors de la plage ≤4000 → pas dans blockerDisabledIds
    let s = applyAction(base, {
      type: 'PlayCharacterFromHand',
      playerId: P1,
      cardId: source.id,
    }) as GameState;
    expect(s.blockerDisabledIds).not.toContain(bigBlocker.id);

    // P1 attaque
    s = applyAction(s, {
      type: 'DeclareAttack',
      playerId: P1,
      attackerId: attacker.id,
      targetId: p2target.id,
    }) as GameState;

    // P2 peut bloquer avec BigBlocker
    const block = applyAction(s, { type: 'DeclareBlock', playerId: P2, blockerId: bigBlocker.id });
    expect(isGameError(block)).toBe(false);
    if (!isGameError(block)) expect(block.activeCombat?.blockerId).toBe(bigBlocker.id);
  });

  it('2c) Tour suivant → blockerDisabledIds vidé, SmallBlocker de nouveau activable', () => {
    const { s: base, attacker, source, smallBlocker, p2target } = setupScenario2();

    // Ce tour : DisableBlocker appliqué
    let s = applyAction(base, {
      type: 'PlayCharacterFromHand',
      playerId: P1,
      cardId: source.id,
    }) as GameState;
    expect(s.blockerDisabledIds).toContain(smallBlocker.id);

    // Passage au tour suivant
    s = skipToTurnOf(s, P1);
    expect(s.blockerDisabledIds).toHaveLength(0);

    // p2target doit rester tappé
    s = {
      ...s,
      cards: {
        ...s.cards,
        [p2target.id]: { ...s.cards[p2target.id]!, tapped: true },
      } as GameState['cards'],
    };

    // P1 attaque
    s = applyAction(s, {
      type: 'DeclareAttack',
      playerId: P1,
      attackerId: attacker.id,
      targetId: p2target.id,
    }) as GameState;
    expect(isGameError(s)).toBe(false);

    // SmallBlocker peut de nouveau bloquer
    const block = applyAction(s, { type: 'DeclareBlock', playerId: P2, blockerId: smallBlocker.id });
    expect(isGameError(block)).toBe(false);
    if (!isGameError(block)) expect(block.activeCombat?.blockerId).toBe(smallBlocker.id);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// SCÉNARIO 3 — Mole Pistol ST21-017 : HasCharacterWithMinPower
// ──────────────────────────────────────────────────────────────────────────────

describe('ST-21 integration — SCÉNARIO 3 : Mole Pistol HasCharacterWithMinPower', () => {
  /**
   * P1 a un Character à 5000 base.
   *   - Cas A : 1 DON attaché → puissance courante = 6000 ≥ 6000 → KO
   *   - Cas B : aucun DON attaché → puissance = 5000 < 6000 → pas de KO
   *
   * P2 a une cible faible (1000 ≤ 2000 maxPower du filtre KO).
   *
   * L'Event Mole Pistol a :
   *   - condition : HasCharacterWithMinPower(6000)
   *   - action    : KO(ChooseOpponentCharacter maxPower:2000)
   */
  function setupScenario3() {
    const base = bootstrapGame();

    const buffableChar = makeChar('s3-buffable', P1, 5000, { name: 'Buffable Character' });
    const weakTarget   = makeChar('s3-weak',     P2, 1000, { name: 'Weak P2 Target', tapped: true });

    // Event card avec la condition HasCharacterWithMinPower
    const molePistol = makeChar('s3-mole-pistol', P1, 0, {
      name: 'Gum-Gum Mole Pistol',
      type: 'Event',
      zone: 'hand',
      effects: [molePistol_condKO_effect],
    });

    // DON pouvant être attaché à buffableChar
    const attachedDon = makeDon('s3-don', P1, {
      tapped: true,
      attachedTo: makeCardId('s3-buffable'),
    });

    let s = addToBoard(base, buffableChar, P1);
    s = addToBoard(s, weakTarget, P2);
    return { s, buffableChar, weakTarget, molePistol, attachedDon };
  }

  it('3a) 5000 + 1 DON attaché = 6000 ≥ seuil → cible KO', () => {
    const { s: base, buffableChar, weakTarget, molePistol, attachedDon } = setupScenario3();

    // Attacher le DON à buffableChar (puissance courante = 6000)
    let s: GameState = {
      ...base,
      cards: {
        ...base.cards,
        [attachedDon.id]: attachedDon,
        [molePistol.id]:  { ...molePistol, zone: 'hand' },
      } as GameState['cards'],
      players: {
        ...base.players,
        [P1]: {
          ...base.players[P1]!,
          donArea: [...base.players[P1]!.donArea, attachedDon.id],
          hand:    [...base.players[P1]!.hand,    molePistol.id],
        },
      },
    };

    // P1 joue Mole Pistol (Event, cost 0), cible la faible cible de P2
    s = applyAction(s, {
      type: 'PlayEvent',
      playerId: P1,
      cardId: molePistol.id,
      chosenTargetId: weakTarget.id,
    }) as GameState;
    expect(isGameError(s)).toBe(false);

    // Condition remplie → KO appliqué
    expect(s.players[P2]!.board).not.toContain(weakTarget.id);
    expect(s.players[P2]!.trash).toContain(weakTarget.id);
  });

  it('3b) 5000 sans DON < seuil (6000) → KO ignoré, cible survit', () => {
    const { s: base, weakTarget, molePistol } = setupScenario3();

    // Aucun DON attaché : buffableChar reste à 5000
    let s: GameState = {
      ...base,
      cards: {
        ...base.cards,
        [molePistol.id]: { ...molePistol, zone: 'hand' },
      } as GameState['cards'],
      players: {
        ...base.players,
        [P1]: { ...base.players[P1]!, hand: [...base.players[P1]!.hand, molePistol.id] },
      },
    };

    s = applyAction(s, {
      type: 'PlayEvent',
      playerId: P1,
      cardId: molePistol.id,
    }) as GameState;
    expect(isGameError(s)).toBe(false);

    // Condition non remplie → KO pas appliqué
    expect(s.players[P2]!.board).toContain(weakTarget.id);
    expect(s.players[P2]!.trash).not.toContain(weakTarget.id);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// SCÉNARIO 4 — ST21-015 Zoro OnKO : PlayFromHand + excludeName
// ──────────────────────────────────────────────────────────────────────────────

describe('ST-21 integration — SCÉNARIO 4 : ST21-015 Zoro OnKO excludeName', () => {
  /**
   * P2 attaque et KO Zoro (ST21-015) de P1.
   * Zoro déclenche OnKO → pendingOnKOInteraction pour P1.
   * P1 tente de jouer "Roronoa Zoro" (exclu) → INVALID_CHOICE.
   * P1 joue un Red Character ≤6000 valide → success.
   *
   * Flow réaliste :
   *   1. P2 déclare l'attaque sur Zoro (tapped).
   *   2. P1 ne bloque pas.
   *   3. ResolveCombat (puissance P2 ≥ puissance Zoro) → Zoro KO.
   *   4. pendingOnKOInteraction set.
   *   5. P1 dispatch ResolveOnKOInteraction.
   */
  function setupScenario4() {
    const base = bootstrapGame();

    // Zoro de P1 (ST21-015) : sur le board, déjà tapped (attaqué)
    const zoro = makeChar('s4-zoro', P1, 5000, {
      name: 'Roronoa Zoro',
      tapped: true,
      effects: [zoroOnKO_effect],
    });

    // Autre Zoro dans la main de P1 (ne peut pas être joué via l'effet)
    const zoroInHand = makeChar('s4-zoro-hand', P1, 4000, {
      name: 'Roronoa Zoro',
      color: 'Red',
      zone: 'hand',
    });

    // Nami (Red Character ≤6000) dans la main de P1 → peut être jouée via l'effet
    const nami = makeChar('s4-nami', P1, 3000, {
      name: 'Nami',
      color: 'Red',
      zone: 'hand',
    });

    // Attaquant de P2 : assez puissant pour KO Zoro (5000)
    const p2Attacker = makeChar('s4-p2attacker', P2, 8000, { name: 'P2 Attacker' });
    const p1Leader   = base.players[P1]!.leader!;

    let s = addToBoard(base, zoro, P1);
    s = addToBoard(s, p2Attacker, P2);
    s = addToHand(s, zoroInHand, P1);
    s = addToHand(s, nami, P1);

    // C'est le tour de P2 pour que P2 attaque
    s = { ...s, activePlayerId: P2, turnNumber: 4 };
    return { s, zoro, zoroInHand, nami, p2Attacker, p1Leader };
  }

  /** Déclenche le KO de Zoro via un vrai combat. */
  function triggerZoroKO(setup: ReturnType<typeof setupScenario4>): GameState {
    const { s, zoro, p2Attacker } = setup;

    // P2 attaque le leader de P1 (ou un autre tapped) — mais Zoro est tapped, on l'attaque
    let state = applyAction(s, {
      type: 'DeclareAttack',
      playerId: P2,
      attackerId: p2Attacker.id,
      targetId: zoro.id,
    }) as GameState;
    expect(isGameError(state)).toBe(false);

    // Résoudre le combat (pas de blocker) → Zoro KO
    state = applyAction(state, { type: 'ResolveCombat', playerId: P2 }) as GameState;
    expect(isGameError(state)).toBe(false);
    expect(state.pendingOnKOInteraction).not.toBeNull();
    expect(state.pendingOnKOInteraction?.playerId).toBe(P1);
    return state;
  }

  it('4a) Tenter de jouer "Roronoa Zoro" via OnKO → INVALID_CHOICE', () => {
    const setup = setupScenario4();
    const { zoroInHand } = setup;

    const s = triggerZoroKO(setup);

    const result = applyAction(s, {
      type: 'ResolveOnKOInteraction',
      playerId: P1,
      cardId: zoroInHand.id,
    });
    expect(isGameError(result)).toBe(true);
    if (isGameError(result)) expect(result.code).toBe('INVALID_CHOICE');
  });

  it('4b) Jouer Nami (Red Character ≤6000) via OnKO → Nami en jeu, main réduite', () => {
    const setup = setupScenario4();
    const { nami } = setup;

    const s = triggerZoroKO(setup);

    const result = applyAction(s, {
      type: 'ResolveOnKOInteraction',
      playerId: P1,
      cardId: nami.id,
    });
    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) {
      expect(result.players[P1]!.board).toContain(nami.id);
      expect(result.players[P1]!.hand).not.toContain(nami.id);
      expect(result.pendingOnKOInteraction).toBeNull();
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// SCÉNARIO 5 — DoubleAttack + 1 Life (Q&A officiel ST21)
// ──────────────────────────────────────────────────────────────────────────────

describe('ST-21 integration — SCÉNARIO 5 : DoubleAttack + 1 Life', () => {
  /**
   * Q&A : "If my opponent has 1 Life card, can I win using Double Attack? No."
   * Le 2e hit DA ne s'applique que si la première touche laisse encore une life.
   * Si le 1er hit vide la pile de life → pas de 2e hit → pas de victoire.
   *
   * Règle : la victoire survient uniquement quand on inflige des dégâts à
   * une pile de life DÉJÀ VIDE.
   */
  function setupScenario5(p2LifeCount: number) {
    let base = bootstrapGame();

    const daAttacker = makeChar('s5-da', P1, 9000, {
      name: 'DoubleAttack Attacker',
      keywords: ['DoubleAttack'],
    });
    base = addToBoard(base, daAttacker, P1);

    // Ajuste le nombre de life de P2
    const p2 = base.players[P2]!;
    const keptLife = p2.life.slice(0, p2LifeCount) as readonly CardId[];
    const removedLife = p2.life.slice(p2LifeCount);
    const updatedCards = { ...base.cards };
    for (const id of removedLife) {
      const c = updatedCards[id];
      if (c !== undefined) updatedCards[id] = { ...c, zone: 'removed' as const };
    }
    base = {
      ...base,
      cards: updatedCards as GameState['cards'],
      players: { ...base.players, [P2]: { ...p2, life: keptLife } },
    };

    const p2LeaderId = base.players[P2]!.leader!;
    return { s: base, daAttacker, p2LeaderId };
  }

  it('5a) DA sur P2 avec 1 Life → 1 life retirée, winner = null (pas de victoire)', () => {
    // Q&A : le 2e hit est annulé car la pile était à 1 avant le 1er hit.
    // Après 1 hit : pile à 0. Le 2e hit ne s'exécute pas → pas de victoire.
    const { s, daAttacker, p2LeaderId } = setupScenario5(1);
    expect(s.players[P2]!.life.length).toBe(1);

    let state = applyAction(s, {
      type: 'DeclareAttack',
      playerId: P1,
      attackerId: daAttacker.id,
      targetId: p2LeaderId,
    }) as GameState;
    expect(isGameError(state)).toBe(false);

    const result = applyAction(state, { type: 'ResolveCombat', playerId: P1 });
    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) {
      expect(result.winner).toBeNull();          // pas de victoire
      expect(result.players[P2]!.life).toHaveLength(0); // life vidée
    }
  });

  it('5b) DA sur P2 avec 2 Lives → 2 lives retirées, winner = null', () => {
    const { s, daAttacker, p2LeaderId } = setupScenario5(2);

    let state = applyAction(s, {
      type: 'DeclareAttack',
      playerId: P1,
      attackerId: daAttacker.id,
      targetId: p2LeaderId,
    }) as GameState;

    const result = applyAction(state, { type: 'ResolveCombat', playerId: P1 });
    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) {
      expect(result.winner).toBeNull();
      expect(result.players[P2]!.life).toHaveLength(0);
    }
  });

  it('5c) DA sur P2 avec 0 Life → victoire immédiate sur le 1er hit (P1 gagne)', () => {
    // Pile vide avant le hit → applyLeaderDamage set winner immédiatement.
    const { s, daAttacker, p2LeaderId } = setupScenario5(0);
    expect(s.players[P2]!.life.length).toBe(0);

    let state = applyAction(s, {
      type: 'DeclareAttack',
      playerId: P1,
      attackerId: daAttacker.id,
      targetId: p2LeaderId,
    }) as GameState;

    const result = applyAction(state, { type: 'ResolveCombat', playerId: P1 });
    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) {
      expect(result.winner).toBe(P1);
    }
  });

  it('5d) Attaque normale (sans DA) + 0 Life → victoire', () => {
    // Régression : une attaque simple sur pile vide doit toujours donner la victoire.
    const base = bootstrapGame();
    const normalAttacker = makeChar('s5-normal', P1, 9000, { name: 'Normal Attacker' });
    let s = addToBoard(base, normalAttacker, P1);

    const p2 = s.players[P2]!;
    const updatedCards = { ...s.cards };
    for (const id of p2.life) {
      const c = updatedCards[id];
      if (c !== undefined) updatedCards[id] = { ...c, zone: 'removed' as const };
    }
    s = {
      ...s,
      cards: updatedCards as GameState['cards'],
      players: { ...s.players, [P2]: { ...p2, life: [] } },
    };
    const p2LeaderId = s.players[P2]!.leader!;

    let state = applyAction(s, {
      type: 'DeclareAttack',
      playerId: P1,
      attackerId: normalAttacker.id,
      targetId: p2LeaderId,
    }) as GameState;

    const result = applyAction(state, { type: 'ResolveCombat', playerId: P1 });
    expect(isGameError(result)).toBe(false);
    if (!isGameError(result)) {
      expect(result.winner).toBe(P1);
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// SCÉNARIO 6 — gameLog pipeline: Zoro OnKO full trace
// ──────────────────────────────────────────────────────────────────────────────

describe('ST-21 integration — SCÉNARIO 6 : gameLog pipeline for Zoro OnKO', () => {
  /**
   * Verifies the structured log entries produced at each step of the OnKO pipeline:
   *   KO → ON_KO_TRIGGER → EFFECT_CANDIDATES → PROMPT_CREATED → PLAYER_CHOICE → CARD_PLAYED_VIA_EFFECT
   *
   * Uses the same combat-driven scenario as Scénario 4 but asserts on gameLog shape.
   */
  const zoroOnKO_eff: CardEffect = {
    trigger: 'OnKO',
    actions: [{
      type: 'PlayFromHand',
      filter: { color: 'Red', cardType: 'Character', maxPower: 6000, excludeName: 'Roronoa Zoro' },
    }],
  };

  function setupLog() {
    const base = bootstrapGame();

    const zoro = makeChar('s6-zoro', P1, 5000, {
      name: 'Roronoa Zoro',
      tapped: true,
      effects: [zoroOnKO_eff],
    });
    const nami = makeChar('s6-nami', P1, 3000, { name: 'Nami', color: 'Red', zone: 'hand' });
    const p2Atk = makeChar('s6-atk', P2, 8000, { name: 'P2 Attacker' });

    let s = addToBoard(base, zoro, P1);
    s = addToBoard(s, p2Atk, P2);
    s = addToHand(s, nami, P1);
    s = { ...s, activePlayerId: P2, turnNumber: 4 };
    return { s, zoro, nami, p2Atk };
  }

  it('6a) KO pipeline produces KO + ON_KO_TRIGGER + EFFECT_CANDIDATES + PROMPT_CREATED entries', () => {
    const { s, zoro, p2Atk } = setupLog();

    let state = applyAction(s, {
      type: 'DeclareAttack', playerId: P2, attackerId: p2Atk.id, targetId: zoro.id,
    }) as GameState;
    expect(isGameError(state)).toBe(false);

    state = applyAction(state, { type: 'ResolveCombat', playerId: P2 }) as GameState;
    expect(isGameError(state)).toBe(false);

    const log = state.gameLog;

    // KO entry
    const koEntry = log.find((e: GameLogEntry) => e.event === 'KO');
    expect(koEntry).toBeDefined();
    expect(koEntry?.cardName).toBe('Roronoa Zoro');
    expect(koEntry?.cardId).toBe(zoro.id);

    // ON_KO_TRIGGER entry
    const triggerEntry = log.find((e: GameLogEntry) => e.event === 'ON_KO_TRIGGER');
    expect(triggerEntry).toBeDefined();
    expect(triggerEntry?.cardId).toBe(zoro.id);

    // EFFECT_CANDIDATES entry lists Nami
    const candidatesEntry = log.find((e: GameLogEntry) => e.event === 'EFFECT_CANDIDATES');
    expect(candidatesEntry).toBeDefined();
    expect(candidatesEntry?.message).toContain('Nami');

    // PROMPT_CREATED entry
    const promptEntry = log.find((e: GameLogEntry) => e.event === 'PROMPT_CREATED');
    expect(promptEntry).toBeDefined();
    expect(promptEntry?.playerId).toBe(P1);

    // seq ordering: KO < ON_KO_TRIGGER < EFFECT_CANDIDATES < PROMPT_CREATED
    expect(koEntry!.seq).toBeLessThan(triggerEntry!.seq);
    expect(triggerEntry!.seq).toBeLessThan(candidatesEntry!.seq);
    expect(candidatesEntry!.seq).toBeLessThan(promptEntry!.seq);
  });

  it('6b) After ResolveOnKOInteraction: PLAYER_CHOICE + CARD_PLAYED_VIA_EFFECT appended', () => {
    const { s, zoro, nami, p2Atk } = setupLog();

    let state = applyAction(s, {
      type: 'DeclareAttack', playerId: P2, attackerId: p2Atk.id, targetId: zoro.id,
    }) as GameState;
    state = applyAction(state, { type: 'ResolveCombat', playerId: P2 }) as GameState;

    const result = applyAction(state, {
      type: 'ResolveOnKOInteraction', playerId: P1, cardId: nami.id,
    });
    expect(isGameError(result)).toBe(false);
    if (isGameError(result)) return;

    const log = result.gameLog;

    const choiceEntry = log.find((e: GameLogEntry) => e.event === 'PLAYER_CHOICE' && e.cardId === nami.id);
    expect(choiceEntry).toBeDefined();
    expect(choiceEntry?.cardName).toBe('Nami');
    expect(choiceEntry?.message).toContain('chose to play');

    const playedEntry = log.find((e: GameLogEntry) => e.event === 'CARD_PLAYED_VIA_EFFECT');
    expect(playedEntry).toBeDefined();
    expect(playedEntry?.cardId).toBe(nami.id);
    expect(playedEntry?.message).toContain('played from hand via OnKO');

    // All entries monotonically increasing seq
    const seqs = log.map((e: GameLogEntry) => e.seq);
    for (let i = 1; i < seqs.length; i++) {
      expect(seqs[i]!).toBeGreaterThan(seqs[i - 1]!);
    }
  });

  it('6c) No valid card → EFFECT_SKIPPED entry, no PROMPT_CREATED', () => {
    const { s, zoro, p2Atk } = setupLog();

    // Replace the ENTIRE P1 hand with a single Blue card — no eligible Red Character exists
    const p1 = s.players[P1]!;
    const blueCard = makeChar('s6-blue', P1, 2000, { name: 'Buggy', color: 'Blue', zone: 'hand' });
    const updatedCards2: Record<string, Card> = { ...s.cards };
    for (const id of p1.hand) {
      // Move all existing hand cards to deck so they're gone from hand
      updatedCards2[id] = { ...updatedCards2[id]!, zone: 'deck' };
    }
    updatedCards2[blueCard.id] = { ...blueCard, zone: 'hand' };
    let s2: GameState = {
      ...s,
      cards: updatedCards2 as GameState['cards'],
      players: { ...s.players, [P1]: { ...p1, hand: [blueCard.id] } },
    };

    let state = applyAction(s2, {
      type: 'DeclareAttack', playerId: P2, attackerId: p2Atk.id, targetId: zoro.id,
    }) as GameState;
    state = applyAction(state, { type: 'ResolveCombat', playerId: P2 }) as GameState;

    const log = state.gameLog;

    expect(log.find((e: GameLogEntry) => e.event === 'EFFECT_SKIPPED')).toBeDefined();
    expect(log.find((e: GameLogEntry) => e.event === 'PROMPT_CREATED')).toBeUndefined();
    expect(state.pendingOnKOInteraction).toBeNull();
  });
});
