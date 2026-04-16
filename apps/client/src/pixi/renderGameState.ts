import { Container, Graphics, Text } from 'pixi.js';
import type { Card, CardId, GameState, PlayerState } from 'game-engine';

// ─── Layout ───────────────────────────────────────────────────────────────────

const CANVAS_W = 1200;
const CANVAS_H = 720;
const CARD_W   = 60;
const CARD_H   = 84;
const GAP      = 6;
const LEFT     = 16;
const SEP_Y    = CANVAS_H / 2; // 360

// P2 (top)
const P2_ZONE_Y  = 14;
const P2_BOARD_Y = P2_ZONE_Y  + CARD_H + 22;
const P2_HAND_Y  = P2_BOARD_Y + CARD_H + 22;

// P1 (bottom)
const P1_HAND_Y  = SEP_Y + 14;
const P1_BOARD_Y = P1_HAND_Y  + CARD_H + 22;
const P1_ZONE_Y  = P1_BOARD_Y + CARD_H + 22;

// ─── Palette (string colors — required by PixiJS 8 TextStyle) ────────────────

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
};

// Hex equivalents for Graphics.fill() (pixi accepts both, but be explicit)
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
};

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
  size = 10,
): void {
  const t = new Text({
    text: txt,
    style: { fontSize: size, fill, fontFamily: 'monospace' },
  });
  t.x = x;
  t.y = y;
  scene.addChild(t);
}

// ─── Card rendering ───────────────────────────────────────────────────────────

function cardBodyColor(card: Card): number {
  if (card.type === 'Leader') return H.leader;
  if (card.type === 'DON')    return H.donArea;
  if (card.zone === 'board')  return H.board;
  if (card.zone === 'hand')   return H.hand;
  return 0x333344;
}

function drawCard(scene: Container, card: Card, x: number, y: number, faceDown = false): void {
  const fillColor = faceDown ? H.back : cardBodyColor(card);
  addRect(scene, x, y, CARD_W, CARD_H, fillColor);

  if (faceDown) {
    addText(scene, '?', x + CARD_W / 2 - 4, y + CARD_H / 2 - 10, C.muted, 18);
    return;
  }

  // Card name
  const name = card.name.length > 7 ? `${card.name.slice(0, 6)}…` : card.name;
  addText(scene, name, x + 3, y + 3, C.white, 8);

  // Cost (not for Leader/DON)
  if (card.type !== 'Leader' && card.type !== 'DON') {
    addText(scene, `${card.cost}`, x + 3, y + CARD_H - 16, C.yellow, 11);
  }

  // Tapped overlay
  if (card.tapped) {
    addRect(scene, x, y, CARD_W, CARD_H, 0x000000, 0.5);
    addText(scene, 'REST', x + 6, y + CARD_H / 2 - 5, C.red, 9);
  }

  // Attached DON marker
  if (card.attachedTo !== null) {
    addText(scene, '+DON', x + 2, y + CARD_H - 28, C.purple, 8);
  }
}

// ─── Zone rendering ───────────────────────────────────────────────────────────

/** Stack zone: deck, life, donDeck, trash — shows count in a single block */
function drawStack(
  scene: Container,
  zoneName: string,
  count: number,
  x: number, y: number,
  color: number,
): void {
  addText(scene, zoneName, x, y - 13, C.label);
  addRect(scene, x, y, CARD_W, CARD_H, count > 0 ? color : H.empty, count > 0 ? 1 : 0.5);
  const txt   = count > 0 ? `${count}` : '—';
  const tFill = count > 0 ? C.white : C.muted;
  const tSize = count > 0 ? 18 : 14;
  const tX    = x + CARD_W / 2 - (count > 9 ? 10 : 6);
  addText(scene, txt, tX, y + CARD_H / 2 - 10, tFill, tSize);
}

/** Spread zone: hand, board, donArea — shows individual card rects */
function drawSpread(
  scene: Container,
  zoneName: string,
  ids: readonly CardId[],
  allCards: Readonly<Record<CardId, Card>>,
  x: number, y: number,
  faceDown = false,
): void {
  addText(scene, `${zoneName} (${ids.length})`, x, y - 13, C.label);

  if (ids.length === 0) {
    addRect(scene, x, y, CARD_W, CARD_H, H.empty, 0.5);
    return;
  }

  ids.forEach((id, i) => {
    const card = allCards[id];
    if (card === undefined) return;
    drawCard(scene, card, x + i * (CARD_W + GAP), y, faceDown);
  });
}

// ─── Player rendering ─────────────────────────────────────────────────────────

function renderPlayer(
  scene: Container,
  player: PlayerState,
  allCards: Readonly<Record<CardId, Card>>,
  pos: 'top' | 'bottom',
): void {
  const isTop  = pos === 'top';
  const zoneY  = isTop ? P2_ZONE_Y  : P1_ZONE_Y;
  const boardY = isTop ? P2_BOARD_Y : P1_BOARD_Y;
  const handY  = isTop ? P2_HAND_Y  : P1_HAND_Y;

  // Zone row
  let zx = LEFT;

  if (player.leader !== null) {
    addText(scene, 'LEADER', zx, zoneY - 13, C.label);
    const lc = allCards[player.leader];
    if (lc !== undefined) drawCard(scene, lc, zx, zoneY);
    zx += CARD_W + GAP * 4;
  }

  drawStack(scene, 'LIFE',     player.life.length,    zx, zoneY, H.life);
  zx += CARD_W + GAP * 3;
  drawStack(scene, 'DON DECK', player.donDeck.length,  zx, zoneY, H.donDeck);
  zx += CARD_W + GAP * 3;
  drawSpread(scene, 'DON',     player.donArea, allCards, zx, zoneY);
  zx += Math.max(1, player.donArea.length) * (CARD_W + GAP) + GAP * 3;
  drawStack(scene, 'TRASH',    player.trash.length,    zx, zoneY, 0x4a4a5a);

  // Board
  drawSpread(scene, 'BOARD', player.board, allCards, LEFT, boardY);

  // Hand (opponent = face down)
  drawSpread(scene, 'HAND', player.hand, allCards, LEFT, handY, isTop);

  // Player badge
  const badge = `${isTop ? '▲' : '▼'} ${player.id}`;
  addText(scene, badge, CANVAS_W - 140, isTop ? handY + CARD_H + 4 : handY - 18, '#6688aa', 12);
}

// ─── HUD ─────────────────────────────────────────────────────────────────────

function renderHUD(scene: Container, state: GameState): void {
  const txt = `Turn ${state.turnNumber}   Phase: ${state.phase}   Active: ${state.activePlayerId}`;
  const t = new Text({
    text: txt,
    style: { fontSize: 13, fill: C.white, fontFamily: 'monospace' },
  });
  t.x = CANVAS_W / 2 - 160;
  t.y = SEP_Y - 11;
  scene.addChild(t);
}

// ─── Public entry point ───────────────────────────────────────────────────────

export function renderGameState(scene: Container, state: GameState): void {
  scene.removeChildren();

  // Background + separator
  addRect(scene, 0, 0, CANVAS_W, CANVAS_H, H.bg);
  addRect(scene, 0, SEP_Y - 1, CANVAS_W, 2, H.sep);

  const [p1Id, p2Id] = state.playerOrder;
  const p1 = state.players[p1Id];
  const p2 = state.players[p2Id];
  if (p1 === undefined || p2 === undefined) return;

  renderPlayer(scene, p2, state.cards, 'top');
  renderPlayer(scene, p1, state.cards, 'bottom');
  renderHUD(scene, state);
}
