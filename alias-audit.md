# Alias Audit — apply-fixes.mjs

Generated: 2026-05-05

## Engine duration model (reference)

| Field on Card | Cleared when |
|---|---|
| `powerModifier` | `EndOfTurn` → `applyReturnDon`; `EndOfBattle` → `resolveCombat` (attacker only) |
| `powerModifierOT` | `EndOfOpponentTurn` → `clearOppTurnModifiers` at start of YOUR next turn |
| `temporaryKeywords` | Every `EndOfTurn` via `clearTemporaryKeywords` |

---

## Duration aliases

### ✅ VALID — DuringOpponentTurn → EndOfOpponentTurn (155 cards)
"During opponent's turn" for a power boost = "until end of opponent's turn."
Both store in `powerModifierOT`, cleared by `clearOppTurnModifiers`.
In OPTCG, a boost "during the opponent's turn" expires when that turn ends.
**No engine change needed. Alias is correct.**

### ✅ VALID — DuringThisBattle → EndOfBattle (46 cards)
"During this battle" = "until end of battle" — identical meaning.
Both store in `powerModifier`, cleared in `resolveCombat`.
**No engine change needed. Alias is correct.**

### ✅ VALID — UntilStartOfNextTurn → EndOfOpponentTurn (10 cards)
"Until start of YOUR next turn" = "until end of opponent's turn."
Both expire at the same game-flow tick (opponent's turn ends, then yours begins).
**No engine change needed. Alias is correct.**

### ❌ INVALID — DuringYourTurn → EndOfTurn (378 cards)
These are NOT semantically equivalent:
- `EndOfTurn`: "apply effect now, remove at end of current turn" — event-driven
- `DuringYourTurn`: "active whenever it's your turn" — conditional/persistent

Key difference: `EndOfTurn` always expires at the end of THE CURRENT TURN regardless
of who activated it. `DuringYourTurn` is conceptually a condition tied to the
source player's turn.

In current engine mechanics, they ARE stored identically (`powerModifier`) and
cleared at the same moment for boosts applied during your turn. BUT:
1. They are semantically distinct types in OPTCG (378 cards use the term explicitly)
2. Future passive effects will need `DuringYourTurn` to work differently
3. The audit continuously re-detects cards as having wrong duration because the
   LLM knows `DuringYourTurn` is a distinct OPTCG concept

**Action: Implement `DuringYourTurn` as a first-class engine type.**
Clearing behavior: same as `EndOfTurn` (clears via `applyReturnDon`).
For `GiveKeyword`: same as other non-permanent durations (stored in `temporaryKeywords`).

### ❌ BORDERLINE — EndOfTurnOrBattle → EndOfTurn (0 cards)
"Until end of turn OR battle" should expire at whichever comes first.
Mapping to `EndOfTurn` is wrong — in a Counter/attack context the battle resolves
BEFORE end of turn, so the effect would overstay.
Correct mapping: `EndOfBattle` (battle always resolves first in the contexts where
this duration appears).
**Action: Fix mapping to `EndOfBattle`. No engine type needed (0 cards affected).**

---

## filter.kind aliases

### ✅ VALID — Type → ByType
### ✅ VALID — Cost → ByCost
### ✅ VALID — Name → ByName
All are clear synonymous renames. No engine changes needed.

---

## Summary of required actions

| Priority | Action | Cards affected |
|---|---|---|
| 1 | Implement `DuringYourTurn` engine type (types + handler + test + validator) | 378 |
| 2 | Fix `EndOfTurnOrBattle` mapping `EndOfTurn` → `EndOfBattle` in script | 0 (future-proof) |
