# OP_TCG_SIMU — Project Context

## Architecture
Pure functional game engine + PixiJS/React client. No DOM in engine, no game logic in client.

```
applyAction(state: GameState, action: GameAction): ActionResult
```
`ActionResult = GameState | GameError` — never throw, never mutate.

## Monorepo (pnpm workspaces)
```
packages/game-engine/   Pure TS game logic, Vitest tests
apps/client/            React 18 + PixiJS 8 + Vite 5
```

## Commands
| Task | Command |
|------|---------|
| Run all tests | `pnpm test` |
| Build all | `pnpm build` |
| Dev client | `cd apps/client && pnpm dev` |
| Watch tests | `cd packages/game-engine && pnpm test:watch` |

## Card data pipeline
| Task | Command |
|------|---------|
| Fetch card data (ST/EB → /decks/, OP → /sets/) | `pnpm fetch-card-data ST-27` |
| Download card images from Bandai | `pnpm fetch-images ST27` |
| Sync sets into deckBuilder.ts imports | `pnpm sync-sets` |

> **Endpoint rule:** `ST-*` and `EB-*` sets use `/api/decks/{id}/` (starter decks).
> `OP-*` and other sets use `/api/sets/{id}/` (booster sets).
> Card ID field is `card_set_id` on newer sets, `card_id` on older ones — both are handled.

## 10-Step Roadmap
- ✅ Step 1 — Monorepo + game-engine skeleton
- ✅ Step 2 — Zone modeling + phase actions
- ✅ Step 3 — Refresh / DON!! / End phases + turn manager
- ✅ Step 4 — Combat system (attack, block, KO, damage, victory)
- ✅ Step 5 — Client: Vite + React + PixiJS plateau (rendering only)
- ✅ Step 6 — Interactive hotseat loop (click handlers, hotseat/combat handoff, full game to victory)
- ✅ Step 7 — Card effects DSL + LLM pipeline
- ✅ Step 8 — Node.js + Socket.IO multiplayer server
- ⏳ **Step 9** — Network synchronization
- 🔲 Step 10 — UI redesign (Claude Artifacts mockups → responsive 1920×1080)

Full spec: `resources/onepiece-tcg-claude-code-prompt.md`

## Key Conventions
- **Branded types**: `CardId`, `PlayerId` (use `makeCardId()`, `makePlayerId()`)
- **Errors**: `makeGameError(code, message)` — never `throw`
- **State**: all `GameState` fields are `readonly`; use spread to create new state
- **DON power**: base power + 1 000 per attached DON card
- **Combat flow**: `DeclareAttack → DeclareBlock (optional) → ResolveCombat`
- **TypeScript strict**: `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess` on
