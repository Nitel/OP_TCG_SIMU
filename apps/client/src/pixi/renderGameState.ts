import { Container, Graphics, Text, Sprite, Texture, Assets } from 'pixi.js';
import type { Card, CardId, GameState, PlayerId, PlayerState } from 'game-engine';
// combatViewDefenderId: when set, show that player's hand and hide the attacker's hand
import type { UIState } from '../ui/uiState';
import { flashLife, koFade, scaleIn, hoverLift, hoverReset, killContainerTweens } from './animations';

// CDN base URL — set VITE_CDN_BASE_URL in .env to serve card images from Cloudflare R2.
// Empty string means images are served from the local /card-images/ public folder.
const CDN_BASE: string = (import.meta.env.VITE_CDN_BASE_URL as string | undefined) ?? '';
function cardImageUrl(filename: string): string { return `${CDN_BASE}/card-images/${filename}`; }

// ─── Layout ───────────────────────────────────────────────────────────────────

const CANVAS_W = 1920;
const CANVAS_H = 1080;
const CARD_W   = 86;
const CARD_H   = 120;
const GAP      = 10;
const ROW_GAP  = 5;
const SEP_Y    = CANVAS_H / 2; // 540

// Hand fan dimensions (larger than board cards)
const HAND_W = 100;
const HAND_H = 140;
// DON!! area — max 10 cards with tighter gap; CHARACTER — max 5 cards
const DON_GAP     = 4;
const DON_ZONE_W  = 10 * (CARD_W + DON_GAP) - DON_GAP + 24; // ≈ 920 px
const CHAR_ZONE_W =  5 * (CARD_W + GAP)     - GAP     + 24; // ≈ 494 px

// Two sidebars (left: LIFE+DON!! DECK, right: DECK+TRASH) with a wide center zone
const LEFT_COL  = 20;                       // sidebar gauche
const RIGHT_COL = CANVAS_W - 20 - CARD_W;  // sidebar droite = 1814

const COL_LIFE     = LEFT_COL;                       // 20
const COL_LEADER   = 140;                            // après sidebar gauche
const COL_STAGE    = COL_LEADER + CARD_W + 12;      // 238
const COL_DECK     = RIGHT_COL;                     // 1814 — aligné au-dessus de TRASH
const COL_DON_DECK = LEFT_COL;                      // 20 — sidebar gauche
const COL_DON_AREA = COL_LEADER;                    // 140 — COST AREA après DON!! DECK
const COL_TRASH    = RIGHT_COL;                     // 1814 — aligné sous DECK
const COL_BOARD    = COL_LEADER;                    // 140 — CHARACTER AREA après LIFE

const P2_HAND_Y    = 18;
const P2_DON_ROW_Y = P2_HAND_Y    + CARD_H + ROW_GAP;
const P2_MID_ROW_Y = P2_DON_ROW_Y + CARD_H + ROW_GAP;
const P2_BOARD_Y   = P2_MID_ROW_Y + CARD_H + ROW_GAP;

const P1_BOARD_Y   = SEP_Y + 25;
const P1_MID_ROW_Y = P1_BOARD_Y   + CARD_H + ROW_GAP;
const P1_DON_ROW_Y = P1_MID_ROW_Y + CARD_H + ROW_GAP;
const P1_HAND_Y    = P1_DON_ROW_Y + CARD_H + ROW_GAP;

// ─── Palette ──────────────────────────────────────────────────────────────────

const C = {
  bg:      '#060810',
  sep:     '#b8860b',
  leader:  '#ffc825',
  life:    '#ff4444',
  donDeck: '#6a20aa',
  donArea: '#4a1060',
  board:   '#122a0e',
  hand:    '#0d1e30',
  back:    '#0a1020',
  empty:   '#0f1f10',
  label:   '#b8860b',
  white:   '#f0f0e8',
  yellow:  '#ffd700',
  purple:  '#cc88ff',
  red:     '#ff5577',
  muted:   '#1a1a2a',
  stage:   '#0a1a0a',
  cyan:    '#44ddff',
  hudText: '#d4a020',
};

const H = {
  bg:          0x060810,
  sep:         0xb8860b,
  leader:      0xffc825,
  life:        0xff4444,
  donDeck:     0x6a20aa,
  donArea:     0x4a1060,
  board:       0x122a0e,
  hand:        0x0d1e30,
  back:        0x0a1020,
  empty:       0x0f1f10,
  stage:       0x0a1a0a,
  selected:    0xffe066,
  validTarget: 0x66ffaa,
};

// ─── Background layer (ocean artwork) ────────────────────────────────────────

// Cached textures set by setupBgLayer — null = file not present, no warning logged
let bgShipTexture: Texture | null = null;

// Card back (recto) texture — loaded once on first face-down render
let rectoTexture: Texture | null = null;
let rectoLoading = false;

// ─── Drag & drop state ────────────────────────────────────────────────────────

type DragState = { cardId: CardId; ghost: Container; dragType: 'hand' | 'don' };
let _dragState:        DragState | null = null;
let _pendingDrag:      { cardId: CardId; startX: number; startY: number; tex: Texture | null; dragType: 'hand' | 'don' } | null = null;
let _dragLayer:        Container | null = null;
let _highlightContainer: Container | null = null;
let _onDragDrop:       ((dragged: CardId, target: CardId | null) => void) | null = null;
let _dropZones:        Array<{ x: number; y: number; w: number; h: number; cardId: CardId; ownerId: PlayerId }> = [];
let _activePlayerId:   PlayerId | null = null;

/**
 * Called once after PixiJS init. Loads background PNG/JPG assets into the
 * persistent bgLayer (z=0, under the game scene). Silently skips missing files
 * without triggering PixiJS cache-miss warnings.
 */
export async function setupBgLayer(bgLayer: Container): Promise<void> {
  if (bgLayer.children.length > 0) return; // already initialized

  // Always add solid fallback bg first — ensures the guard works on next call
  // and provides the Ocean Battle base colour when no image is available.
  const solidBg = new Graphics();
  solidBg.rect(0, 0, CANVAS_W, CANVAS_H);
  solidBg.fill({ color: H.bg });
  bgLayer.addChild(solidBg);

  // Load all assets in parallel; failures are expected when files are absent
  const [bgResult, shipResult, wavesResult, rectoResult] = await Promise.allSettled([
    Assets.load<Texture>('/backgrounds/bg-ocean.jpg'),
    Assets.load<Texture>('/backgrounds/ship-silhouette.jpg'),
    Assets.load<Texture>('/backgrounds/waves-divider.jpg'),
    Assets.load<Texture>(cardImageUrl('recto.png')),
  ]);

  // Use results directly — never call Assets.get() to avoid cache-miss warnings
  if (bgResult.status === 'fulfilled') {
    const bg = new Sprite(bgResult.value);
    bg.width = CANVAS_W; bg.height = CANVAS_H;
    bgLayer.addChild(bg); // on top of solid fallback

    // Dark overlay — lowered opacity so ocean image is visible
    const overlay = new Graphics();
    overlay.rect(0, 0, CANVAS_W, CANVAS_H);
    overlay.fill({ color: 0x000000, alpha: 0.28 });
    bgLayer.addChild(overlay);
  }

  if (wavesResult.status === 'fulfilled') {
    const waves = new Sprite(wavesResult.value);
    waves.width = CANVAS_W; waves.height = 100;
    waves.y = SEP_Y - 50;
    waves.alpha = 0.6;
    bgLayer.addChild(waves);
  }

  // Store textures for use during card rendering
  bgShipTexture = shipResult.status === 'fulfilled' ? shipResult.value : null;
  rectoTexture  = rectoResult.status === 'fulfilled' ? rectoResult.value : null;
  rectoLoading  = true; // mark as attempted regardless of outcome
}

// ─── Card texture cache ───────────────────────────────────────────────────────

const textureCache = new Map<string, Texture>();
let rerenderCallback: (() => void) | null = null;

export function setRerenderCallback(cb: () => void): void {
  rerenderCallback = cb;
}

// ─── Card preview hover callback (renders in React DOM, not PixiJS) ───────────

let hoverTimer: ReturnType<typeof setTimeout> | null = null;
let hoveredCardId: string | null = null;
let _onCardHover: ((card: Card | null) => void) | null = null;
let _animLayerRef: Container | null = null;

export function setCardHoverCallback(cb: (card: Card | null) => void): void {
  _onCardHover = cb;
}

let _onTrashClick: ((cards: Card[]) => void) | null = null;

export function setTrashClickCallback(cb: (cards: Card[]) => void): void {
  _onTrashClick = cb;
}

export function setupDragLayer(
  layer: Container,
  stage: Container,
  onDragDrop: (dragged: CardId, target: CardId | null) => void,
): void {
  _dragLayer  = layer;
  _onDragDrop = onDragDrop;
  const DRAG_THRESHOLD = 6;
  stage.on('pointermove', (e) => {
    const ge = e as unknown as { global: { x: number; y: number } };
    // Promote pending drag to active once pointer has moved enough (avoids ghost flicker on tap)
    if (_pendingDrag !== null && _dragState === null) {
      const dx = ge.global.x - _pendingDrag.startX;
      const dy = ge.global.y - _pendingDrag.startY;
      if (dx * dx + dy * dy > DRAG_THRESHOLD * DRAG_THRESHOLD) {
        startDrag(_pendingDrag.cardId, ge.global.x, ge.global.y, _pendingDrag.tex, _pendingDrag.dragType);
        _pendingDrag = null;
      }
    }
    if (_dragState === null) return;
    _dragState.ghost.x = ge.global.x - HAND_W / 2;
    _dragState.ghost.y = ge.global.y - HAND_H / 2;
  });
  stage.on('pointerup', (e) => {
    _pendingDrag = null; // cancel any pending drag that never started (tap, not drag)
    if (_dragState === null) return;
    const ge = e as unknown as { global: { x: number; y: number } };
    const target = findDropTarget(ge.global.x, ge.global.y);
    _onDragDrop?.(_dragState.cardId, target);
    _dragLayer?.removeChild(_dragState.ghost);
    _dragState.ghost.destroy();
    _dragState = null;
    hideDropHighlights();
  });
}

function findDropTarget(px: number, py: number): CardId | null {
  for (const z of _dropZones) {
    if (px >= z.x && px <= z.x + z.w && py >= z.y && py <= z.y + z.h) return z.cardId;
  }
  return null;
}

function registerDropZone(x: number, y: number, cardId: CardId, ownerId: PlayerId, w = CARD_W, h = CARD_H): void {
  _dropZones.push({ x, y, w, h, cardId, ownerId });
}

function showDropHighlights(dragType: 'hand' | 'don'): void {
  if (_dragLayer === null) return;
  hideDropHighlights();
  const hl = new Container();
  _dragLayer.addChildAt(hl, 0); // under the ghost
  _highlightContainer = hl;

  const color = dragType === 'don' ? 0xffd700 : 0x44ddff;
  for (const zone of _dropZones) {
    const isValid = dragType === 'don' ? zone.ownerId === _activePlayerId : true;
    if (!isValid) continue;
    const g = new Graphics();
    g.rect(zone.x, zone.y, zone.w, zone.h);
    g.fill({ color, alpha: 0.15 });
    g.rect(zone.x - 2, zone.y - 2, zone.w + 4, zone.h + 4);
    g.stroke({ color, width: 2.5, alpha: 0.85 });
    hl.addChild(g);
  }
}

function hideDropHighlights(): void {
  if (_highlightContainer !== null) {
    _highlightContainer.destroy({ children: true });
    _highlightContainer = null;
  }
}

function startDrag(cardId: CardId, gx: number, gy: number, tex: Texture | null, dragType: 'hand' | 'don'): void {
  if (_dragLayer === null) return;
  const ghost = new Container();
  const bg    = new Graphics();
  bg.rect(0, 0, HAND_W, HAND_H);
  bg.fill({ color: 0x334466, alpha: 0.75 });
  ghost.addChild(bg);
  if (tex !== null) {
    const sprite = new Sprite(tex);
    sprite.width  = HAND_W;
    sprite.height = HAND_H;
    ghost.addChild(sprite);
  }
  ghost.x     = gx - HAND_W / 2;
  ghost.y     = gy - HAND_H / 2;
  ghost.alpha = 0.8;
  _dragLayer.addChild(ghost);
  _dragState = { cardId, ghost, dragType };
  showDropHighlights(dragType);
}

function clearHoverTimer(): void {
  if (hoverTimer !== null) {
    clearTimeout(hoverTimer);
    hoverTimer = null;
  }
}

function triggerCardPreview(card: Card): void {
  _onCardHover?.(card);
}

function clearCardPreview(): void {
  _onCardHover?.(null);
}

function loadCardTexture(cardId: string): void {
  // DON!! card IDs: "P1-don-0", "P2-don-3", etc.
  if (cardId.includes('-don-')) {
    const cached = textureCache.get('DON');
    if (cached !== undefined) {
      textureCache.set(cardId, cached); // reuse already-loaded texture
      rerenderCallback?.();
      return;
    }
    textureCache.set(cardId, Texture.EMPTY); // mark as loading
    (Assets.load(cardImageUrl('DON.png')) as Promise<Texture>)
      .then((tex: Texture) => {
        textureCache.set('DON', tex);   // shared cache key for all DON cards
        textureCache.set(cardId, tex);
        rerenderCallback?.();
      })
      .catch(() => { textureCache.set(cardId, Texture.EMPTY); });
    return;
  }

  const templateId = cardId.match(/[A-Z]{2,3}\d{2}-\d{3}/)?.[0];
  if (templateId === undefined) {
    textureCache.set(cardId, Texture.EMPTY);
    return;
  }
  if (textureCache.has(templateId)) return; // already loaded or loading
  textureCache.set(templateId, Texture.EMPTY); // mark as loading
  const url1 = cardImageUrl(`${templateId}.png`);
  const url2 = cardImageUrl(`${templateId}_p1.png`);
  (Assets.load(url1) as Promise<Texture>)
    .catch(() => Assets.load(url2) as Promise<Texture>)
    .then((tex: Texture) => {
      textureCache.set(templateId, tex);
      rerenderCallback?.();
    })
    .catch(() => {
      textureCache.set(templateId, Texture.EMPTY);
    });
}

export function preloadAllTextures(templateIds: string[]): void {
  for (const templateId of templateIds) {
    if (textureCache.has(templateId)) continue;
    textureCache.set(templateId, Texture.EMPTY); // mark as loading
    const url = cardImageUrl(`${templateId}.png`);
    (Assets.load(url) as Promise<Texture>)
      .then((tex: Texture) => {
        textureCache.set(templateId, tex);
        rerenderCallback?.();
      })
      .catch(() => { /* keep EMPTY */ });
  }
}

// ─── Primitives ───────────────────────────────────────────────────────────────

function addRect(
  scene: Container,
  x: number, y: number, w: number, h: number,
  color: number,
  alpha = 1,
): void {
  const g = new Graphics();
  g.rect(x, y, w, h);
  g.fill({ color, alpha });
  scene.addChild(g);
}

function addText(
  scene: Container,
  txt: string,
  x: number, y: number,
  fill = C.label,
  size = 13,
): void {
  const t = new Text({
    text: txt,
    style: { fontSize: size, fill, fontFamily: 'monospace' },
  });
  t.x = x;
  t.y = y;
  scene.addChild(t);
}

function addBorder(scene: Container, x: number, y: number, color: number, thickness = 2): void {
  const g = new Graphics();
  g.rect(x - thickness, y - thickness, CARD_W + thickness * 2, CARD_H + thickness * 2);
  g.stroke({ color, width: thickness });
  scene.addChild(g);
}

function drawZoneBackground(
  scene: Container,
  x: number, y: number, w: number, h: number,
  baseColor: number,
  borderColor: number,
  radius = 8,
): void {
  // Dark base layer
  const base = new Graphics();
  base.roundRect(x, y, w, h, radius);
  base.fill({ color: baseColor, alpha: 0.55 });
  scene.addChild(base);

  // Lighter highlight layer (top strip) to simulate gradient depth
  const highlight = new Graphics();
  highlight.roundRect(x, y, w, Math.min(h * 0.4, 40), radius);
  highlight.fill({ color: 0xffffff, alpha: 0.04 });
  scene.addChild(highlight);

  // Gold border
  const border = new Graphics();
  border.roundRect(x, y, w, h, radius);
  border.stroke({ color: borderColor, width: 1.5, alpha: 0.5 });
  scene.addChild(border);
}

function drawDashedBorder(scene: Container, x: number, y: number, color: number): void {
  const g = new Graphics();
  const dashLen = 8;
  const gap = 5;
  const r = 6;
  // Draw dashed rectangle approximation using short segments
  const corners = [
    [x + r, y],           // top
    [x + CARD_W - r, y],
    [x + CARD_W, y + r],  // right
    [x + CARD_W, y + CARD_H - r],
    [x + CARD_W - r, y + CARD_H], // bottom
    [x + r, y + CARD_H],
    [x, y + CARD_H - r],  // left
    [x, y + r],
  ];
  // Simple approach: draw 4 sides with dashes
  for (let dx = x + r; dx < x + CARD_W - r; dx += dashLen + gap) {
    g.rect(dx, y, Math.min(dashLen, x + CARD_W - r - dx), 1.5);
    g.rect(dx, y + CARD_H - 1.5, Math.min(dashLen, x + CARD_W - r - dx), 1.5);
  }
  for (let dy = y + r; dy < y + CARD_H - r; dy += dashLen + gap) {
    g.rect(x, dy, 1.5, Math.min(dashLen, y + CARD_H - r - dy));
    g.rect(x + CARD_W - 1.5, dy, 1.5, Math.min(dashLen, y + CARD_H - r - dy));
  }
  g.fill({ color, alpha: 0.35 });
  scene.addChild(g);
  void corners; // corners unused — suppress lint
}

// ─── Card rendering ───────────────────────────────────────────────────────────

function cardBodyColor(card: Card): number {
  if (card.type === 'Leader') return H.leader;
  if (card.type === 'DON')    return H.donArea;
  if (card.zone === 'board')  return H.board;
  if (card.zone === 'hand')   return H.hand;
  return 0x333344;
}

function drawCard(
  scene: Container,
  card: Card,
  x: number, y: number,
  faceDown = false,
  isSelected = false,
  isValidTarget = false,
  onClick?: () => void,
  isNew = false,
  attachedDonCount = 0,
  isCounter = false,
  isDoubleAttacker = false,
  onDragStart?: (gx: number, gy: number) => void,
  cardScale = 1,
): void {
  const fillColor = faceDown ? H.back : cardBodyColor(card);

  // Clickable container
  const cardContainer = new Container();
  cardContainer.x = x;
  cardContainer.y = y;
  if (cardScale !== 1) cardContainer.scale.set(cardScale);

  const bg = new Graphics();
  bg.rect(0, 0, CARD_W, CARD_H);
  bg.fill({ color: fillColor });
  cardContainer.addChild(bg);

  // Face-down: use recto.png if loaded, otherwise flat colour stays
  if (faceDown) {
    if (rectoTexture !== null) {
      const recto = new Sprite(rectoTexture);
      recto.width = CARD_W; recto.height = CARD_H;
      cardContainer.addChild(recto);
    } else if (!rectoLoading) {
      rectoLoading = true;
      (Assets.load(cardImageUrl('recto.png')) as Promise<Texture>)
        .then((tex: Texture) => { rectoTexture = tex; rerenderCallback?.(); })
        .catch(() => { /* keep null, flat colour stays */ });
    }
  }

  // Card artwork sprite (lazy-loaded, replaces bg when available)
  if (!faceDown) {
    const cardTemplateId = card.id.match(/[A-Z]{2,3}\d{2}-\d{3}/)?.[0] ?? card.id;
    const cachedTex = textureCache.get(cardTemplateId) ?? textureCache.get(card.id);
    if (cachedTex !== undefined && cachedTex !== Texture.EMPTY) {
      const sprite = new Sprite(cachedTex);
      sprite.width = CARD_W;
      sprite.height = CARD_H;
      cardContainer.addChild(sprite);
    } else if (cachedTex === undefined) {
      loadCardTexture(card.id);
      // bg stays visible as placeholder
    }
  }

  if (!faceDown) {
    if (card.tapped) {
      const overlay = new Graphics();
      overlay.rect(0, 0, CARD_W, CARD_H);
      overlay.fill({ color: 0x000000, alpha: 0.5 });
      cardContainer.addChild(overlay);
    }

    if (card.attachedTo !== null) {
      const dimOverlay = new Graphics();
      dimOverlay.rect(0, 0, CARD_W, CARD_H);
      dimOverlay.fill({ color: 0x000000, alpha: 0.45 });
      cardContainer.addChild(dimOverlay);
    }
  }

  // Borders for selection/target highlights
  if (isSelected) {
    const border = new Graphics();
    border.rect(-2, -2, CARD_W + 4, CARD_H + 4);
    border.stroke({ color: H.selected, width: 3 });
    cardContainer.addChild(border);
  } else if (isValidTarget) {
    const border = new Graphics();
    border.rect(-2, -2, CARD_W + 4, CARD_H + 4);
    border.stroke({ color: H.validTarget, width: 3 });
    cardContainer.addChild(border);
  } else if (isCounter) {
    const border = new Graphics();
    border.rect(-2, -2, CARD_W + 4, CARD_H + 4);
    border.stroke({ color: 0x44ffcc, width: 2 });
    cardContainer.addChild(border);
  }

  // Click handler
  if (onClick !== undefined) {
    cardContainer.interactive = true;
    cardContainer.cursor = 'pointer';
    cardContainer.on('pointertap', onClick);
  }

  // Drag handler (used for DON cards dragged onto targets) — deferred via _pendingDrag to avoid ghost on tap
  if (onDragStart !== undefined && !faceDown) {
    cardContainer.interactive = true;
    cardContainer.cursor = 'grab';
    cardContainer.on('pointerdown', (e) => {
      const ge = e as unknown as { global: { x: number; y: number }; stopPropagation: () => void };
      ge.stopPropagation();
      const templateId = card.id.match(/[A-Z]{2,3}\d{2}-\d{3}/)?.[0] ?? card.id;
      const tex = textureCache.get(templateId) ?? textureCache.get(card.id) ?? null;
      _pendingDrag = { cardId: card.id, startX: ge.global.x, startY: ge.global.y, tex: tex !== null && tex !== Texture.EMPTY ? tex : null, dragType: 'don' };
      // onDragStart intentionally not called here — drag starts only after movement threshold
    });
  }

  // Hover preview (face-up cards only — no lift to avoid pointerout before 500 ms timer fires)
  if (!faceDown) {
    cardContainer.interactive = true;
    cardContainer.on('pointerover', () => {
      clearHoverTimer();
      hoveredCardId = card.id;
      hoverTimer = setTimeout(() => {
        if (hoveredCardId === card.id) triggerCardPreview(card);
      }, 500);
    });
    cardContainer.on('pointerout', () => {
      if (hoveredCardId === card.id) {
        clearHoverTimer();
        hoveredCardId = null;
        clearCardPreview();
      }
    });
  }

  scene.addChild(cardContainer);

  if (isNew) scaleIn(cardContainer);
}

// ─── Zone helpers ─────────────────────────────────────────────────────────────

function drawStack(
  scene: Container,
  label: string,
  count: number,
  x: number, y: number,
  color: number,
  topCard?: Card,
  onClick?: () => void,
): void {
  addText(scene, label, x, y - 17, C.label);

  const cardContainer = new Container();
  cardContainer.x = x;
  cardContainer.y = y;

  // Background
  const bg = new Graphics();
  bg.rect(0, 0, CARD_W, CARD_H);
  bg.fill({ color: count > 0 ? color : H.empty, alpha: count > 0 ? 1 : 0.10 });
  cardContainer.addChild(bg);

  // Card back image on non-empty piles (deck, life, DON!! deck)
  if (count > 0 && topCard === undefined && rectoTexture !== null) {
    const recto = new Sprite(rectoTexture);
    recto.width = CARD_W; recto.height = CARD_H;
    cardContainer.addChild(recto);
  }

  // Show top card artwork when provided (e.g. trash pile)
  if (topCard !== undefined && count > 0) {
    const templateId = topCard.id.match(/[A-Z]{2,3}\d{2}-\d{3}/)?.[0] ?? topCard.id;
    const cachedTex = textureCache.get(templateId);
    if (cachedTex !== undefined && cachedTex !== Texture.EMPTY) {
      const sprite = new Sprite(cachedTex);
      sprite.width  = CARD_W;
      sprite.height = CARD_H;
      cardContainer.addChild(sprite);
    } else if (cachedTex === undefined) {
      loadCardTexture(topCard.id);
    }
  }

  // Count badge
  const txt   = count > 0 ? `${count}` : '—';
  const tFill = count > 0 ? C.white : C.muted;
  const tSize = count > 0 ? 24 : 18;
  const countTxt = new Text({
    text: txt,
    style: { fontSize: tSize, fill: tFill, fontFamily: 'monospace' },
  });
  countTxt.x = CARD_W / 2 - (count > 9 ? 13 : 8);
  countTxt.y = CARD_H / 2 - 13;
  cardContainer.addChild(countTxt);

  // Hover preview (same 500 ms delay as regular cards)
  if (topCard !== undefined && count > 0) {
    cardContainer.interactive = true;
    cardContainer.cursor = 'help';
    cardContainer.on('pointerover', () => {
      clearHoverTimer();
      hoveredCardId = topCard.id;
      hoverTimer = setTimeout(() => {
        if (hoveredCardId === topCard.id) triggerCardPreview(topCard);
      }, 500);
    });
    cardContainer.on('pointerout', () => {
      if (hoveredCardId === topCard.id) {
        clearHoverTimer();
        hoveredCardId = null;
        clearCardPreview();
      }
    });
  }

  // Click handler (e.g. open trash viewer)
  if (onClick !== undefined && count > 0) {
    cardContainer.interactive = true;
    cardContainer.cursor = 'pointer';
    cardContainer.on('pointertap', onClick);
  }

  scene.addChild(cardContainer);
}

function drawSpread(
  scene: Container,
  label: string,
  ids: readonly CardId[],
  allCards: Readonly<Record<CardId, Card>>,
  x: number, y: number,
  faceDown = false,
  uiState: UIState,
  activePlayerId: PlayerId,
  onCardClick: (id: CardId) => void,
  newCardIds: ReadonlySet<CardId> = new Set(),
  counterDefenderId: PlayerId | null = null,
  blockerLocked = false,
  cardGap = GAP,
  onCardDragStart?: (id: CardId, gx: number, gy: number) => void,
): void {
  addText(scene, `${label} (${ids.length})`, x, y - 17, C.label);

  if (ids.length === 0) {
    addRect(scene, x, y, CARD_W, CARD_H, H.empty, 0.07);
    return;
  }

  ids.forEach((id, i) => {
    const card = allCards[id];
    if (card === undefined) return;
    const isSelected = uiState.selectedCardId === id;
    const isTarget = isValidTarget(id, card, uiState, activePlayerId, allCards);
    const isCounter = !faceDown
      && !blockerLocked
      && counterDefenderId !== null
      && card.ownerId === counterDefenderId
      && card.zone === 'hand'
      && (card.counter ?? 0) > 0;
    drawCard(
      scene, card,
      x + i * (CARD_W + cardGap), y,
      faceDown,
      isSelected,
      isTarget,
      faceDown ? undefined : () => onCardClick(id),
      newCardIds.has(id),
      0,
      isCounter,
      false,
      onCardDragStart !== undefined ? (gx, gy) => onCardDragStart(id, gx, gy) : undefined,
    );
  });
}

// ─── Valid target detection ────────────────────────────────────────────────────

function isValidTarget(
  id: CardId,
  card: Card,
  uiState: UIState,
  activePlayerId: PlayerId,
  _allCards: Readonly<Record<CardId, Card>>,
): boolean {
  if (uiState.selectionMode === 'attack') {
    // Valid targets: opponent's board cards or leader (any non-active owner)
    return (card.zone === 'board' || card.type === 'Leader') && card.ownerId !== activePlayerId;
  }
  if (uiState.selectionMode === 'assignDon') {
    // Valid targets: OWN board cards or OWN leader (not the selected DON itself)
    return (card.zone === 'board' || card.type === 'Leader')
      && id !== uiState.selectedCardId
      && card.ownerId === activePlayerId;
  }
  if (uiState.selectionMode === 'chooseTarget') {
    const scope = uiState.targetScope;
    if (scope === 'ChooseOpponentCharacter') {
      return card.zone === 'board' && card.ownerId !== activePlayerId;
    }
    if (scope === 'ChooseOwnCharacter') {
      return card.zone === 'board' && card.ownerId === activePlayerId;
    }
  }
  return false;
}

// ─── Player rendering ─────────────────────────────────────────────────────────

function renderPlayer(
  scene: Container,
  player: PlayerState,
  allCards: Readonly<Record<CardId, Card>>,
  pos: 'top' | 'bottom',
  uiState: UIState,
  onCardClick: (id: CardId) => void,
  newCardIds: ReadonlySet<CardId>,
  activePlayerId: PlayerId,
  counterDefenderId: PlayerId | null,
  hideCards: boolean,
  combatViewDefenderId: PlayerId | null,
  doubleAttackerId: CardId | null,
  myPlayerId: PlayerId | null,
  skipHand = false,
  onTrashClick?: (cards: Card[]) => void,
): void {
  const isTop    = pos === 'top';
  const isActive = player.id === activePlayerId;
  const handY    = isTop ? P2_HAND_Y    : P1_HAND_Y;
  const donY     = isTop ? P2_DON_ROW_Y : P1_DON_ROW_Y;
  const midY     = isTop ? P2_MID_ROW_Y : P1_MID_ROW_Y;
  const boardY   = isTop ? P2_BOARD_Y   : P1_BOARD_Y;

  // HAND visibility:
  // - Network mode (myPlayerId set): only show the local player's own hand face-up
  // - hideCards: privacy mode (turn/combat handoff) → all hands face-down
  // - combatViewDefenderId set: defender's hand face-up, everyone else face-down
  // - normal hotseat: only active player's hand face-up
  const handFaceDown = myPlayerId !== null
    ? player.id !== myPlayerId
    : hideCards || (combatViewDefenderId !== null ? player.id !== combatViewDefenderId : !isActive);
  // Counter cards are greyed out (no cyan highlight) if a blocker is selected or already declared
  const blockerLocked = uiState.selectionMode === 'declareBlock' && uiState.selectedCardId !== null;
  // Center the hand horizontally
  const handCount = player.hand.length;
  const handSpreadW = handCount > 0 ? handCount * (CARD_W + GAP) - GAP : CARD_W;
  const handX = Math.max(LEFT_COL, Math.round((CANVAS_W - handSpreadW) / 2));
  if (!skipHand) {
    drawSpread(scene, 'HAND', player.hand, allCards, handX, handY, handFaceDown, uiState, activePlayerId, onCardClick, newCardIds, counterDefenderId, blockerLocked);
  }

  // DON row
  drawStack(scene, 'DON!!', player.donDeck.length, COL_DON_DECK, donY, H.donDeck);
  // COST AREA — fixed width centered (max 10 DON cards)
  const donZoneX    = Math.round((CANVAS_W - DON_ZONE_W) / 2);
  drawZoneBackground(scene, donZoneX - 6, donY - 4, DON_ZONE_W + 12, CARD_H + 8, H.donArea, H.sep);
  const costCount   = player.donArea.length;
  const costSpreadW = costCount > 0 ? costCount * (CARD_W + DON_GAP) - DON_GAP : CARD_W;
  const costX       = costCount > 0 ? Math.max(donZoneX, Math.round((CANVAS_W - costSpreadW) / 2)) : donZoneX;
  drawSpread(scene, 'COST AREA', player.donArea, allCards, costX, donY, false, uiState, activePlayerId, onCardClick, newCardIds,
    null, false, DON_GAP,
    (id, gx, gy) => {
      const templateId = String(id).match(/[A-Z]{2,3}\d{2}-\d{3}/)?.[0] ?? String(id);
      const tex = textureCache.get(templateId) ?? textureCache.get(id) ?? null;
      _pendingDrag = { cardId: id, startX: gx, startY: gy, tex: tex !== null && tex !== Texture.EMPTY ? tex : null, dragType: 'don' };
    },
  );
  const trashTopId   = player.trash[player.trash.length - 1];
  const trashTopCard = trashTopId !== undefined ? allCards[trashTopId] : undefined;
  const trashCbFn = onTrashClick;
  const trashAllCards = trashCbFn !== undefined
    ? [...player.trash].reverse().map(id => allCards[id]).filter((c): c is Card => c !== undefined)
    : undefined;
  drawStack(scene, 'TRASH', player.trash.length, COL_TRASH, donY, 0x3a3a4a, trashTopCard,
    trashCbFn !== undefined && trashAllCards !== undefined ? () => trashCbFn(trashAllCards) : undefined);

  // Middle row: LIFE | LEADER | STAGE | DECK
  drawStack(scene, 'LIFE', player.life.length, COL_LIFE, midY, H.life);

  // Leader (clickable as attack / DON-assign target)
  addText(scene, 'LEADER', COL_LEADER, midY - 17, C.label);
  if (player.leader !== null) {
    const lc = allCards[player.leader];
    if (lc !== undefined) {
      // attack: opponent's leader is valid; assignDon: only OWN leader is valid
      const isTarget = uiState.selectionMode === 'attack'
        ? !isActive
        : uiState.selectionMode === 'assignDon' && isActive;
      // Count DON attached to this leader
      const donCount = Object.values(allCards).filter(
        c => c.type === 'DON' && c.attachedTo === player.leader
      ).length;
      const isLeaderSelected = uiState.selectedCardId === player.leader;
      const LEADER_SCALE = 1.18;
      const lx = Math.round(COL_LEADER - (CARD_W * (LEADER_SCALE - 1)) / 2);
      const ly = Math.round(midY      - (CARD_H * (LEADER_SCALE - 1)) / 2);
      registerDropZone(lx, ly, player.leader, player.id, Math.round(CARD_W * LEADER_SCALE), Math.round(CARD_H * LEADER_SCALE));
      drawCard(scene, lc, lx, ly, false, isLeaderSelected, isTarget, () => onCardClick(player.leader!), false, donCount, false, false, undefined, LEADER_SCALE);
    }
  } else {
    addRect(scene, COL_LEADER, midY, CARD_W, CARD_H, H.empty, 0.08);
    drawDashedBorder(scene, COL_LEADER, midY, 0xffc825);
  }

  // Stage (placeholder + optional ship decoration when empty)
  addText(scene, 'STAGE', COL_STAGE, midY - 17, C.label);
  addRect(scene, COL_STAGE, midY, CARD_W, CARD_H, H.stage, 0.10);
  if (bgShipTexture !== null) {
    const ship = new Sprite(bgShipTexture);
    ship.alpha = 0.22;
    ship.width = CARD_W; ship.height = CARD_H;
    ship.x = COL_STAGE; ship.y = midY;
    scene.addChild(ship);
  }

  // Deck
  drawStack(scene, 'DECK', player.deck.length, COL_DECK, midY, H.back);

  // Board — compute DON count per card
  const boardIds = player.board;
  // CHARACTER AREA — capped width centered (max 5 characters)
  const charZoneX = Math.round((CANVAS_W - CHAR_ZONE_W) / 2);
  drawZoneBackground(scene, charZoneX - 6, boardY - 4, CHAR_ZONE_W + 12, CARD_H + 8, H.board, H.sep);
  addText(scene, `CHARACTER AREA (${boardIds.length})`, charZoneX, boardY - 17, C.label);
  const boardSpreadW = boardIds.length > 0 ? boardIds.length * (CARD_W + GAP) - GAP : CARD_W;
  const boardStartX = boardIds.length > 0
    ? Math.max(charZoneX, Math.round((CANVAS_W - boardSpreadW) / 2))
    : charZoneX;
  if (boardIds.length === 0) {
    addRect(scene, boardStartX, boardY, CARD_W, CARD_H, H.empty, 0.08);
    drawDashedBorder(scene, boardStartX, boardY, 0xb8860b);
  } else {
    boardIds.forEach((id, i) => {
      const card = allCards[id];
      if (card === undefined) return;
      const isSelected = uiState.selectedCardId === id;
      const isTarget = isValidTarget(id, card, uiState, activePlayerId, allCards);
      const donCount = Object.values(allCards).filter(
        c => c.type === 'DON' && c.attachedTo === id
      ).length;
      const isDA  = id === doubleAttackerId && (card.keywords ?? []).includes('DoubleAttack');
      const cardX = boardStartX + i * (CARD_W + GAP);
      registerDropZone(cardX, boardY, id, player.id);
      drawCard(
        scene, card,
        cardX, boardY,
        false, isSelected, isTarget,
        () => onCardClick(id),
        newCardIds.has(id),
        donCount,
        false,
        isDA,
      );
    });
  }

  // Player badge — gold, Cinzel-style
  const badge = `${isTop ? '▲' : '▼'} ${player.id}`;
  addText(scene, badge, CANVAS_W - 210, isTop ? handY + CARD_H + 4 : handY - 24, C.hudText, 17);
}

// ─── Hand fan (Hearthstone-style) ────────────────────────────────────────────

function drawHandFan(
  scene: Container,
  player: PlayerState,
  allCards: Readonly<Record<CardId, Card>>,
  handY: number,
  faceDown: boolean,
  uiState: UIState,
  activePlayerId: PlayerId,
  onCardClick: (id: CardId) => void,
  newCardIds: ReadonlySet<CardId>,
  counterDefenderId: PlayerId | null,
  blockerLocked: boolean,
): void {
  const ids = player.hand;
  const n   = ids.length;

  if (n === 0) {
    const emptyX = Math.round((CANVAS_W - HAND_W) / 2);
    addRect(scene, emptyX, handY, HAND_W, HAND_H, H.empty, 0.07);
    return;
  }

  const MAX_ROT      = 16 * (Math.PI / 180);
  const ARC_DROP     = 22;
  const HAND_OVERLAP = Math.min(HAND_W - 20, Math.max(0, HAND_W - (CANVAS_W * 0.55) / n));
  const totalWidth   = n * (HAND_W - HAND_OVERLAP) + HAND_OVERLAP;
  const startX       = Math.round((CANVAS_W - totalWidth) / 2);

  const fanContainer = new Container();
  fanContainer.sortableChildren = true;
  scene.addChild(fanContainer);

  ids.forEach((id, i) => {
    const card = allCards[id];
    if (card === undefined) return;

    const t        = n > 1 ? (i / (n - 1)) * 2 - 1 : 0;
    const rotation = t * MAX_ROT;
    const arcY     = t * t * ARC_DROP;
    const baseY    = handY + HAND_H + arcY;

    const isSelected = uiState.selectedCardId === id;
    const isTarget   = isValidTarget(id, card, uiState, activePlayerId, allCards);
    const isCounter  = !faceDown
      && !blockerLocked
      && counterDefenderId !== null
      && card.ownerId === counterDefenderId
      && card.zone === 'hand'
      && (card.counter ?? 0) > 0;

    const cardContainer = new Container();
    cardContainer.pivot.set(HAND_W / 2, HAND_H);
    cardContainer.rotation = rotation;
    cardContainer.x        = startX + i * (HAND_W - HAND_OVERLAP) + HAND_W / 2;
    cardContainer.y        = baseY;
    cardContainer.zIndex   = n - Math.round(Math.abs(t) * n);

    // Background
    const cardBg = new Graphics();
    cardBg.rect(0, 0, HAND_W, HAND_H);
    cardBg.fill({ color: faceDown ? H.back : cardBodyColor(card) });
    cardContainer.addChild(cardBg);

    // Artwork
    if (faceDown) {
      if (rectoTexture !== null) {
        const recto = new Sprite(rectoTexture);
        recto.width = HAND_W; recto.height = HAND_H;
        cardContainer.addChild(recto);
      }
    } else {
      const templateId = card.id.match(/[A-Z]{2,3}\d{2}-\d{3}/)?.[0] ?? card.id;
      const cachedTex  = textureCache.get(templateId) ?? textureCache.get(card.id);
      if (cachedTex !== undefined && cachedTex !== Texture.EMPTY) {
        const sprite = new Sprite(cachedTex);
        sprite.width  = HAND_W;
        sprite.height = HAND_H;
        cardContainer.addChild(sprite);
      } else if (cachedTex === undefined) {
        loadCardTexture(card.id);
      }
    }

    // Border highlights
    if (isSelected) {
      const border = new Graphics();
      border.rect(-2, -2, HAND_W + 4, HAND_H + 4);
      border.stroke({ color: H.selected, width: 3 });
      cardContainer.addChild(border);
    } else if (isTarget) {
      const border = new Graphics();
      border.rect(-2, -2, HAND_W + 4, HAND_H + 4);
      border.stroke({ color: H.validTarget, width: 3 });
      cardContainer.addChild(border);
    } else if (isCounter) {
      const border = new Graphics();
      border.rect(-2, -2, HAND_W + 4, HAND_H + 4);
      border.stroke({ color: 0x44ffcc, width: 2 });
      cardContainer.addChild(border);
    }

    // Interactivity
    cardContainer.interactive = true;
    cardContainer.cursor      = faceDown ? 'default' : 'pointer';
    const origZIndex = cardContainer.zIndex;

    if (!faceDown) {
      cardContainer.on('pointertap', () => onCardClick(id));
    }

    cardContainer.on('pointerover', () => {
      clearHoverTimer();
      hoveredCardId = card.id;
      hoverTimer = setTimeout(() => {
        if (hoveredCardId === card.id) triggerCardPreview(card);
      }, 500);
      cardContainer.scale.set(1.15);
      cardContainer.y      = baseY - 18;
      cardContainer.zIndex = 9999;
    });

    cardContainer.on('pointerout', () => {
      if (hoveredCardId === card.id) {
        clearHoverTimer();
        hoveredCardId = null;
        clearCardPreview();
      }
      cardContainer.scale.set(1);
      cardContainer.y      = baseY;
      cardContainer.zIndex = origZIndex;
    });

    // Drag to play — uses pending drag to avoid ghost on tap
    if (!faceDown) {
      cardContainer.on('pointerdown', (e) => {
        const ge = e as unknown as { global: { x: number; y: number }; stopPropagation: () => void };
        ge.stopPropagation();
        const templateId = card.id.match(/[A-Z]{2,3}\d{2}-\d{3}/)?.[0] ?? card.id;
        const tex        = textureCache.get(templateId) ?? textureCache.get(card.id) ?? null;
        _pendingDrag = { cardId: id, startX: ge.global.x, startY: ge.global.y, tex: tex !== null && tex !== Texture.EMPTY ? tex : null, dragType: 'hand' };
      });
    }

    if (newCardIds.has(id)) scaleIn(cardContainer);

    fanContainer.addChild(cardContainer);
  });
}

// ─── Animation detection ──────────────────────────────────────────────────────

function detectAndAnimate(
  animLayer: Container,
  prevState: GameState | null,
  nextState: GameState,
): void {
  if (prevState === null) return;

  const [p1Id, p2Id] = nextState.playerOrder;

  for (const pId of [p1Id, p2Id]) {
    const prev = prevState.players[pId];
    const next = nextState.players[pId];
    if (prev === undefined || next === undefined) continue;

    // Leader damage: life count decreased
    if (next.life.length < prev.life.length) {
      const isTop = pId === p2Id;
      const midY = isTop ? P2_MID_ROW_Y : P1_MID_ROW_Y;
      flashLife(animLayer, COL_LIFE, midY);
    }

    // KO: card was on board, now gone
    const prevBoardSet = new Set(prev.board);
    for (const id of prev.board) {
      if (!next.board.includes(id) && !next.hand.includes(id)) {
        // Card was KO'd — animate at its former board position
        const idx = [...prevBoardSet].indexOf(id);
        const isTop = pId === p2Id;
        const boardY = isTop ? P2_BOARD_Y : P1_BOARD_Y;
        koFade(animLayer, COL_BOARD + idx * (CARD_W + GAP), boardY);
      }
    }
  }
}

// ─── Public entry point ───────────────────────────────────────────────────────

let _prevState: GameState | null = null;

export function renderGameState(
  scene: Container,
  animLayer: Container,
  state: GameState,
  uiState: UIState,
  onCardClick: (id: CardId) => void,
  hideCards = false,
  combatViewDefenderId: PlayerId | null = null,
  myPlayerId: PlayerId | null = null,
): void {
  _animLayerRef = animLayer;

  // Detect new board cards for scale-in animation
  const newBoardIds = new Set<CardId>();
  if (_prevState !== null) {
    for (const pId of state.playerOrder) {
      const prevPlayer = _prevState.players[pId];
      const nextPlayer = state.players[pId];
      if (prevPlayer === undefined || nextPlayer === undefined) continue;
      for (const id of nextPlayer.board) {
        if (!prevPlayer.board.includes(id)) newBoardIds.add(id);
      }
    }
  }

  // Trigger animations before redraw
  detectAndAnimate(animLayer, _prevState, state);
  _prevState = state;

  // Kill GSAP tweens on old children before clearing — orphaned tweens on removed containers
  // can corrupt PixiJS's WebGL batch state. Do NOT destroy() — that corrupts the EventSystem.
  for (const child of scene.children) {
    killContainerTweens(child as Container);
  }
  scene.removeChildren();

  // ── Gold ornate separator ──────────────────────────────────────────────────
  // Outer glow halo
  const sepGlow = new Graphics();
  sepGlow.rect(0, SEP_Y - 8, CANVAS_W, 16);
  sepGlow.fill({ color: 0xb8860b, alpha: 0.06 });
  scene.addChild(sepGlow);
  // Thin flanking lines
  const sepThin1 = new Graphics();
  sepThin1.rect(0, SEP_Y - 4, CANVAS_W, 1);
  sepThin1.fill({ color: 0xffd700, alpha: 0.35 });
  scene.addChild(sepThin1);
  const sepThin2 = new Graphics();
  sepThin2.rect(0, SEP_Y + 3, CANVAS_W, 1);
  sepThin2.fill({ color: 0xffd700, alpha: 0.35 });
  scene.addChild(sepThin2);
  // Main gold line
  const sepMain = new Graphics();
  sepMain.rect(0, SEP_Y - 1.5, CANVAS_W, 3);
  sepMain.fill({ color: 0xb8860b, alpha: 0.85 });
  scene.addChild(sepMain);
  // Diamond ornaments at 1/4, 1/2, 3/4
  for (const cx of [CANVAS_W * 0.25, CANVAS_W * 0.5, CANVAS_W * 0.75]) {
    const diamond = new Graphics();
    diamond.poly([
      { x: cx,     y: SEP_Y - 7 },
      { x: cx + 7, y: SEP_Y     },
      { x: cx,     y: SEP_Y + 7 },
      { x: cx - 7, y: SEP_Y     },
    ]);
    diamond.fill({ color: 0xffd700, alpha: 0.9 });
    scene.addChild(diamond);
  }

  const [p1Id, p2Id] = state.playerOrder;

  // Local player always at bottom; opponent at top.
  // In network mode: use myPlayerId. In hotseat: flip board so the active player
  // (or the defender during combat blocking) always sees themselves at the bottom.
  const meId = (myPlayerId !== null && state.players[myPlayerId] !== undefined)
    ? myPlayerId
    : (combatViewDefenderId ?? state.activePlayerId);
  const opId = meId === p1Id ? p2Id : p1Id;
  const me = state.players[meId];
  const op = state.players[opId];
  if (me === undefined || op === undefined) return;

  // Defender ID (non-active player) — used to highlight counter-playable hand cards
  const counterDefenderId = state.activeCombat !== null
    ? (state.activePlayerId === meId ? opId : meId)
    : null;

  // DoubleAttack attacker: the attacker card id if it has DoubleAttack keyword
  const doubleAttackerId = (() => {
    if (state.activeCombat === null) return null;
    const { attackerId } = state.activeCombat;
    const attacker = state.cards[attackerId];
    return (attacker?.keywords ?? []).includes('DoubleAttack') ? attackerId : null;
  })();

  // Clear drop zones — rebuilt each render
  _dropZones = [];
  _activePlayerId = state.activePlayerId;

  // Render both players without hand (fan is drawn last so it stays above everything)
  const trashCb = (cards: Card[]) => _onTrashClick?.(cards);
  renderPlayer(scene, op, state.cards, 'top',    uiState, onCardClick, newBoardIds, state.activePlayerId, counterDefenderId, hideCards, combatViewDefenderId, doubleAttackerId, myPlayerId, true,  trashCb);
  renderPlayer(scene, me, state.cards, 'bottom', uiState, onCardClick, newBoardIds, state.activePlayerId, counterDefenderId, hideCards, combatViewDefenderId, doubleAttackerId, myPlayerId, true,  trashCb);

  // Hand face-down logic (mirrors renderPlayer logic)
  const opHandFaceDown = myPlayerId !== null
    ? op.id !== myPlayerId
    : hideCards || (combatViewDefenderId !== null ? op.id !== combatViewDefenderId : op.id !== state.activePlayerId);
  const meHandFaceDown = myPlayerId !== null
    ? me.id !== myPlayerId
    : hideCards || (combatViewDefenderId !== null ? me.id !== combatViewDefenderId : me.id !== state.activePlayerId);
  const blockerLockedGlobal = uiState.selectionMode === 'declareBlock' && uiState.selectedCardId !== null;

  drawHandFan(scene, op, state.cards, P2_HAND_Y, opHandFaceDown, uiState, state.activePlayerId, onCardClick, newBoardIds, counterDefenderId, blockerLockedGlobal);
  drawHandFan(scene, me, state.cards, P1_HAND_Y, meHandFaceDown, uiState, state.activePlayerId, onCardClick, newBoardIds, counterDefenderId, blockerLockedGlobal);
}
