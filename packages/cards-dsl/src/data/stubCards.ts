import type { CardDefinition } from '../schema/effectSchema.js';

/**
 * 10 stub cards covering all keywords and effect triggers.
 * Used for testing the effectResolver in game-engine.
 */
export const STUB_CARDS: readonly CardDefinition[] = [
  // ─── 1. Draw on play ───────────────────────────────────────────────────────
  {
    id: 'stub-001',
    name: 'Navigator (OnPlay Draw)',
    cost: 3,
    power: 2000,
    color: 'Blue',
    cardType: 'Character',
    keywords: [],
    effects: [
      {
        trigger: 'OnPlay',
        actions: [{ type: 'Draw', count: 1 }],
      },
    ],
    counter: 1000,
  },

  // ─── 2. DoubleAttack keyword ───────────────────────────────────────────────
  {
    id: 'stub-002',
    name: 'Dual Blade Swordsman (DoubleAttack)',
    cost: 5,
    power: 5000,
    color: 'Red',
    cardType: 'Character',
    keywords: ['DoubleAttack'],
    effects: [],
  },

  // ─── 3. Discard opponent card on play ─────────────────────────────────────
  {
    id: 'stub-003',
    name: 'Sniper (OnPlay TrashCard)',
    cost: 3,
    power: 2000,
    color: 'Green',
    cardType: 'Character',
    keywords: [],
    effects: [
      {
        trigger: 'OnPlay',
        actions: [{ type: 'TrashCard', count: 1, from: 'OpponentHand' }],
      },
    ],
    counter: 1000,
  },

  // ─── 4. Unblockable keyword ───────────────────────────────────────────────
  {
    id: 'stub-004',
    name: 'Shadow Dancer (Unblockable)',
    cost: 3,
    power: 2000,
    color: 'Purple',
    cardType: 'Character',
    keywords: ['Unblockable'],
    effects: [],
    counter: 1000,
  },

  // ─── 5. Self power boost on attack ────────────────────────────────────────
  {
    id: 'stub-005',
    name: 'Berserker (OnAttack PowerBoost)',
    cost: 4,
    power: 4000,
    color: 'Red',
    cardType: 'Character',
    keywords: [],
    effects: [
      {
        trigger: 'OnAttack',
        actions: [
          { type: 'PowerBoost', amount: 2000, target: { scope: 'Self' }, duration: 'EndOfBattle' },
        ],
      },
    ],
  },

  // ─── 6. Life trigger — draw 1 card ────────────────────────────────────────
  {
    id: 'stub-006',
    name: 'Brave Soul (Trigger Draw)',
    cost: 2,
    power: 2000,
    color: 'Yellow',
    cardType: 'Character',
    keywords: [],
    effects: [
      {
        trigger: 'Trigger',
        actions: [{ type: 'Draw', count: 1 }],
      },
    ],
    counter: 2000,
  },

  // ─── 7. Draw on KO ────────────────────────────────────────────────────────
  {
    id: 'stub-007',
    name: 'Martyr (OnKO Draw)',
    cost: 2,
    power: 2000,
    color: 'Black',
    cardType: 'Character',
    keywords: [],
    effects: [
      {
        trigger: 'OnKO',
        actions: [{ type: 'Draw', count: 1 }],
      },
    ],
    counter: 1000,
  },

  // ─── 8. Blocker keyword ───────────────────────────────────────────────────
  {
    id: 'stub-008',
    name: 'Iron Shield (Blocker)',
    cost: 2,
    power: 3000,
    color: 'Blue',
    cardType: 'Character',
    keywords: ['Blocker'],
    effects: [],
    counter: 1000,
  },

  // ─── 9. Return opponent character to hand on play ─────────────────────────
  {
    id: 'stub-009',
    name: 'Tactician (OnPlay ReturnToHand)',
    cost: 4,
    power: 3000,
    color: 'Green',
    cardType: 'Character',
    keywords: [],
    effects: [
      {
        trigger: 'OnPlay',
        actions: [
          {
            type: 'ReturnToHand',
            target: { scope: 'ChooseOpponentCharacter', maxCost: 3 },
          },
        ],
      },
    ],
  },

  // ─── 10. Add 1 life on play ───────────────────────────────────────────────
  {
    id: 'stub-010',
    name: 'Healer (OnPlay AddLife)',
    cost: 3,
    power: 1000,
    color: 'Yellow',
    cardType: 'Character',
    keywords: [],
    effects: [
      {
        trigger: 'OnPlay',
        actions: [{ type: 'AddLife', count: 1 }],
      },
    ],
    counter: 2000,
  },
];
