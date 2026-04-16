import { Container, Graphics, Text } from 'pixi.js';
import type { Card, CardId, GameState, PlayerState } from 'game-engine';

// ─── Layout ───────────────────────────────────────────────────────────────────

const CANVAS_W = 1200;
const CANVAS_H = 720;
const CARD_W   = 60;
const CARD_H   = 84;
const GAP      = 6;
const ROW_GAP  = 2;
const LEFT     = 16;
const SEP_Y    = CANVAS_H / 2; // 360

// ── Horizontal columns (same for both players) ───────────────────────────────
// Mid row:  LIFE | LEADER | STAGE | DECK
const COL_LIFE    = LEFT;                             // 16
const COL_LEADER  = COL_LIFE   + CARD_W + GAP;       // 82
const COL_STAGE   = COL_LEADER + CARD_W + GAP;       // 148
const COL_DECK    = COL_STAGE  + CARD_W + GAP;       // 214
// DON row: DON DECK | COST AREA | TRASH
const COL_DON_DECK = LEFT;                            // 16
const COL_DON_AREA = COL_LEADER;                      // 82  (aligns with LEADER)
const COL_TRASH    = CANVAS_W - LEFT - CARD_W;        // 1124
// Board / Hand
const COL_BOARD    = LEFT;                            // 16
const COL_HAND     = LEFT;                            // 16

// ── P2 (top): hand at top, board nearest the center line ─────────────────────
const P2_HAND_Y    = 14;                                      //  14
const P2_DON_ROW_Y = P2_HAND_Y    + CARD_H + ROW_GAP;        // 100
const P2_MID_ROW_Y = P2_DON_ROW_Y + CARD_H + ROW_GAP;        // 186
const P2_BOARD_Y   = P2_MID_ROW_Y + CARD_H + ROW_GAP;        // 272

// ── P1 (bottom): board nearest the center line, hand at bottom ───────────────
const P1_BOARD_Y   = SEP_Y + 16;                              // 376
const P1_MID_ROW_Y = P1_BOARD_Y   + CARD_H + ROW_GAP;        // 462
const P1_DON_ROW_Y = P1_MID_ROW_Y + CARD_H + ROW_GAP;        // 548
const P1_HAND_Y    = P1_DON_ROW_Y + CARD_H + ROW_GAP;        // 634

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

  const name = card.name.length > 7 ? `${card.name.slice(0, 6)}…` : card.name;
  addText(scene, name, x + 3, y + 3, C.white, 8);

  if (card.type !== 'Leader' && card.type !== 'DON') {
    addText(scene, `${card.cost}`, x + 3, y + CARD_H - 16, C.yellow, 11);
  }

  if (card.tapped) {
    addRect(scene, x, y, CARD_W, CARD_H, 0x000000, 0.5);
    addText(scene, 'REST', x + 6, y + CARD_H / 2 - 5, C.red, 9);
  }

  if (card.attachedTo !== null) {
    addText(scene, '+DON', x + 2, y + CARD_H - 28, C.purple, 8);
  }
}

// ─── Zone helpers ─────────────────────────────────────────────────────────────

/** Stack zone (deck / life / donDeck / trash) — single block with count */
function drawStack(
  scene: Container,
  label: string,
  count: number,
  x: number, y: number,
  color: number,
): void {
  addText(scene, label, x, y - 13, C.label);
  addRect(scene, x, y, CARD_W, CARD_H, count > 0 ? color : H.empty, count > 0 ? 1 : 0.4);
  const txt   = count > 0 ? `${count}` : '—';
  const tFill = count > 0 ? C.white : C.muted;
  const tSize = count > 0 ? 18 : 14;
  const tX    = x + CARD_W / 2 - (count > 9 ? 10 : 6);
  addText(scene, txt, tX, y + CARD_H / 2 - 10, tFill, tSize);
}

/** Spread zone (hand / board / donArea) — individual card rects */
function drawSpread(
  scene: Container,
  label: string,
  ids: readonly CardId[],
  allCards: Readonly<Record<CardId, Card>>,
  x: number, y: number,
  faceDown = false,
): void {
  addText(scene, `${label} (${ids.length})`, x, y - 13, C.label);

  if (ids.length === 0) {
    addRect(scene, x, y, CARD_W, CARD_H, H.empty, 0.3);
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
  const handY  = isTop ? P2_HAND_Y    : P1_HAND_Y;
  const donY   = isTop ? P2_DON_ROW_Y : P1_DON_ROW_Y;
  const midY   = isTop ? P2_MID_ROW_Y : P1_MID_ROW_Y;
  const boardY = isTop ? P2_BOARD_Y   : P1_BOARD_Y;

  // ── HAND (opponent = face-down) ─────────────────────────────────────────────
  drawSpread(scene, 'HAND', player.hand, allCards, COL_HAND, handY, isTop);

  // ── DON row: DON DECK | COST AREA | TRASH ──────────────────────────────────
  drawStack(scene, 'DON!!', player.donDeck.length, COL_DON_DECK, donY, H.donDeck);
  drawSpread(scene, 'COST', player.donArea, allCards, COL_DON_AREA, donY);
  drawStack(scene, 'TRASH', player.trash.length, COL_TRASH, donY, 0x4a4a5a);

  // ── Middle row: LIFE | LEADER | STAGE | DECK ───────────────────────────────
  drawStack(scene, 'LIFE', player.life.length, COL_LIFE, midY, H.life);

  // Leader
  addText(scene, 'LEADER', COL_LEADER, midY - 13, C.label);
  if (player.leader !== null) {
    const lc = allCards[player.leader];
    if (lc !== undefined) drawCard(scene, lc, COL_LEADER, midY);
  } else {
    addRect(scene, COL_LEADER, midY, CARD_W, CARD_H, H.empty, 0.4);
  }

  // Stage (placeholder — not yet implemented in engine)
  addText(scene, 'STAGE', COL_STAGE, midY - 13, C.label);
  addRect(scene, COL_STAGE, midY, CARD_W, CARD_H, H.stage, 0.6);

  // Deck
  drawStack(scene, 'DECK', player.deck.length, COL_DECK, midY, H.back);

  // ── CHARACTER AREA (board) ──────────────────────────────────────────────────
  drawSpread(scene, 'BOARD', player.board, allCards, COL_BOARD, boardY);

  // ── Player badge ────────────────────────────────────────────────────────────
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
