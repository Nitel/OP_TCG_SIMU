# Effect DSL Audit Report

Generated: 2026-05-05T13:30:54.667Z
Sets: all

## Summary

| Status | Count |
|--------|-------|
| ✅ ok | 0 |
| ⚠️ minor | 0 |
| 🔶 major | 0 |
| 🔴 critical | 1 |
| ❌ error | 0 |
| **Total audited** | **1** |
| **Correct rate** | **0.0%** |

## Cards with issues (1)

### 🔴 OP11-077 — Randolph (OP-11)

**Verdict:** critical

**Issues:**
- 🔴 `effects` — Effect array is empty. Card has complex trigger condition with duration modifiers that must be encoded. Missing: OnPlay trigger, DON return condition, character targeting, cost boost, and dual-duration logic spanning your turn and opponent's next turn.
- 🔶 `duration` — [Your Turn] in effect text requires duration DuringYourTurn; opponent's next turn continuation requires separate EndOfTurn handler or Permanent with explicit end condition.

**Suggested DSL:**

```json
{
  "effectText": "[Your Turn] [Once Per Turn] When a DON!! card on your field is returned to your DON!! deck, up to 1 of your {Big Mom Pirates} type Characters gains +2 cost until the end of your opponent's next turn.",
  "effects": [
    {
      "trigger": "OnPlay",
      "duration": "DuringYourTurn",
      "conditions": [
        {
          "type": "HasCardOnBoard",
          "value": "DON!!"
        }
      ],
      "actions": [
        {
          "type": "PowerBoost",
          "target": "YourCharactersOfType",
          "targetValue": "Big Mom Pirates",
          "value": 2,
          "quantity": 1,
          "durationOverride": "UntilEndOfOpponentNextTurn"
        }
      ]
    }
  ]
}
```

---

