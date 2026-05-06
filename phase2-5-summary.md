# Phase 2.5 Summary — DuringYourTurn + DSL Fix Hardening

Generated: 2026-05-06

## Objective

Implement `DuringYourTurn` as a first-class engine duration type (instead of aliasing it to `EndOfTurn`), harden `apply-fixes.mjs` to reject malformed LLM DSL output, and re-apply all DSL audit fixes.

---

## Changes Delivered

### 1. DuringYourTurn — First-class engine type

**Files modified:**
- `packages/game-engine/src/types/index.ts` — added `'DuringYourTurn'` to `EffectDuration` union
- `packages/game-engine/tests/dslValidation.test.ts` — added `'DuringYourTurn'` to `VALID_DURATIONS`
- `scripts/apply-fixes.mjs` — removed `DuringYourTurn → EndOfTurn` alias from `DURATION_MAP`; fixed `EndOfTurnOrBattle → EndOfBattle` (was wrongly mapping to `EndOfTurn`)

**Engine behavior:** `DuringYourTurn` PowerBoost stores in `powerModifier` (same field as `EndOfTurn`), cleared by `applyReturnDon` at end of turn. Semantically distinct from `EndOfTurn` for future conditional/passive effects.

**Tests added (effects.test.ts):**
- DY1: PowerBoost DuringYourTurn → stored in `powerModifier`, NOT `powerModifierOT`
- DY2: powerModifier cleared after EndPhase (End → Refresh transition)
- DY3: GiveKeyword DuringYourTurn → stored in `temporaryKeywords`

### 2. apply-fixes.mjs — Hardened validation (9 new guards)

Reject DSLs where:
- `target` is a string/non-object
- `target` is an object without a `scope` field (e.g. `{type: "Self"}`, `{kind: "Character"}`)
- `filter.cardType` is an array or non-`Character/Event/Stage` value
- `condition` is a bare string (e.g. `"Always"`)
- `condition` object has no `type` field
- `conditions` is a plural array (wrong format)
- `LeaderHasAnyType` condition is missing `subTypes` field
- `LeaderHasType` condition is missing `subType` field
- `LeaderIsName` condition is missing `name` field

### 3. DSL patches — 1455 cards updated

| Set family | Patched | Skipped |
|---|---|---|
| EB-01..04 | 148 | 77 |
| OP-01..15 | 1,137 | 371 |
| P / PRB | 20 | 3 |
| ST-01..29 | 150 | 163 |
| **Total** | **1,455** | **614** |

282 files now contain `"DuringYourTurn"` duration (previously all aliased to `"EndOfTurn"`).

---

## Alias audit results (from alias-audit.md)

| Alias | Status | Cards | Decision |
|---|---|---|---|
| `DuringOpponentTurn → EndOfOpponentTurn` | ✅ VALID | 155 | Keep alias |
| `DuringThisBattle → EndOfBattle` | ✅ VALID | 46 | Keep alias |
| `UntilStartOfNextTurn → EndOfOpponentTurn` | ✅ VALID | 10 | Keep alias |
| `DuringYourTurn → EndOfTurn` | ❌ INVALID | 378 | **Implemented as real type** |
| `EndOfTurnOrBattle → EndOfTurn` | ❌ INVALID | 0 | **Fixed → EndOfBattle** |
| `filter.kind: Type/Cost/Name` | ✅ VALID | — | Keep aliases |

---

## Verification

- `pnpm test` → **7927 tests pass** (13 test files, 0 failures)
- 282 effect files contain `"DuringYourTurn"` — all validated by dslValidation.test.ts
- apply-fixes.mjs dry-run shows DuringYourTurn cards no longer in skipped list
