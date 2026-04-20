import { Container, Graphics, Text, Sprite, Texture, Assets } from 'pixi.js';
import type { Card, CardId, GameState, PlayerId, PlayerState } from 'game-engine';
// combatViewDefenderId: when set, show that player's hand and hide the attacker's hand
import type { UIState } from '../ui/uiState';
import { flashLife, koFade, scaleIn } from './animations';

// ─── Layout ───────────────────────────────────────────────────────────────────

const CANVAS_W = 1600;
const CANVAS_H = 960;
const CARD_W   = 80;
const CARD_H   = 112;
const GAP      = 8;
const ROW_GAP  = 3;
const LEFT     = 20;
const SEP_Y    = CANVAS_H / 2; // 480

const COL_LIFE    = LEFT;
const COL_LEADER  = COL_LIFE   + CARD_W + GAP;
const COL_STAGE   = COL_LEADER + CARD_W + GAP;
const COL_DECK    = COL_STAGE  + CARD_W + GAP;
const COL_DON_DECK = LEFT;
const COL_DON_AREA = COL_LEADER;
const COL_TRASH    = CANVAS_W - LEFT - CARD_W;
const COL_BOARD    = LEFT;
const COL_HAND     = LEFT;

const P2_HAND_Y    = 18;
const P2_DON_ROW_Y = P2_HAND_Y    + CARD_H + ROW_GAP;
const P2_MID_ROW_Y = P2_DON_ROW_Y + CARD_H + ROW_GAP;
const P2_BOARD_Y   = P2_MID_ROW_Y + CARD_H + ROW_GAP;

const P1_BOARD_Y   = SEP_Y + 20;
const P1_MID_ROW_Y = P1_BOARD_Y   + CARD_H + ROW_GAP;
const P1_DON_ROW_Y = P1_MID_ROW_Y + CARD_H + ROW_GAP;
const P1_HAND_Y    = P1_DON_ROW_Y + CARD_H + ROW_GAP;

// ─── Palette ──────────────────────────────────────────────────────────────────

const C = {
  bg:      '#0d0d1a',
  sep:     '#2a2a4a',
  leader:  '#d4a017',
  life:    '#c0392b',
  donDeck: '#6c3483',
  donArea: '#7d3c98',
  board:   '#1a6b35',
  hand:    '#1a4a7a',
  back:    '#1c2b3a',
  empty:   '#151525',
  label:   '#666688',
  white:   '#ffffff',
  yellow:  '#ffee44',
  purple:  '#cc88ff',
  red:     '#ff6666',
  muted:   '#333344',
  stage:   '#2a3a2a',
};

const H = {
  bg:      0x0d0d1a,
  sep:     0x2a2a4a,
  leader:  0xd4a017,
  life:    0xc0392b,
  donDeck: 0x6c3483,
  donArea: 0x7d3c98,
  board:   0x1a6b35,
  hand:    0x1a4a7a,
  back:    0x1c2b3a,
  empty:   0x151525,
  stage:   0x1a2a1a,
  selected: 0xffee00,
  validTarget: 0x44ff88,
};

// ─── Card texture cache ───────────────────────────────────────────────────────

const textureCache = new Map<string, Texture>();
let rerenderCallback: (() => void) | null = null;

export function setRerenderCallback(cb: () => void): void {
  rerenderCallback = cb;
}

// ─── Card preview (hover ≥ 3 s) ──────────────────────────────────────────────

const PREVIEW_W      = 270;
const PREVIEW_H      = 378; // keeps 5:7 ratio (same as 80×112)
const PREVIEW_INFO_H = 140;
const PREVIEW_X      = CANVAS_W - PREVIEW_W - 20; // right side, away from board center
const PREVIEW_Y      = CANVAS_H / 2 - (PREVIEW_H + PREVIEW_INFO_H) / 2;

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
  const cachedTex = textureCache.get(card.id);
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
  const templateId = cardId.match(/OP\d{2}-\d{3}/)?.[0];
  if (templateId === undefined) {
    textureCache.set(cardId, Texture.EMPTY); // DON!! cards
    return;
  }
  const url1 = `/card-images/${templateId}_p1.png`;
  const url2 = `/card-images/${templateId}.png`;
  (Assets.load(url1) as Promise<Texture>)
    .catch(() => Assets.load(url2) as Promise<Texture>)
    .then((tex: Texture) => {
      textureCache.set(cardId, tex);
      rerenderCallback?.();
    })
    .catch(() => {
      textureCache.set(cardId, Texture.EMPTY);
    });
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

  // Card artwork sprite (lazy-loaded, replaces bg when available)
  if (!faceDown) {
    const cachedTex = textureCache.get(card.id);
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
    const name = card.name.length > 7 ? `${card.name.slice(0, 6)}…` : card.name;
    const nameTxt = new Text({ text: name, style: { fontSize: 11, fill: C.white, fontFamily: 'monospace' } });
    nameTxt.x = 4; nameTxt.y = 4;
    cardContainer.addChild(nameTxt);

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
      }, 1000);
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
): void {
  addText(scene, label, x, y - 17, C.label);
  addRect(scene, x, y, CARD_W, CARD_H, count > 0 ? color : H.empty, count > 0 ? 1 : 0.4);
  const txt   = count > 0 ? `${count}` : '—';
  const tFill = count > 0 ? C.white : C.muted;
  const tSize = count > 0 ? 24 : 18;
  const tX    = x + CARD_W / 2 - (count > 9 ? 13 : 8);
  addText(scene, txt, tX, y + CARD_H / 2 - 13, tFill, tSize);
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
    addRect(scene, x, y, CARD_W, CARD_H, H.empty, 0.3);
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
): void {
  const isTop    = pos === 'top';
  const isActive = player.id === activePlayerId;
  const handY    = isTop ? P2_HAND_Y    : P1_HAND_Y;
  const donY     = isTop ? P2_DON_ROW_Y : P1_DON_ROW_Y;
  const midY     = isTop ? P2_MID_ROW_Y : P1_MID_ROW_Y;
  const boardY   = isTop ? P2_BOARD_Y   : P1_BOARD_Y;

  // HAND visibility:
  // - hideCards: privacy mode (turn/combat handoff) → all hands face-down
  // - combatViewDefenderId set: defender's hand face-up, everyone else face-down
  // - normal: only active player's hand face-up
  const handFaceDown = hideCards
    || (combatViewDefenderId !== null ? player.id !== combatViewDefenderId : !isActive);
  // Counter cards are greyed out (no cyan highlight) if a blocker is selected or already declared
  const blockerLocked = uiState.selectionMode === 'declareBlock' && uiState.selectedCardId !== null;
  drawSpread(scene, 'HAND', player.hand, allCards, COL_HAND, handY, handFaceDown, uiState, activePlayerId, onCardClick, newCardIds, counterDefenderId, blockerLocked);

  // DON row
  drawStack(scene, 'DON!!', player.donDeck.length, COL_DON_DECK, donY, H.donDeck);
  drawSpread(scene, 'COST', player.donArea, allCards, COL_DON_AREA, donY, false, uiState, activePlayerId, onCardClick, newCardIds);
  drawStack(scene, 'TRASH', player.trash.length, COL_TRASH, donY, 0x4a4a5a);

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
    addRect(scene, COL_LEADER, midY, CARD_W, CARD_H, H.empty, 0.4);
  }

  // Stage (placeholder)
  addText(scene, 'STAGE', COL_STAGE, midY - 17, C.label);
  addRect(scene, COL_STAGE, midY, CARD_W, CARD_H, H.stage, 0.6);

  // Deck
  drawStack(scene, 'DECK', player.deck.length, COL_DECK, midY, H.back);

  // Board — compute DON count per card
  const boardIds = player.board;
  addText(scene, `BOARD (${boardIds.length})`, COL_BOARD, boardY - 17, C.label);
  if (boardIds.length === 0) {
    addRect(scene, COL_BOARD, boardY, CARD_W, CARD_H, H.empty, 0.3);
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
        COL_BOARD + i * (CARD_W + GAP), boardY,
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
  addText(scene, badge, CANVAS_W - 185, isTop ? handY + CARD_H + 4 : handY - 24, '#6688aa', 16);
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

  // Redraw scene
  scene.removeChildren();
  addRect(scene, 0, 0, CANVAS_W, CANVAS_H, H.bg);
  addRect(scene, 0, SEP_Y - 1, CANVAS_W, 2, H.sep);

  const [p1Id, p2Id] = state.playerOrder;
  const p1 = state.players[p1Id];
  const p2 = state.players[p2Id];
  if (p1 === undefined || p2 === undefined) return;

  // Defender ID (non-active player) — used to highlight counter-playable hand cards
  const counterDefenderId = state.activeCombat !== null
    ? (state.activePlayerId === p1Id ? p2Id : p1Id)
    : null;

  // DoubleAttack attacker: the attacker card id if it has DoubleAttack keyword
  const doubleAttackerId = (() => {
    if (state.activeCombat === null) return null;
    const { attackerId } = state.activeCombat;
    const attacker = state.cards[attackerId];
    return (attacker?.keywords ?? []).includes('DoubleAttack') ? attackerId : null;
  })();

  renderPlayer(scene, p2, state.cards, 'top',    uiState, onCardClick, newBoardIds, state.activePlayerId, counterDefenderId, hideCards, combatViewDefenderId, doubleAttackerId);
  renderPlayer(scene, p1, state.cards, 'bottom', uiState, onCardClick, newBoardIds, state.activePlayerId, counterDefenderId, hideCards, combatViewDefenderId, doubleAttackerId);
}
