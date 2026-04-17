# apps/client

React 18 + PixiJS 8 + Vite 5 frontend. Rendering only — no game logic here.

## Commands
```bash
pnpm dev      # Vite dev server (localhost:5173)
pnpm build    # tsc --noEmit (type check) + vite build → dist/
pnpm preview  # preview production build
```

## Source Layout
```
src/
  main.tsx                  React entry — NO StrictMode (prevents double WebGL context)
  ui/App.tsx                GameState root: useState + renders GameCanvas
  pixi/GameCanvas.tsx       PixiJS mount/unmount via useEffect + canvas 1200×720
  pixi/renderGameState.ts   All PixiJS drawing logic (zones, cards, HUD)
```

## Key PixiJS Conventions
- **No StrictMode** in main.tsx — PixiJS 8 breaks with double-mount
- **Vite config** patches PixiJS shader paths to avoid 404s
- **renderGameState**: clears the container and redraws everything from scratch on each call — stateless rendering, no incremental updates
- Canvas size: 1200 × 720

## State Flow
```
App.tsx
  useState<GameState>          ← initialized via applyAction(emptyState, StartGame)
  → <GameCanvas gameState={…}> ← re-renders on state change
       → renderGameState(container, gameState)
```

## Step 6 Target (next)
Add click handlers in `renderGameState.ts` to dispatch actions, lift state updates back to `App.tsx`, add GSAP animations. Full hotseat play to victory condition.

## Layout (renderGameState.ts)
- **Top half**: P2 zones (hand, DON row, leader area, board)
- **Bottom half**: P1 zones (board, leader area, DON row, hand)
- **Center**: HUD (turn number, phase, active player)
- Helpers: `addRect(container, x, y, w, h, color)`, `addText(container, text, x, y, style)`
