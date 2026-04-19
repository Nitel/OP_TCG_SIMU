import { useCallback, useRef, useState } from 'react';
import {
  applyAction,
  makeEmptyState,
  makePlayerId,
  makeCardId,
  isGameError,
} from 'game-engine';
import type { Card, CardId, CardKeyword, GameAction, GameState, PlayerSetup } from 'game-engine';
import { GameCanvas } from '../pixi/GameCanvas';
import { GameUI } from './GameUI';
import { ActionPanel } from './ActionPanel';
import type { UIState } from './uiState';
import { IDLE_UI } from './uiState';

// ─── Bootstrap helpers ────────────────────────────────────────────────────────

function stubCard(id: string, ownerId: string, type: Card['type'], cost = 0, counter?: number, keywords?: readonly CardKeyword[]): Card {
  return {
    id: makeCardId(id),
    name: id,
    cost,
    power: 2000,
    color: 'Red',
    type,
    zone: 'deck',
    ownerId: makePlayerId(ownerId),
    tapped: false,
    attachedTo: null,
    ...(counter !== undefined ? { counter } : {}),
    ...(keywords !== undefined && keywords.length > 0 ? { keywords } : {}),
  };
}

function buildSetup(idStr: string): PlayerSetup {
  return {
    id: makePlayerId(idStr),
    leaderCard: stubCard(`${idStr}-leader`, idStr, 'Leader'),
    deckCards: Array.from({ length: 20 }, (_, i) => {
      const kwMap: (readonly CardKeyword[] | undefined)[] = [
        ['Rush'], ['Blocker'], ['DoubleAttack'], ['Unblockable'], undefined,
      ];
      return stubCard(
        `${idStr}-d${i}`, idStr, 'Character', (i % 5) + 1,
        i % 3 === 0 ? 2000 : i % 3 === 1 ? 1000 : undefined,
        kwMap[i % 5],
      );
    }),
    donCards: Array.from({ length: 10 }, (_, i) =>
      stubCard(`${idStr}-don${i}`, idStr, 'DON')
    ),
  };
}

function createInitialState(): GameState {
  const p1 = makePlayerId('p1');
  const p2 = makePlayerId('p2');
  const seed = makeEmptyState(p1, p2);
  const result = applyAction(seed, {
    type: 'StartGame',
    player1: buildSetup('p1'),
    player2: buildSetup('p2'),
    firstPlayerId: Math.random() < 0.5 ? p1 : p2,
  });
  if (isGameError(result)) throw new Error(`StartGame failed: ${result.message}`);
  return result;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function App() {
  const [gameState, setGameState] = useState<GameState>(createInitialState);
  const [uiState, setUiState]     = useState<UIState>(IDLE_UI);
  const [needsHandoff, setNeedsHandoff] = useState(true);
  const [needsCombatHandoff, setNeedsCombatHandoff] = useState(false);
  const prevActivePlayerRef = useRef(gameState.activePlayerId);

  // ── Dispatch: apply action, handle errors ──────────────────────────────────
  const dispatch = useCallback((action: GameAction) => {
    setGameState(prev => {
      const result = applyAction(prev, action);
      if (isGameError(result)) {
        setUiState(u => ({ ...u, errorMessage: result.message }));
        return prev;
      }
      // Detect combat start → trigger combat handoff (show defender's view)
      if (prev.activeCombat === null && result.activeCombat !== null) {
        setNeedsCombatHandoff(true);
      }
      // Detect combat end → clear combat handoff flag
      if (prev.activeCombat !== null && result.activeCombat === null) {
        setNeedsCombatHandoff(false);
      }
      // Detect turn switch → trigger hotseat handoff
      if (result.activePlayerId !== prev.activePlayerId) {
        setNeedsHandoff(true);
        prevActivePlayerRef.current = result.activePlayerId;
      }
      setUiState(IDLE_UI);
      return result;
    });
  }, []);

  // ── Click state machine ────────────────────────────────────────────────────
  const handleCardClick = useCallback((cardId: CardId) => {
    setUiState(prev => {
      const { selectedCardId, selectionMode } = prev;
      const card = gameState.cards[cardId];
      if (card === undefined) return prev;

      const activeId = gameState.activePlayerId;
      const phase = gameState.phase;
      const activeCombat = gameState.activeCombat;
      const [p1Id, p2Id] = gameState.playerOrder;
      const defenderId = activeId === p1Id ? p2Id : p1Id;

      // ── If a card is already selected ────────────────────────────────────
      if (selectedCardId !== null) {
        // Deselect if same card
        if (selectedCardId === cardId) return IDLE_UI;

        // Attack: selected attacker + click on opponent's card/leader
        if (selectionMode === 'attack') {
          const opponentId = activeId === p1Id ? p2Id : p1Id;
          const opponentPlayer = gameState.players[opponentId];
          const isOpponentCard = opponentPlayer !== undefined &&
            (opponentPlayer.board.includes(cardId) || opponentPlayer.leader === cardId);

          if (isOpponentCard) {
            // Dispatch DeclareAttack immediately
            setTimeout(() => dispatch({
              type: 'DeclareAttack',
              playerId: activeId,
              attackerId: selectedCardId,
              targetId: cardId,
            }), 0);
            return IDLE_UI;
          }
          return IDLE_UI; // clicked elsewhere → deselect
        }

        // AssignDon: selected DON + click on own board card or leader
        if (selectionMode === 'assignDon') {
          const ownPlayer = gameState.players[activeId];
          const isOwnCard = ownPlayer !== undefined &&
            (ownPlayer.board.includes(cardId) || ownPlayer.leader === cardId);

          if (isOwnCard) {
            setTimeout(() => dispatch({
              type: 'AssignDon',
              playerId: activeId,
              donCardId: selectedCardId,
              targetCardId: cardId,
            }), 0);
            return IDLE_UI;
          }
          return IDLE_UI;
        }

        // Any other mode: deselect
        return IDLE_UI;
      }

      // ── No selection yet ─────────────────────────────────────────────────

      // Hand card in Main phase → select to play
      if (card.zone === 'hand' && card.ownerId === activeId && phase === 'Main') {
        return { ...IDLE_UI, selectedCardId: cardId, selectionMode: 'play' };
      }

      // Own board card or leader in Main phase (untapped) → select to attack
      // No attacks allowed during the first two turns (turns 1 & 2 = each player's first turn)
      if ((card.zone === 'board' || card.type === 'Leader') && card.ownerId === activeId && phase === 'Main' && !card.tapped
          && gameState.turnNumber > 2) {
        return { ...IDLE_UI, selectedCardId: cardId, selectionMode: 'attack' };
      }

      // DON in donArea → select to assign (DON or Main phase)
      if (card.type === 'DON' && card.zone === 'donArea' && card.ownerId === activeId &&
          (phase === 'DON' || phase === 'Main') && !card.tapped) {
        return { ...IDLE_UI, selectedCardId: cardId, selectionMode: 'assignDon' };
      }

      // Defender clicking a hand card with counter value during combat
      // → stage the counter (requires confirmation); blocked if a blocker is already selected
      if (activeCombat !== null && card.ownerId === defenderId &&
          card.zone === 'hand' && (card.counter ?? 0) > 0) {
        // Cannot counter if a blocker is already declared (blocker.blockerId set)
        if (activeCombat.blockerId !== null) {
          return { ...IDLE_UI, errorMessage: 'Impossible : un bloqueur est déjà engagé dans ce combat.' };
        }
        return { ...IDLE_UI, selectedCardId: cardId, selectionMode: 'playCounter' };
      }

      // Defender selecting a blocker during combat
      // → blocked if a counter has already been played or staged
      if (activeCombat !== null && card.ownerId === defenderId &&
          card.zone === 'board' && !card.tapped) {
        if (activeCombat.counterPower > 0) {
          return { ...IDLE_UI, errorMessage: 'Impossible : un contre a déjà été joué dans ce combat.' };
        }
        return { ...IDLE_UI, selectedCardId: cardId, selectionMode: 'declareBlock' };
      }

      return IDLE_UI; // unknown click → reset
    });
  }, [gameState, dispatch]);

  // ── Derive defender ID for combat view ────────────────────────────────────
  const [p1Id, p2Id] = gameState.playerOrder;
  const defenderId = gameState.activePlayerId === p1Id ? p2Id : p1Id;
  // After combat handoff confirmed, show the defender's hand until combat resolves
  const combatViewDefenderId = gameState.activeCombat !== null && !needsCombatHandoff
    ? defenderId
    : null;
  // Hide all cards during any handoff (turn or combat)
  const hideCards = needsHandoff || needsCombatHandoff;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0, padding: 16, paddingBottom: 0 }}>
      <h1 style={{ color: '#cccccc', fontSize: 16, letterSpacing: 2, marginBottom: 12 }}>
        ONE PIECE TCG — SIMULATOR
      </h1>
      <div style={{ position: 'relative' }}>
        <GameCanvas
          gameState={gameState}
          uiState={uiState}
          onCardClick={handleCardClick}
          hideCards={hideCards}
          combatViewDefenderId={combatViewDefenderId}
        />
        <GameUI gameState={gameState} uiState={uiState} />
      </div>
      <ActionPanel
        gameState={gameState}
        uiState={uiState}
        onAction={dispatch}
        needsHandoff={needsHandoff}
        onHandoffConfirmed={() => setNeedsHandoff(false)}
        needsCombatHandoff={needsCombatHandoff}
        onCombatHandoffConfirmed={() => setNeedsCombatHandoff(false)}
      />
    </div>
  );
}
