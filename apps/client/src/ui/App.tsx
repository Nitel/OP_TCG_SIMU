import { useCallback, useEffect, useRef, useState } from 'react';
import {
  applyAction,
  makeEmptyState,
  makePlayerId,
  isGameError,
} from 'game-engine';
import type { CardId, GameAction, GameState, PlayerId, StartGameAction } from 'game-engine';
import { GameCanvas } from '../pixi/GameCanvas';
import { GameUI } from './GameUI';
import { ActionPanel } from './ActionPanel';
import type { UIState } from './uiState';
import { IDLE_UI } from './uiState';
import { buildRandomDeck, buildDeckFromSaved } from '../data/deckBuilder';
import type { SavedDeck } from '../data/deckBuilder';
import { getEffectTargetScope } from '../utils/effectUtils';
import { SocketClient } from '../network/socketClient';
import { LobbyScreen } from './LobbyScreen';
import type { GameConfig } from './LobbyScreen';
import { DeckBuilder } from './DeckBuilder';

// ─── Deep-link bypass (backward-compat) ──────────────────────────────────────

const searchParams      = new URLSearchParams(window.location.search);
const DEEP_LINK_NETWORK = searchParams.get('mode') === 'network';
const DL_ROOM_ID        = searchParams.get('room') ?? 'default';
const DL_PLAYER         = (searchParams.get('player') ?? 'P1') as 'P1' | 'P2';
const SERVER_URL        = import.meta.env['VITE_SERVER_URL'] as string | undefined ?? 'http://localhost:3001';

type AppScreen = 'lobby' | 'deckBuilder' | 'game';

// ─── Bootstrap helpers ────────────────────────────────────────────────────────

function initLocalGameState(config: GameConfig): GameState {
  const p1 = makePlayerId('P1');
  const p2 = makePlayerId('P2');
  const seed = makeEmptyState(p1, p2);
  const result = applyAction(seed, {
    type: 'StartGame',
    player1: config.p1Deck !== null ? buildDeckFromSaved(p1, config.p1Deck) : buildRandomDeck(p1),
    player2: config.p2Deck !== null ? buildDeckFromSaved(p2, config.p2Deck) : buildRandomDeck(p2),
    firstPlayerId: Math.random() < 0.5 ? p1 : p2,
  });
  if (isGameError(result)) throw new Error(`StartGame failed: ${result.message}`);
  return result;
}

function buildNetworkStartAction(config: GameConfig): StartGameAction {
  const p1 = makePlayerId('P1');
  const p2 = makePlayerId('P2');
  return {
    type: 'StartGame',
    player1: config.p1Deck !== null ? buildDeckFromSaved(p1, config.p1Deck) : buildRandomDeck(p1),
    player2: config.p2Deck !== null ? buildDeckFromSaved(p2, config.p2Deck) : buildRandomDeck(p2),
    firstPlayerId: Math.random() < 0.5 ? p1 : p2,
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

export function App() {
  const [appScreen, setAppScreen] = useState<AppScreen>(DEEP_LINK_NETWORK ? 'game' : 'lobby');
  const [activeConfig, setActiveConfig] = useState<GameConfig | null>(
    DEEP_LINK_NETWORK
      ? { mode: 'network', roomId: DL_ROOM_ID, myPlayerId: DL_PLAYER, p1Deck: null, p2Deck: null }
      : null,
  );
  // Deck builder callback stored in a ref to avoid the useState-updater trap
  const dbCallbackRef = useRef<((deck: SavedDeck) => void) | null>(null);

  const isNetwork  = activeConfig !== null && activeConfig.mode === 'network';
  const myPlayerId: PlayerId = makePlayerId(activeConfig?.myPlayerId ?? 'P1');
  const roomId     = activeConfig?.roomId ?? 'default';
  const roomIdRef  = useRef(roomId);
  roomIdRef.current = roomId;

  const [gameState, setGameState]   = useState<GameState | null>(null);
  const [uiState, setUiState]       = useState<UIState>(IDLE_UI);
  const [needsHandoff, setNeedsHandoff]             = useState(false);
  const [needsCombatHandoff, setNeedsCombatHandoff] = useState(false);
  const [notification, setNotification] = useState<{ cardId: CardId; label: string } | null>(null);
  const [socketStatus, setSocketStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');

  const prevActivePlayerRef = useRef<PlayerId | undefined>(undefined);
  const socketRef           = useRef<SocketClient | null>(null);
  const prevGameStateRef    = useRef<GameState | null>(null);

  // ── Lobby → game transition ──────────────────────────────────────────────
  const handleStart = useCallback((config: GameConfig) => {
    setActiveConfig(config);
    setUiState(IDLE_UI);
    setNeedsHandoff(false);
    setNeedsCombatHandoff(false);
    setNotification(null);
    prevGameStateRef.current = null;

    if (config.mode === 'local') {
      const gs = initLocalGameState(config);
      setGameState(gs);
      setNeedsHandoff(true);
    } else {
      setGameState(null);
    }
    setAppScreen('game');
  }, []);

  // ── Network mode: connect & join room ────────────────────────────────────
  useEffect(() => {
    if (appScreen !== 'game' || !isNetwork || activeConfig === null) return;

    setSocketStatus('connecting');
    const client = new SocketClient(SERVER_URL, {
      onStateUpdate: (state) => {
        setGameState(() => { setUiState(IDLE_UI); return state; });
      },
      onError: (msg) => setUiState(u => ({ ...u, errorMessage: msg })),
      onConnect: () => setSocketStatus('connected'),
      onDisconnect: () => setSocketStatus('disconnected'),
    });
    socketRef.current = client;

    if (myPlayerId === makePlayerId('P1')) {
      client.joinRoom(roomId, myPlayerId, buildNetworkStartAction(activeConfig));
    } else {
      client.joinRoom(roomId, myPlayerId);
    }

    return () => { client.disconnect(); socketRef.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appScreen, isNetwork]);

  // ── Dispatch ─────────────────────────────────────────────────────────────
  const dispatch = useCallback((action: GameAction) => {
    // Intercept actions that play or activate a card and may need a player-chosen target.
    if (
      action.type === 'PlayCharacterFromHand' ||
      action.type === 'PlayEvent' ||
      action.type === 'ActivatedAbility'
    ) {
      if (action.chosenTargetId === undefined) {
        const card = gameState?.cards[action.cardId];
        if (card?.effects !== undefined) {
          const trigger = action.type === 'ActivatedAbility' ? 'Activated' : 'OnPlay';
          const scope = getEffectTargetScope(card.effects, trigger);
          if (scope !== null) {
            setUiState({
              selectedCardId: null,
              selectionMode: 'chooseTarget',
              errorMessage: null,
              pendingTargetAction: action,
              targetScope: scope,
            });
            return;
          }
        }
      }
    }

    if (isNetwork) {
      socketRef.current?.sendAction(roomIdRef.current, action);
      return;
    }
    setGameState(prev => {
      if (prev === null) return prev;
      const result = applyAction(prev, action);
      if (isGameError(result)) {
        setUiState(u => ({ ...u, errorMessage: result.message }));
        return prev;
      }
      if (prev.activeCombat === null && result.activeCombat !== null) setNeedsCombatHandoff(true);
      if (prev.activeCombat !== null && result.activeCombat === null) setNeedsCombatHandoff(false);
      if (result.activePlayerId !== prev.activePlayerId) {
        setNeedsHandoff(true);
        prevActivePlayerRef.current = result.activePlayerId;
      }
      setUiState(IDLE_UI);
      return result;
    });
  }, [isNetwork]);

  // ── Detect hand→trash transitions ────────────────────────────────────────
  useEffect(() => {
    if (gameState === null) return;
    const prev = prevGameStateRef.current;
    prevGameStateRef.current = gameState;
    if (prev === null) return;
    const [p1Id, p2Id] = gameState.playerOrder;
    for (const playerId of [p1Id, p2Id]) {
      if (playerId === undefined) continue;
      const prevPlayer = prev.players[playerId];
      const nextPlayer = gameState.players[playerId];
      if (prevPlayer === undefined || nextPlayer === undefined) continue;
      for (const cardId of nextPlayer.trash) {
        if (prevPlayer.trash.includes(cardId)) continue;
        if (!prevPlayer.hand.includes(cardId)) continue;
        const card = gameState.cards[cardId];
        if (card === undefined || card.type === 'DON') continue;
        const typeLabel = card.type === 'Event' ? 'Évènement' : 'Contre';
        setNotification({ cardId, label: `${String(playerId)} joue [${typeLabel}]` });
        break;
      }
    }
  }, [gameState]);

  // ── Click state machine ───────────────────────────────────────────────────
  const handleCardClick = useCallback((cardId: CardId) => {
    if (gameState === null) return;
    if (isNetwork) {
      const [p1Id, p2Id] = gameState.playerOrder;
      const defId = gameState.activePlayerId === p1Id ? p2Id : p1Id;
      const amIActive   = myPlayerId === gameState.activePlayerId;
      const amIDefender = myPlayerId === defId && gameState.activeCombat !== null;
      if (!amIActive && !amIDefender) return;
    }
    setUiState(prev => {
      const { selectedCardId, selectionMode } = prev;
      const card = gameState.cards[cardId];
      if (card === undefined) return prev;
      const activeId     = gameState.activePlayerId;
      const phase        = gameState.phase;
      const activeCombat = gameState.activeCombat;
      const [p1Id, p2Id] = gameState.playerOrder;
      const defenderId   = activeId === p1Id ? p2Id : p1Id;

      if (selectionMode === 'chooseTarget') {
        const { pendingTargetAction, targetScope } = prev;
        if (pendingTargetAction === undefined || targetScope === undefined) return IDLE_UI;
        const opponentId = activeId === p1Id ? p2Id : p1Id;
        const pool = targetScope === 'ChooseOpponentCharacter'
          ? (gameState.players[opponentId]?.board ?? [])
          : (gameState.players[activeId]?.board ?? []);
        if (pool.includes(cardId)) {
          const withTarget = { ...pendingTargetAction, chosenTargetId: cardId } as GameAction;
          setTimeout(() => dispatch(withTarget), 0);
        }
        return IDLE_UI;
      }

      if (selectedCardId !== null) {
        if (selectedCardId === cardId) return IDLE_UI;
        if (selectionMode === 'attack') {
          const opponentId = activeId === p1Id ? p2Id : p1Id;
          const opponentPlayer = gameState.players[opponentId];
          const isOpponentCard = opponentPlayer !== undefined &&
            (opponentPlayer.board.includes(cardId) || opponentPlayer.leader === cardId);
          if (isOpponentCard) {
            setTimeout(() => dispatch({ type: 'DeclareAttack', playerId: activeId, attackerId: selectedCardId, targetId: cardId }), 0);
            return IDLE_UI;
          }
          return IDLE_UI;
        }
        if (selectionMode === 'assignDon') {
          const ownPlayer = gameState.players[activeId];
          const isOwnCard = ownPlayer !== undefined &&
            (ownPlayer.board.includes(cardId) || ownPlayer.leader === cardId);
          if (isOwnCard) {
            setTimeout(() => dispatch({ type: 'AssignDon', playerId: activeId, donCardId: selectedCardId, targetCardId: cardId }), 0);
            return IDLE_UI;
          }
          return IDLE_UI;
        }
        return IDLE_UI;
      }

      if (card.zone === 'hand' && card.ownerId === activeId && phase === 'Main') {
        return { ...IDLE_UI, selectedCardId: cardId, selectionMode: 'play' };
      }
      if ((card.zone === 'board' || card.type === 'Leader') && card.ownerId === activeId && phase === 'Main' && !card.tapped && gameState.turnNumber > 2) {
        return { ...IDLE_UI, selectedCardId: cardId, selectionMode: 'attack' };
      }
      if (card.type === 'DON' && card.zone === 'donArea' && card.ownerId === activeId && (phase === 'DON' || phase === 'Main') && !card.tapped) {
        return { ...IDLE_UI, selectedCardId: cardId, selectionMode: 'assignDon' };
      }
      if (activeCombat !== null && card.ownerId === defenderId && card.zone === 'hand' && (card.counter ?? 0) > 0) {
        if (activeCombat.blockerId !== null) {
          return { ...IDLE_UI, errorMessage: 'Impossible : un bloqueur est déjà engagé dans ce combat.' };
        }
        return { ...IDLE_UI, selectedCardId: cardId, selectionMode: 'playCounter' };
      }
      if (activeCombat !== null && card.ownerId === defenderId && card.zone === 'board' && !card.tapped) {
        if (activeCombat.counterPower > 0) {
          return { ...IDLE_UI, errorMessage: 'Impossible : un contre a déjà été joué dans ce combat.' };
        }
        return { ...IDLE_UI, selectedCardId: cardId, selectionMode: 'declareBlock' };
      }
      return IDLE_UI;
    });
  }, [gameState, dispatch, isNetwork, myPlayerId]);

  // ── Screens ───────────────────────────────────────────────────────────────

  if (appScreen === 'lobby') {
    return (
      <LobbyScreen
        onStart={handleStart}
        onOpenDeckBuilder={(slot, cb) => {
          void slot; // slot is informational; the callback handles the result
          dbCallbackRef.current = cb;
          setAppScreen('deckBuilder');
        }}
      />
    );
  }

  if (appScreen === 'deckBuilder') {
    return (
      <DeckBuilder
        onSave={(deck) => {
          dbCallbackRef.current?.(deck);
          dbCallbackRef.current = null;
          setAppScreen('lobby');
        }}
        onCancel={() => {
          dbCallbackRef.current = null;
          setAppScreen('lobby');
        }}
      />
    );
  }

  // ── Game screen ───────────────────────────────────────────────────────────

  if (gameState === null) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#cccccc', fontFamily: 'monospace', gap: 12 }}>
        <span style={{ fontSize: 18 }}>ONE PIECE TCG — SIMULATOR</span>
        <span style={{
          fontSize: 13,
          color: socketStatus === 'connected' ? '#44dd88' : socketStatus === 'connecting' ? '#ffcc44' : '#ff4444',
        }}>
          {socketStatus === 'connected' ? '● Connecté — en attente du joueur adverse…' : socketStatus === 'disconnected' ? '● Impossible de joindre le serveur' : '● Connexion au serveur…'}
          {' '}({String(myPlayerId)} / salle : {roomId})
        </span>
        <span style={{ fontSize: 11, color: '#445566' }}>{SERVER_URL}</span>
      </div>
    );
  }

  const [p1Id, p2Id] = gameState.playerOrder;
  const defenderId = gameState.activePlayerId === p1Id ? p2Id : p1Id;
  const combatViewDefenderId = gameState.activeCombat !== null && !needsCombatHandoff ? defenderId : null;
  const hideCards = needsHandoff || needsCombatHandoff;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0, padding: 16, paddingBottom: 0 }}>
      <h1 style={{ color: '#cccccc', fontSize: 16, letterSpacing: 2, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
        ONE PIECE TCG — SIMULATOR{isNetwork ? ` [RÉSEAU · ${String(myPlayerId)}]` : ''}
        {isNetwork && (
          <span style={{
            fontSize: 11,
            fontWeight: 'normal',
            letterSpacing: 1,
            color: socketStatus === 'connected' ? '#44dd88' : socketStatus === 'connecting' ? '#ffcc44' : '#ff4444',
          }}>
            {socketStatus === 'connected' ? '● CONNECTÉ' : socketStatus === 'connecting' ? '● CONNEXION…' : '● DÉCONNECTÉ'}
          </span>
        )}
      </h1>
      <div style={{ position: 'relative' }}>
        <GameCanvas
          gameState={gameState}
          uiState={uiState}
          onCardClick={handleCardClick}
          hideCards={hideCards}
          combatViewDefenderId={combatViewDefenderId}
          myPlayerId={isNetwork ? myPlayerId : null}
        />
        <GameUI
          gameState={gameState}
          uiState={uiState}
          myPlayerId={isNetwork ? myPlayerId : null}
          notification={notification}
          onDismissNotification={() => setNotification(null)}
        />
      </div>
      <ActionPanel
        gameState={gameState}
        uiState={uiState}
        onAction={dispatch}
        myPlayerId={isNetwork ? myPlayerId : null}
        needsHandoff={isNetwork ? false : needsHandoff}
        onHandoffConfirmed={() => setNeedsHandoff(false)}
        needsCombatHandoff={isNetwork ? false : needsCombatHandoff}
        onCombatHandoffConfirmed={() => setNeedsCombatHandoff(false)}
      />
    </div>
  );
}
