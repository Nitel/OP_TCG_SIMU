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
  main.tsx                    React entry — NO StrictMode (PixiJS 8 breaks with double WebGL)
  ui/App.tsx                  Root : GameState, dispatch, bot loop, activity log, socket
  pixi/GameCanvas.tsx         PixiJS 1920×1080 + overlays React DOM
  pixi/renderGameState.ts     Tout le dessin PixiJS — redraw complet à chaque appel
  pixi/animations.ts          GSAP : flashLife, koFade, scaleIn, hoverLift, hoverReset, turnBanner
  ui/GameUI.tsx               HUD (life/DON/phase/tour) + victoire overlay + notification carte
  ui/ActionPanel.tsx          Boutons phase/combat selon contexte
  ui/ActivityLog.tsx          Log actions (position:absolute, hover→expand)
  ui/LobbyScreen.tsx          Lobby (local/vsBot/network, deck slots)
  ui/DeckBuilder.tsx          Constructeur de deck
  ui/uiState.ts               UIState type + IDLE_UI constant
  network/socketClient.ts     Socket.IO wrapper
  data/deckBuilder.ts         buildRandomDeck / buildDeckFromSaved + imports sets
  utils/effectUtils.ts        getEffectTargetScope — pour détecter les effets qui demandent une cible
```

## Canvas et layout PixiJS
- Canvas interne : 1920×1080 px (resolution fixe)
- Affiché via CSS scale (ResizeObserver) → ratio conservé dans la fenêtre
- Couches (z-order) : `bgLayer` → `scene` → `animLayer` → `dragLayer`

### Zones du board (Y positions)
```
P2 (top):    HAND(18) → DON_ROW(153) → MID_ROW(288) → BOARD(423)
────────────────────── SEP_Y=540 ──────────────────────────────────
P1 (bottom): BOARD(565) → MID_ROW(700) → DON_ROW(835) → HAND(970)
```
Colonnes : LEFT_COL=20 (LIFE/DON_DECK), LEADER=140, STAGE=238, RIGHT_COL=1814 (DECK/TRASH)

## Module-level state dans renderGameState.ts
Variables qui persistent entre renders (ne pas réinitialiser) :
- `textureCache: Map<string, Texture>` — lazy-load par templateId
- `_onCardHover` — callback `setPreviewCard` (GameCanvas)
- `_onTrashClick` — callback `setTrashCards` (GameCanvas)
- `rerenderCallback` — déclenche re-render quand texture async chargée
- `_dragState`, `_pendingDrag` — état drag & drop
- `_prevState` — GameState précédent pour détecter animations

## Overlays React DOM dans GameCanvas
Tous `position:absolute` dans le wrapper (position:relative) du canvas :
| Composant | zIndex | Trigger |
|-----------|--------|---------|
| `ActivityLog` | 290 | toujours visible (hover → expand) |
| `CardPreviewPanel` | 300 | hover carte PixiJS (500 ms) |
| `TrashViewPanel` | 450 | clic sur TRASH stack |

## Key Patterns

### Hover preview (pas de hoverLift dans drawCard !)
`hoverLift` déplace la carte → `pointerout` avant 500 ms → preview jamais affichée.
Dans `drawCard` : uniquement timer 500 ms → `triggerCardPreview`. Lift uniquement dans `drawHandFan` (inline, pas via hoverLift()).

### Scene clear — kill tweens uniquement (pas de destroy !)
Avant `scene.removeChildren()`, kill les tweens GSAP sur les anciens enfants. Ne JAMAIS appeler `child.destroy()` ici — PixiJS 8's EventSystem garde une référence au container "actuellement survolé" ; le détruire corrompt le dispatch d'événements pour tous les nouveaux containers (clics, hover ne fonctionnent plus).

### Drag & drop
`pointerdown` → `_pendingDrag`. Si `pointermove` > 6 px → `startDrag()` + ghost.
`pointerup` → clear `_pendingDrag`. Évite le ghost-flicker sur un simple tap.

### DON!! phase auto-skip
useEffect dans App.tsx détecte `phase === 'DON'` → dispatch `EndPhase` immédiatement pour l'humain.

### React 18 : pas d'effets dans setGameState updater
L'updater de `setGameState` peut être appelé 2× en dev ou différé. Pré-valider avec `applyAction` en dehors.

### Activity log
Pré-valider l'action avant `setGameState`. Si `!isGameError(preCheck)` ET `logText !== null` → `setActivityLog(...)`.

### Card ID regex
`/[A-Z]{2,3}\d{2}-\d{3}/` — couvre ST21-017, EB01-001, OP04-023. Ne jamais utiliser `/OP\d{2}-\d{3}/`.

## Modes de jeu
| Mode | myPlayerId | needsHandoff | Bot loop |
|------|-----------|--------------|----------|
| local (hotseat) | null | true | non |
| vsBot | P1 | false | oui (P2) |
| network | assigné par serveur | false | non |

## State Flow
```
App.tsx
  dispatch(action) → pre-validate → setGameState → socket.sendAction
  → <GameCanvas gameState uiState activityLog onCardClick onDragDrop />
       → renderGameState(scene, animLayer, ...)   // PixiJS redraw
       → <ActivityLog /> <CardPreviewPanel /> <TrashViewPanel />
```
