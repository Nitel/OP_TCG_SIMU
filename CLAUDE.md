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

## Roadmap
- ✅ Step 1 — Monorepo + game-engine skeleton
- ✅ Step 2 — Zone modeling + phase actions
- ✅ Step 3 — Refresh / DON!! / End phases + turn manager
- ✅ Step 4 — Combat system (attack, block, KO, damage, victory)
- ✅ Step 5 — Client: Vite + React + PixiJS plateau (rendering only)
- ✅ Step 6 — Interactive hotseat loop (click handlers, hotseat/combat handoff, full game to victory)
- ✅ Step 7 — Card effects DSL + LLM pipeline
- ✅ Step 8 — Node.js + Socket.IO multiplayer server
- ✅ Step 9 — Network synchronization (optimistic updates, reconnect, room browser)
- ✅ Step 10 — UI redesign (Hearthstone-style 1920×1080, hand fan, drag & drop, drop zone highlights)
- ⏳ **Step A** — Toutes les cartes TCG + stockage CDN (Cloudflare R2)
- 🔲 Step B — Deck builder UI (WIP — DeckBuilder.tsx existe)
- 🔲 Step C — Mode vs IA (greedy → minimax)
- 🔲 Step D — Animations GSAP manquantes (attaque, KO, draw)
- 🔲 Step E — Sound design (Howler.js)
- 🔲 Step F — Tests E2E (Playwright)
- 🔲 Step G — Replay system
- 🔲 Step H — Spectator mode
- 🔲 Step I — WebRTC P2P
- 🔲 Step J — PWA / Mobile

Full spec: `resources/onepiece-tcg-claude-code-prompt.md`

## Key Conventions
- **Branded types**: `CardId`, `PlayerId` (use `makeCardId()`, `makePlayerId()`)
- **Errors**: `makeGameError(code, message)` — never `throw`
- **State**: all `GameState` fields are `readonly`; use spread to create new state
- **DON power**: base power + 1 000 per attached DON card
- **Combat flow**: `DeclareAttack → DeclareBlock (optional) → ResolveCombat`
- **TypeScript strict**: `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess` on
- **Card ID regex**: `/[A-Z]{2,3}\d{2}-\d{3}/` (couvre ST, EB, OP) — ne pas utiliser `/OP\d{2}-\d{3}/`
- **React 18 strict**: ne jamais mettre d'effets de bord dans un `setGameState` updater (deferré, pas fiable) — pré-valider avec `applyAction` avant l'appel

## Client — Architecture UI détaillée

### Fichiers critiques
```
apps/client/src/
  ui/App.tsx              — Root : useState<GameState>, dispatch, bot loop, activity log
  pixi/GameCanvas.tsx     — Canvas PixiJS 1920×1080 + overlays React DOM
  pixi/renderGameState.ts — Tout le dessin PixiJS (zones, cartes, animations)
  pixi/animations.ts      — GSAP : flashLife, koFade, scaleIn, hoverLift, hoverReset, turnBanner
  ui/GameUI.tsx           — HUD React DOM (life, DON, phase) + overlay victoire + notification carte jouée
  ui/ActionPanel.tsx      — Boutons d'action (EndPhase, DrawPhase, DeclareBlock, ResolveCombat…)
  ui/ActivityLog.tsx      — Log des actions (position: absolute, hover pour expand)
  ui/LobbyScreen.tsx      — Lobby : choix mode (local/vsBot/network), room ID, deck
  ui/DeckBuilder.tsx      — Constructeur de deck (WIP)
```

### Flux de données
```
App.tsx
  ├── useState<GameState>       ← applyAction (engine pur)
  ├── dispatch(action)          → pre-validate → setGameState → socket.sendAction
  ├── activityLog[]             → ActivityEntry{ id, text }
  └── <GameCanvas
        gameState uiState
        onCardClick onDragDrop
        activityLog />           → PixiJS canvas + overlays React
         ├── renderGameState()   → PixiJS scene (redraw complet à chaque call)
         ├── <ActivityLog />     position:absolute right, zIndex:290
         ├── <CardPreviewPanel/> position:absolute right, zIndex:300
         └── <TrashViewPanel/>  position:absolute inset:0, zIndex:450 (clic TRASH)
```

### PixiJS renderGameState.ts — Couches (z-order)
```
app.stage
  bgLayer (z=0)     — fond océan + overlay sombre
  scene             — toutes les zones + cartes (redraw complet à chaque render)
  animLayer         — effets GSAP temporaires (flashLife, koFade, hoverGlow)
  dragLayer         — ghost de drag & drop
```

### Module-level state dans renderGameState.ts (important !)
Ces variables persistent entre renders et ne doivent PAS être réinitialisées à chaque `renderGameState()` :
- `_dragState`, `_pendingDrag` — état drag & drop
- `_dropZones`, `_activePlayerId` — reconstruits à chaque render
- `_onCardHover` — callback React → `setPreviewCard` dans GameCanvas
- `_onTrashClick` — callback React → `setTrashCards` dans GameCanvas
- `rerenderCallback` — déclenche un re-render quand une texture async se charge
- `textureCache` — `Map<templateId, Texture>` (lazy-load, persistant)
- `_prevState` — pour détecter animations (KO, life flash)

### DON!! phase
La phase DON!! est auto-skippée pour les humains (useEffect dans App.tsx). Les joueurs peuvent assigner des DON!! directement en phase Main par drag & drop ou click (sélection → target).

### Hover preview flow
1. PixiJS `pointerover` → `triggerCardPreview(card)` après 500 ms
2. → `_onCardHover?.(card)` → `setPreviewCard(card)` dans GameCanvas
3. → `<CardPreviewPanel>` React DOM (zIndex 300, position absolute right)
4. `pointerout` → `clearCardPreview()` → `setPreviewCard(null)`
- **Pas de hoverLift dans drawCard** (causerait pointerout avant les 500 ms)
- Le lift est uniquement dans drawHandFan (main fan) — inline, pas via hoverLift()

### Drag & drop (pending drag threshold)
`pointerdown` → `_pendingDrag` (pas de ghost). Si `pointermove` > 6 px → `startDrag()` → ghost.
`pointerup` → clear `_pendingDrag` (tap sans drag).

### Défausse viewer
Clic sur TRASH stack → `_onTrashClick?.(cards)` → `setTrashCards(cards)` → `<TrashViewPanel>` (zIndex 450).
Hover dans le panel → preview inline (pas le CardPreviewPanel global).

### Images cartes
- CDN : `VITE_CDN_BASE_URL/card-images/{templateId}.png`
- Fallback local : `/card-images/{templateId}.png`  
- Recto (face cachée) : `/card-images/recto.png`
- DON!! : `/card-images/DON.png`
- templateId extrait via regex `/[A-Z]{2,3}\d{2}-\d{3}/`
