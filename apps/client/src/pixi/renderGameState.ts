import { Container, Graphics, Text } from 'pixi.js';
import type { Card, CardId, GameState, PlayerId, PlayerState } from 'game-engine';
// combatViewDefenderId: when set, show that player's hand and hide the attacker's hand
import type { UIState } from '../ui/uiState';
import { flashLife, koFade, scaleIn } from './animations';

// ─── Layout ───────────────────────────────────────────────────────────────────

const CANVAS_W = 1200;
const CANVAS_H = 720;
const CARD_W   = 60;
const CARD_H   = 84;
const GAP      = 6;
const ROW_GAP  = 2;
const LEFT     = 16;
const SEP_Y    = CANVAS_H / 2; // 360

const COL_LIFE    = LEFT;
const COL_LEADER  = COL_LIFE   + CARD_W + GAP;
const COL_STAGE   = COL_LEADER + CARD_W + GAP;
const COL_DECK    = COL_STAGE  + CARD_W + GAP;
const COL_DON_DECK = LEFT;
const COL_DON_AREA = COL_LEADER;
const COL_TRASH    = CANVAS_W - LEFT - CARD_W;
const COL_BOARD    = LEFT;
const COL_HAND     = LEFT;

const P2_HAND_Y    = 14;
const P2_DON_ROW_Y = P2_HAND_Y    + CARD_H + ROW_GAP;
const P2_MID_ROW_Y = P2_DON_ROW_Y + CARD_H + ROW_GAP;
const P2_BOARD_Y   = P2_MID_ROW_Y + CARD_H + ROW_GAP;

const P1_BOARD_Y   = SEP_Y + 16;
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

  if (!faceDown) {
    const name = card.name.length > 7 ? `${card.name.slice(0, 6)}…` : card.name;
    const nameTxt = new Text({ text: name, style: { fontSize: 8, fill: C.white, fontFamily: 'monospace' } });
    nameTxt.x = 3; nameTxt.y = 3;
    cardContainer.addChild(nameTxt);

    if (card.type !== 'Leader' && card.type !== 'DON') {
      const costTxt = new Text({ text: `${card.cost}`, style: { fontSize: 11, fill: C.yellow, fontFamily: 'monospace' } });
      costTxt.x = 3; costTxt.y = CARD_H - 16;
      cardContainer.addChild(costTxt);
    }

    // Total power (base + DON boost) — bottom right for Leader and Character
    if (card.type === 'Leader' || card.type === 'Character') {
      const totalPower = card.power + attachedDonCount * 1000;
      const boosted = attachedDonCount > 0;
      const powerFill = boosted ? C.yellow : C.purple;
      const powerTxt = new Text({
        text: `${totalPower}`,
        style: { fontSize: 10, fill: powerFill, fontFamily: 'monospace', fontWeight: boosted ? 'bold' : 'normal' },
      });
      powerTxt.x = CARD_W - 32; powerTxt.y = CARD_H - 16;
      cardContainer.addChild(powerTxt);
    }

    if (card.tapped) {
      const overlay = new Graphics();
      overlay.rect(0, 0, CARD_W, CARD_H);
      overlay.fill({ color: 0x000000, alpha: 0.5 });
      cardContainer.addChild(overlay);
      const restTxt = new Text({ text: 'REST', style: { fontSize: 9, fill: C.red, fontFamily: 'monospace' } });
      restTxt.x = 6; restTxt.y = CARD_H / 2 - 5;
      cardContainer.addChild(restTxt);
    }

    if (card.attachedTo !== null) {
      // Dim overlay: this DON is already assigned
      const dimOverlay = new Graphics();
      dimOverlay.rect(0, 0, CARD_W, CARD_H);
      dimOverlay.fill({ color: 0x000000, alpha: 0.45 });
      cardContainer.addChild(dimOverlay);
      const donTxt = new Text({ text: '↗GIVEN', style: { fontSize: 8, fill: C.white, fontFamily: 'monospace' } });
      donTxt.x = 4; donTxt.y = CARD_H / 2 - 5;
      cardContainer.addChild(donTxt);
    }

    // Counter value — shown on hand cards
    if ((card.counter ?? 0) > 0) {
      const ctrTxt = new Text({
        text: `+${card.counter}`,
        style: { fontSize: 9, fill: '#44ffcc', fontFamily: 'monospace', fontWeight: 'bold' },
      });
      ctrTxt.x = CARD_W - 30; ctrTxt.y = 3;
      cardContainer.addChild(ctrTxt);
    }
  } else {
    const qTxt = new Text({ text: '?', style: { fontSize: 18, fill: C.muted, fontFamily: 'monospace' } });
    qTxt.x = CARD_W / 2 - 4; qTxt.y = CARD_H / 2 - 10;
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
  addText(scene, label, x, y - 13, C.label);
  addRect(scene, x, y, CARD_W, CARD_H, count > 0 ? color : H.empty, count > 0 ? 1 : 0.4);
  const txt   = count > 0 ? `${count}` : '—';
  const tFill = count > 0 ? C.white : C.muted;
  const tSize = count > 0 ? 18 : 14;
  const tX    = x + CARD_W / 2 - (count > 9 ? 10 : 6);
  addText(scene, txt, tX, y + CARD_H / 2 - 10, tFill, tSize);
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
): void {
  addText(scene, `${label} (${ids.length})`, x, y - 13, C.label);

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
    const isCounter = !faceDown
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
  drawSpread(scene, 'HAND', player.hand, allCards, COL_HAND, handY, handFaceDown, uiState, activePlayerId, onCardClick, newCardIds, counterDefenderId);

  // DON row
  drawStack(scene, 'DON!!', player.donDeck.length, COL_DON_DECK, donY, H.donDeck);
  drawSpread(scene, 'COST', player.donArea, allCards, COL_DON_AREA, donY, false, uiState, activePlayerId, onCardClick, newCardIds);
  drawStack(scene, 'TRASH', player.trash.length, COL_TRASH, donY, 0x4a4a5a);

  // Middle row: LIFE | LEADER | STAGE | DECK
  drawStack(scene, 'LIFE', player.life.length, COL_LIFE, midY, H.life);

  // Leader (clickable as attack / DON-assign target)
  addText(scene, 'LEADER', COL_LEADER, midY - 13, C.label);
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
  addText(scene, 'STAGE', COL_STAGE, midY - 13, C.label);
  addRect(scene, COL_STAGE, midY, CARD_W, CARD_H, H.stage, 0.6);

  // Deck
  drawStack(scene, 'DECK', player.deck.length, COL_DECK, midY, H.back);

  // Board — compute DON count per card
  const boardIds = player.board;
  addText(scene, `BOARD (${boardIds.length})`, COL_BOARD, boardY - 13, C.label);
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
      drawCard(
        scene, card,
        COL_BOARD + i * (CARD_W + GAP), boardY,
        false, isSelected, isTarget,
        () => onCardClick(id),
        newCardIds.has(id),
        donCount,
      );
    });
  }

  // Player badge
  const badge = `${isTop ? '▲' : '▼'} ${player.id}`;
  addText(scene, badge, CANVAS_W - 140, isTop ? handY + CARD_H + 4 : handY - 18, '#6688aa', 12);
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

  renderPlayer(scene, p2, state.cards, 'top',    uiState, onCardClick, newBoardIds, state.activePlayerId, counterDefenderId, hideCards, combatViewDefenderId);
  renderPlayer(scene, p1, state.cards, 'bottom', uiState, onCardClick, newBoardIds, state.activePlayerId, counterDefenderId, hideCards, combatViewDefenderId);
}
