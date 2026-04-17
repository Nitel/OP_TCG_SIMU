# game-engine package

Pure TypeScript game logic. No DOM, no PixiJS, no React.

## Commands
```bash
pnpm test          # run all tests once (vitest)
pnpm test:watch    # watch mode
pnpm build         # tsc → dist/
```

## Source Layout
```
src/
  index.ts                  Re-exports everything
  types/index.ts            All types, interfaces, branded types, factory fns
  core/applyAction.ts       Pure action dispatcher (applyAction)
  rules/combat.ts           calculatePower, sendToTrash, applyLeaderDamage, resolveCombat
  rules/victory.ts          checkVictoryCondition
tests/
  drawCard.test.ts
  startGame.test.ts
  gameActions.test.ts
  combat.test.ts
```

## Type System
```ts
// Branded types — always use factory functions
type CardId   = string & { readonly __brand: 'CardId' }
type PlayerId = string & { readonly __brand: 'PlayerId' }

// Discriminated union for actions
type GameAction = DrawCardAction | StartGameAction | DrawPhaseAction
                | PlayCharacterFromHandAction | AssignDonAction | EndPhaseAction
                | DeclareAttackAction | DeclareBlockAction | ResolveCombatAction

// Result type — never throw
type ActionResult = GameState | GameError
```

## Error Pattern
```ts
// Return, never throw
return makeGameError('WRONG_PHASE', 'Must be in Main phase');
// Check at call site
if (isGameError(result)) { /* handle */ }
```

## Key Game Rules
- **Power**: `card.power + (attached DON count) * 1000`
- **Combat**: attacker tapped on `DeclareAttack`; blocker tapped on `DeclareBlock`
- **KO**: card moved to trash, all attached DON detached (attachedTo → null, tapped → false)
- **Leader damage**: top Life card → defender's hand; empty Life + attack → winner set
- **Blocker keyword**: card needs `keywords: ['Blocker']` to intercept
- **Phase sequence**: `Refresh → Draw → DON!! → Main → End`

## Exported API (from index.ts)
Types: `CardId, PlayerId, Zone, CardColor, CardType, GamePhase, Card, CombatState, PlayerState, PlayerSetup, GameState, GameAction, GameError, ActionResult` + all action types

Functions: `applyAction, calculatePower, sendToTrash, applyLeaderDamage, resolveCombat, checkVictoryCondition, makeCardId, makePlayerId, makeGameError, makeEmptyState, isGameError`
