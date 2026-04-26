import { Container, Graphics, Text, Sprite, Texture, Assets } from 'pixi.js';
import type { Card, CardId, GameState, PlayerId, PlayerState } from 'game-engine';
// combatViewDefenderId: when set, show that player's hand and hide the attacker's hand
import type { UIState } from '../ui/uiState';
import { flashLife, koFade, scaleIn } from './animations';

// ─── Layout ───────────────────────────────────────────────────────────────────

const CANVAS_W = 1920;
const CANVAS_H = 1080;
const CARD_W   = 86;
const CARD_H   = 120;
const GAP      = 10;
const ROW_GAP  = 5;
const SEP_Y    = CANVAS_H / 2; // 540

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
  bg:      '#030a14',
  sep:     '#0a3050',
  leader:  '#d4a017',
  life:    '#c0392b',
  donDeck: '#4a1a6a',
  donArea: '#3a1a5a',
  board:   '#01150e',
  hand:    '#01101a',
  back:    '#020c18',
  empty:   '#020810',
  label:   '#0a4a6a',
  white:   '#d0e8f8',
  yellow:  '#ffee44',
  purple:  '#aa66ff',
  red:     '#ff4466',
  muted:   '#0a2a3a',
  stage:   '#01120a',
  cyan:    '#00ccff',
  hudText: '#1a7aaa',
};

const H = {
  bg:       0x030a14,
  sep:      0x0a3050,
  leader:   0xd4a017,
  life:     0xc0392b,
  donDeck:  0x4a1a6a,
  donArea:  0x3a1a5a,
  board:    0x01150e,
  hand:     0x01101a,
  back:     0x020c18,
  empty:    0x020810,
  stage:    0x01120a,
  selected: 0x00ccff,
  validTarget: 0x44ff88,
};

// ─── Background layer (ocean artwork) ────────────────────────────────────────

// Cached textures set by setupBgLayer — null = file not present, no warning logged
let bgShipTexture: Texture | null = null;

// Card back (recto) texture — loaded once on first face-down render
let rectoTexture: Texture | null = null;
let rectoLoading = false;

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
    Assets.load<Texture>('/card-images/recto.png'),
  ]);

  // Use results directly — never call Assets.get() to avoid cache-miss warnings
  if (bgResult.status === 'fulfilled') {
    const bg = new Sprite(bgResult.value);
    bg.width = CANVAS_W; bg.height = CANVAS_H;
    bgLayer.addChild(bg); // on top of solid fallback

    // Dark overlay keeps cards readable over the background image
    const overlay = new Graphics();
    overlay.rect(0, 0, CANVAS_W, CANVAS_H);
    overlay.fill({ color: 0x000000, alpha: 0.52 });
    bgLayer.addChild(overlay);
  }

  if (wavesResult.status === 'fulfilled') {
    const waves = new Sprite(wavesResult.value);
    waves.width = CANVAS_W; waves.height = 80;
    waves.y = SEP_Y - 40;
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

// ─── Card preview (hover ≥ 3 s) ──────────────────────────────────────────────

const PREVIEW_W      = 420;
const PREVIEW_H      = 588; // keeps 5:7 ratio (same as 86×120)
const PREVIEW_INFO_H = 150;
const PREVIEW_X      = CANVAS_W - PREVIEW_W - 20; // right side, away from board center
const PREVIEW_Y      = Math.round((CANVAS_H - PREVIEW_H - PREVIEW_INFO_H) / 2);

let hoverTimer: ReturnType<typeof setTimeout> | null = null;
let hoveredCardId: string | null = null;
let previewLayerRef: Container | null = null;

export function setPreviewLayer(layer: Container): void {
  previewLayerRef = layer;
}

function clearHoverTimer(): void {
  if (hoverTimer !== null) {
    clearTimeout(hoverTimer);
    hoverTimer = null;
  }
}

function showCardPreview(card: Card): void {
  const layer = previewLayerRef;
  if (layer === null) return;
  layer.removeChildren();

  const px = PREVIEW_X;
  const py = PREVIEW_Y;

  // Outer backdrop + border
  const backdrop = new Graphics();
  backdrop.rect(px - 8, py - 8, PREVIEW_W + 16, PREVIEW_H + PREVIEW_INFO_H + 16);
  backdrop.fill({ color: 0x000000, alpha: 0.92 });
  backdrop.stroke({ color: 0x6666bb, width: 2 });
  layer.addChild(backdrop);

  // Card artwork (or coloured placeholder)
  const previewTemplateId = card.id.match(/OP\d{2}-\d{3}/)?.[0] ?? card.id;
  const cachedTex = textureCache.get(previewTemplateId);
  if (cachedTex !== undefined && cachedTex !== Texture.EMPTY) {
    const sprite = new Sprite(cachedTex);
    sprite.x = px; sprite.y = py;
    sprite.width  = PREVIEW_W;
    sprite.height = PREVIEW_H;
    layer.addChild(sprite);
  } else {
    const imgBg = new Graphics();
    imgBg.rect(px, py, PREVIEW_W, PREVIEW_H);
    imgBg.fill({ color: cardBodyColor(card) });
    layer.addChild(imgBg);
    const fallbackName = new Text({
      text: card.name,
      style: { fontSize: 20, fill: '#ffffff', fontFamily: 'monospace',
               wordWrap: true, wordWrapWidth: PREVIEW_W - 16 },
    });
    fallbackName.x = px + 8;
    fallbackName.y = py + PREVIEW_H / 2 - 10;
    layer.addChild(fallbackName);
  }

  // Info panel
  const panelY = py + PREVIEW_H;
  const panelBg = new Graphics();
  panelBg.rect(px, panelY, PREVIEW_W, PREVIEW_INFO_H);
  panelBg.fill({ color: 0x0d0d2a });
  layer.addChild(panelBg);

  let lineY = panelY + 9;

  const nameT = new Text({
    text: card.name,
    style: { fontSize: 17, fill: '#ffffff', fontFamily: 'monospace', fontWeight: 'bold' },
  });
  nameT.x = px + 10; nameT.y = lineY;
  layer.addChild(nameT);
  lineY += 25;

  const infoParts: string[] = [card.type];
  if (card.type !== 'DON' && card.type !== 'Leader') infoParts.push(`Cost ${card.cost}`);
  if (card.power > 0) infoParts.push(`Power ${card.power}`);
  const infoT = new Text({
    text: infoParts.join('  •  '),
    style: { fontSize: 13, fill: '#aaaacc', fontFamily: 'monospace' },
  });
  infoT.x = px + 10; infoT.y = lineY;
  layer.addChild(infoT);
  lineY += 20;

  if ((card.counter ?? 0) > 0) {
    const ctrT = new Text({
      text: `Counter  +${card.counter}`,
      style: { fontSize: 13, fill: '#44ffcc', fontFamily: 'monospace' },
    });
    ctrT.x = px + 10; ctrT.y = lineY;
    layer.addChild(ctrT);
    lineY += 20;
  }

  const kws = [...(card.keywords ?? []), ...(card.temporaryKeywords ?? [])];
  if (kws.length > 0) {
    const kwT = new Text({
      text: kws.join('  /  '),
      style: { fontSize: 13, fill: '#ffee44', fontFamily: 'monospace', fontWeight: 'bold' },
    });
    kwT.x = px + 10; kwT.y = lineY;
    layer.addChild(kwT);
  }
}

function hideCardPreview(): void {
  previewLayerRef?.removeChildren();
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
    (Assets.load('/card-images/DON.png') as Promise<Texture>)
      .then((tex: Texture) => {
        textureCache.set('DON', tex);   // shared cache key for all DON cards
        textureCache.set(cardId, tex);
        rerenderCallback?.();
      })
      .catch(() => { textureCache.set(cardId, Texture.EMPTY); });
    return;
  }

  const templateId = cardId.match(/OP\d{2}-\d{3}/)?.[0];
  if (templateId === undefined) {
    textureCache.set(cardId, Texture.EMPTY);
    return;
  }
  if (textureCache.has(templateId)) return; // already loaded or loading
  textureCache.set(templateId, Texture.EMPTY); // mark as loading
  const url1 = `/card-images/${templateId}.png`;
  const url2 = `/card-images/${templateId}_p1.png`;
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
    const url = `/card-images/${templateId}.png`;
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
): void {
  const fillColor = faceDown ? H.back : cardBodyColor(card);

  // Clickable container
  const cardContainer = new Container();
  cardContainer.x = x;
  cardContainer.y = y;

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
      (Assets.load('/card-images/recto.png') as Promise<Texture>)
        .then((tex: Texture) => { rectoTexture = tex; rerenderCallback?.(); })
        .catch(() => { /* keep null, flat colour stays */ });
    }
  }

  // Card artwork sprite (lazy-loaded, replaces bg when available)
  if (!faceDown) {
    const cardTemplateId = card.id.match(/OP\d{2}-\d{3}/)?.[0] ?? card.id;
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
    if (card.type !== 'DON') {
      const name = card.name.length > 7 ? `${card.name.slice(0, 6)}…` : card.name;
      const nameTxt = new Text({ text: name, style: { fontSize: 11, fill: C.white, fontFamily: 'monospace' } });
      nameTxt.x = 4; nameTxt.y = 4;
      cardContainer.addChild(nameTxt);
    }

    if (card.type !== 'Leader' && card.type !== 'DON') {
      const costTxt = new Text({ text: `${card.cost}`, style: { fontSize: 15, fill: C.yellow, fontFamily: 'monospace' } });
      costTxt.x = 4; costTxt.y = CARD_H - 21;
      cardContainer.addChild(costTxt);
    }

    // Total power (base + DON boost) — bottom right for Leader and Character
    // DoubleAttack attacker: show x2 effective power
    if (card.type === 'Leader' || card.type === 'Character') {
      const basePower  = card.power + attachedDonCount * 1000;
      const totalPower = isDoubleAttacker ? basePower * 2 : basePower;
      const boosted    = attachedDonCount > 0 || isDoubleAttacker;
      const powerFill  = isDoubleAttacker ? C.red : boosted ? C.yellow : C.purple;
      const powerLabel = isDoubleAttacker ? `${totalPower}(x2)` : `${totalPower}`;
      const powerTxt = new Text({
        text: powerLabel,
        style: { fontSize: 12, fill: powerFill, fontFamily: 'monospace', fontWeight: boosted ? 'bold' : 'normal' },
      });
      powerTxt.x = CARD_W - 50; powerTxt.y = CARD_H - 21;
      cardContainer.addChild(powerTxt);
    }

    // Keywords (Rush, Blocker, etc.) — shown as small badges
    if ((card.keywords ?? []).length > 0) {
      const kw = (card.keywords ?? []).map((k: string) => {
        if (k === 'DoubleAttack') return 'D.ATK';
        if (k === 'Unblockable') return 'UNBK';
        return k.toUpperCase().slice(0, 5);
      }).join(' ');
      const kwTxt = new Text({
        text: kw,
        style: { fontSize: 9, fill: C.yellow, fontFamily: 'monospace', fontWeight: 'bold' },
      });
      kwTxt.x = 4; kwTxt.y = CARD_H / 2 - 5;
      cardContainer.addChild(kwTxt);
    }

    if (card.tapped) {
      const overlay = new Graphics();
      overlay.rect(0, 0, CARD_W, CARD_H);
      overlay.fill({ color: 0x000000, alpha: 0.5 });
      cardContainer.addChild(overlay);
      const restTxt = new Text({ text: 'REST', style: { fontSize: 12, fill: C.red, fontFamily: 'monospace' } });
      restTxt.x = 8; restTxt.y = CARD_H / 2 - 7;
      cardContainer.addChild(restTxt);
    }

    if (card.attachedTo !== null) {
      // Dim overlay: this DON is already assigned
      const dimOverlay = new Graphics();
      dimOverlay.rect(0, 0, CARD_W, CARD_H);
      dimOverlay.fill({ color: 0x000000, alpha: 0.45 });
      cardContainer.addChild(dimOverlay);
      const donTxt = new Text({ text: '↗GIVEN', style: { fontSize: 11, fill: C.white, fontFamily: 'monospace' } });
      donTxt.x = 5; donTxt.y = CARD_H / 2 - 7;
      cardContainer.addChild(donTxt);
    }

    // Counter value — shown on hand cards
    if ((card.counter ?? 0) > 0) {
      const ctrTxt = new Text({
        text: `+${card.counter}`,
        style: { fontSize: 12, fill: '#44ffcc', fontFamily: 'monospace', fontWeight: 'bold' },
      });
      ctrTxt.x = CARD_W - 40; ctrTxt.y = 4;
      cardContainer.addChild(ctrTxt);
    }
  } else {
    const qTxt = new Text({ text: '?', style: { fontSize: 24, fill: C.muted, fontFamily: 'monospace' } });
    qTxt.x = CARD_W / 2 - 6; qTxt.y = CARD_H / 2 - 13;
    cardContainer.addChild(qTxt);
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

  // Hover preview: 3-second delay, face-up cards only
  if (!faceDown) {
    cardContainer.interactive = true;
    cardContainer.on('pointerover', () => {
      clearHoverTimer();
      hoveredCardId = card.id;
      hoverTimer = setTimeout(() => {
        if (hoveredCardId === card.id) showCardPreview(card);
      }, 500);
    });
    cardContainer.on('pointerout', () => {
      if (hoveredCardId === card.id) {
        clearHoverTimer();
        hoveredCardId = null;
        hideCardPreview();
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
    const templateId = topCard.id.match(/OP\d{2}-\d{3}/)?.[0] ?? topCard.id;
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
        if (hoveredCardId === topCard.id) showCardPreview(topCard);
      }, 500);
    });
    cardContainer.on('pointerout', () => {
      if (hoveredCardId === topCard.id) {
        clearHoverTimer();
        hoveredCardId = null;
        hideCardPreview();
      }
    });
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
  blockerLocked = false, // true when a blocker is already selected/declared (counter disabled)
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
    // Highlight hand cards that can be played as counter by the defending player
    // Disabled if a blocker is already selected or declared (mutual exclusion)
    const isCounter = !faceDown
      && !blockerLocked
      && counterDefenderId !== null
      && card.ownerId === counterDefenderId
      && card.zone === 'hand'
      && (card.counter ?? 0) > 0;
    drawCard(
      scene, card,
      x + i * (CARD_W + GAP), y,
      faceDown,
      isSelected,
      isTarget,
      faceDown ? undefined : () => onCardClick(id),
      newCardIds.has(id),
      0,
      isCounter,
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
  drawSpread(scene, 'HAND', player.hand, allCards, handX, handY, handFaceDown, uiState, activePlayerId, onCardClick, newCardIds, counterDefenderId, blockerLocked);

  // DON row
  drawStack(scene, 'DON!!', player.donDeck.length, COL_DON_DECK, donY, H.donDeck);
  // COST AREA zone background + centered spread
  const costAreaW = COL_TRASH - COL_DON_AREA - 8;
  addRect(scene, COL_DON_AREA - 6, donY - 2, costAreaW, CARD_H + 4, 0x0b0d26, 0.10);
  const costCount = player.donArea.length;
  const costSpreadW = costCount > 0 ? costCount * (CARD_W + GAP) - GAP : CARD_W;
  const costX = costCount > 0 ? Math.max(COL_DON_AREA, Math.round((CANVAS_W - costSpreadW) / 2)) : COL_DON_AREA;
  drawSpread(scene, 'COST AREA', player.donArea, allCards, costX, donY, false, uiState, activePlayerId, onCardClick, newCardIds);
  const trashTopId   = player.trash[player.trash.length - 1];
  const trashTopCard = trashTopId !== undefined ? allCards[trashTopId] : undefined;
  drawStack(scene, 'TRASH', player.trash.length, COL_TRASH, donY, 0x4a4a5a, trashTopCard);

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
      drawCard(scene, lc, COL_LEADER, midY, false, isLeaderSelected, isTarget, () => onCardClick(player.leader!), false, donCount);
    }
  } else {
    addRect(scene, COL_LEADER, midY, CARD_W, CARD_H, H.empty, 0.07);
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
  // CHARACTER AREA zone background + centered cards
  const charAreaW = COL_DECK - COL_BOARD - 8;
  addRect(scene, COL_BOARD - 6, boardY - 2, charAreaW, CARD_H + 4, 0x0b0d26, 0.10);
  addText(scene, `CHARACTER AREA (${boardIds.length})`, COL_BOARD, boardY - 17, C.label);
  const boardSpreadW = boardIds.length > 0 ? boardIds.length * (CARD_W + GAP) - GAP : CARD_W;
  const boardStartX = boardIds.length > 0
    ? Math.max(COL_BOARD, Math.round((CANVAS_W - boardSpreadW) / 2))
    : COL_BOARD;
  if (boardIds.length === 0) {
    addRect(scene, boardStartX, boardY, CARD_W, CARD_H, H.empty, 0.07);
  } else {
    boardIds.forEach((id, i) => {
      const card = allCards[id];
      if (card === undefined) return;
      const isSelected = uiState.selectedCardId === id;
      const isTarget = isValidTarget(id, card, uiState, activePlayerId, allCards);
      const donCount = Object.values(allCards).filter(
        c => c.type === 'DON' && c.attachedTo === id
      ).length;
      // DoubleAttack: show x2 power only when this card is the active attacker
      const isDA = id === doubleAttackerId && (card.keywords ?? []).includes('DoubleAttack');
      drawCard(
        scene, card,
        boardStartX + i * (CARD_W + GAP), boardY,
        false, isSelected, isTarget,
        () => onCardClick(id),
        newCardIds.has(id),
        donCount,
        false, // isCounter — board cards are never counters
        isDA,
      );
    });
  }

  // Player badge
  const badge = `${isTop ? '▲' : '▼'} ${player.id}`;
  addText(scene, badge, CANVAS_W - 185, isTop ? handY + CARD_H + 4 : handY - 24, C.hudText, 16);
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

  // Redraw scene (bgLayer underneath handles the background colour/image)
  scene.removeChildren();
  // Ocean Battle separator: cyan line + glow halo
  const sep = new Graphics();
  sep.rect(0, SEP_Y - 1, CANVAS_W, 2);
  sep.fill({ color: 0x0055aa, alpha: 0.7 });
  scene.addChild(sep);
  const glow = new Graphics();
  glow.rect(0, SEP_Y - 3, CANVAS_W, 6);
  glow.fill({ color: 0x0088cc, alpha: 0.15 });
  scene.addChild(glow);

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

  renderPlayer(scene, op, state.cards, 'top',    uiState, onCardClick, newBoardIds, state.activePlayerId, counterDefenderId, hideCards, combatViewDefenderId, doubleAttackerId, myPlayerId);
  renderPlayer(scene, me, state.cards, 'bottom', uiState, onCardClick, newBoardIds, state.activePlayerId, counterDefenderId, hideCards, combatViewDefenderId, doubleAttackerId, myPlayerId);
}
