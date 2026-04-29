import { useCallback, useEffect, useRef, useState } from 'react';
import {
  applyAction,
  makeEmptyState,
  makePlayerId,
  isGameError,
  greedyBotDecide,
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
import type { ActivityEntry } from './ActivityLog';

// ─── Action → human-readable description ─────────────────────────────────────

function describeAction(
  action: GameAction,
  state: GameState,
  humanId: PlayerId | null,
  vsBot: boolean,
): string | null {
  const playerId = 'playerId' in action ? action.playerId : null;
  const isHuman = humanId === null || playerId === humanId;
  const actor   = isHuman ? 'Vous' : vsBot ? 'IA' : 'Adversaire';
  switch (action.type) {
    case 'PlayCharacterFromHand':
    case 'PlayEvent': {
      const card = state.cards[action.cardId];
      if (card === undefined) return null;
      const verb = action.type === 'PlayEvent' ? "joue l'évènement" : 'joue';
      return `${actor} ${verb} ${card.name}`;
    }
    case 'DeclareAttack': {
      const attacker = state.cards[action.attackerId];
      const target   = state.cards[action.targetId];
      if (attacker === undefined || target === undefined) return null;
      return `${actor} attaque ${target.name} avec ${attacker.name}`;
    }
    case 'DeclareBlock': {
      const card = state.cards[action.blockerId];
      if (card === undefined) return null;
      return `${actor} bloque avec ${card.name}`;
    }
    case 'PlayCounter': {
      const card = state.cards[action.cardId];
      if (card === undefined) return null;
      return `${actor} contre avec ${card.name}${card.counter != null ? ` (+${card.counter})` : ''}`;
    }
    case 'EndPhase':
      return state.phase === 'Main' ? `${actor} termine son tour` : null;
    default:
      return null;
  }
}

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
    player2: buildRandomDeck(p2),
    firstPlayerId: Math.random() < 0.5 ? p1 : p2,
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

export function App() {
  const [appScreen, setAppScreen] = useState<AppScreen>(DEEP_LINK_NETWORK ? 'game' : 'lobby');
  const [activeConfig, setActiveConfig] = useState<GameConfig | null>(
    DEEP_LINK_NETWORK
      ? { mode: 'network', roomId: DL_ROOM_ID, myPlayerId: DL_PLAYER, isCreating: false, p1Deck: null, p2Deck: null }
      : null,
  );
  // Deck builder callback stored in a ref to avoid the useState-updater trap
  const dbCallbackRef = useRef<((deck: SavedDeck) => void) | null>(null);

  const isNetwork  = activeConfig !== null && activeConfig.mode === 'network';
  const [myPlayerId, setMyPlayerId] = useState<PlayerId>(makePlayerId('P1'));
  const roomId     = activeConfig?.roomId ?? 'default';
  const roomIdRef  = useRef(roomId);
  roomIdRef.current = roomId;

  const [gameState, setGameState]   = useState<GameState | null>(null);
  const [uiState, setUiState]       = useState<UIState>(IDLE_UI);
  const [needsHandoff, setNeedsHandoff]             = useState(false);
  const [needsCombatHandoff, setNeedsCombatHandoff] = useState(false);
  const [notification, setNotification]   = useState<{ cardId: CardId; label: string } | null>(null);
  const [activityLog, setActivityLog]     = useState<ActivityEntry[]>([]);
  const activitySeqRef                    = useRef(0);
  const [socketStatus, setSocketStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [opponentDisconnected, setOpponentDisconnected] = useState<{ deadline: number } | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(0);

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
    setActivityLog([]);
    setOpponentDisconnected(null);
    prevGameStateRef.current = null;

    if (config.mode === 'local' || config.isCreating) {
      setMyPlayerId(makePlayerId('P1'));
    }
    // For network JOIN: myPlayerId will be set by onRoomJoined when server responds

    if (config.mode === 'local') {
      const gs = initLocalGameState(config);
      setGameState(gs);
      setNeedsHandoff(true);
    } else if (config.mode === 'vsBot') {
      const gs = initLocalGameState(config);
      setGameState(gs);
      setNeedsHandoff(false); // human is always P1 — no device pass needed
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
      onRoomJoined: (state, assignedPlayerId) => {
        setMyPlayerId(assignedPlayerId);
        setGameState(() => { setUiState(IDLE_UI); return state; });
      },
      onStateUpdate: (state) => {
        setGameState(() => { setUiState(IDLE_UI); return state; });
      },
      onError: (msg) => setUiState(u => ({ ...u, errorMessage: msg })),
      onConnect: () => setSocketStatus('connected'),
      onDisconnect: () => setSocketStatus('disconnected'),
      onPlayerDisconnected: (info) => {
        setOpponentDisconnected({ deadline: info.reconnectDeadline });
      },
      onPlayerReconnected: (_info) => {
        setOpponentDisconnected(null);
      },
    });
    socketRef.current = client;

    if (activeConfig.isCreating) {
      client.joinRoom(roomId, buildNetworkStartAction(activeConfig));
    } else {
      client.joinRoom(roomId);
    }

    return () => { client.disconnect(); socketRef.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appScreen, isNetwork]);

  // ── Opponent disconnect countdown ────────────────────────────────────────
  useEffect(() => {
    if (opponentDisconnected === null) return;
    const id = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((opponentDisconnected.deadline - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining === 0) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [opponentDisconnected]);

  const isVsBot = activeConfig?.mode === 'vsBot';
  const BOT_ID  = makePlayerId('P2');

  // ── Dispatch ─────────────────────────────────────────────────────────────
  const dispatch = useCallback((action: GameAction) => {
    // Compute log description before state mutation (cards still in original zones)
    const humanId  = isVsBot ? makePlayerId('P1') : isNetwork ? myPlayerId : null;
    const logText  = gameState !== null ? describeAction(action, gameState, humanId, isVsBot) : null;
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

    // Pre-validate before setGameState so we know synchronously whether the action succeeds.
    // (actionOk inside setGameState updater is unreliable in React 18 — updaters are deferred.)
    const preCheck = gameState !== null ? applyAction(gameState, action) : null;
    const willSucceed = preCheck !== null && !isGameError(preCheck);

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
    if (willSucceed && logText !== null) {
      const id = ++activitySeqRef.current;
      setActivityLog(prev => [...prev.slice(-19), { id, text: logText }]);
    }
    if (isNetwork) {
      socketRef.current?.sendAction(roomIdRef.current, action);
    }
  }, [isNetwork, isVsBot, myPlayerId, gameState]);

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

  // ── Greedy bot (vsBot mode) ───────────────────────────────────────────────

  useEffect(() => {
    if (!isVsBot || gameState === null || gameState.winner !== null) return;

    const { activePlayerId, activeCombat } = gameState;
    // Don't auto-resolve when bot is attacker — human must click "Ne pas bloquer" first
    const isBotTurn     = activePlayerId === BOT_ID && activeCombat === null;
    const isBotDefender = activeCombat !== null
      && activePlayerId !== BOT_ID
      && gameState.cards[activeCombat.targetId]?.ownerId === BOT_ID;

    if (!isBotTurn && !isBotDefender) return;

    const action = greedyBotDecide(gameState, BOT_ID);
    if (action === null) return;

    // Faster for trivial phase transitions, slower for strategic decisions
    const trivial = action.type === 'EndPhase' || action.type === 'DrawPhase' || action.type === 'Mulligan';
    const delay   = trivial ? 350 : 750;

    const timer = setTimeout(() => dispatch(action), delay);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState, isVsBot]);

  // ── Auto-advance DON!! phase for human (assign DON during Main instead) ──
  useEffect(() => {
    if (gameState === null || gameState.phase !== 'DON' || isNetwork) return;
    const humanId = isVsBot ? makePlayerId('P1') : null;
    if (humanId !== null && gameState.activePlayerId !== humanId) return;
    dispatch({ type: 'EndPhase', playerId: gameState.activePlayerId });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState, isVsBot, isNetwork]);

  // ── Click state machine ───────────────────────────────────────────────────
  const handleCardClick = useCallback((cardId: CardId) => {
    if (gameState === null) return;
    if (isNetwork || isVsBot) {
      const humanId = isVsBot ? makePlayerId('P1') : myPlayerId;
      const [p1Id, p2Id] = gameState.playerOrder;
      const defId = gameState.activePlayerId === p1Id ? p2Id : p1Id;
      const amIActive   = humanId === gameState.activePlayerId;
      const amIDefender = humanId === defId && gameState.activeCombat !== null;
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

  // ── Drag & drop handler ───────────────────────────────────────────────────
  const handleDragDrop = useCallback((draggedId: CardId, targetId: CardId | null) => {
    if (gameState === null) return;
    const card     = gameState.cards[draggedId];
    if (card === undefined) return;
    const activeId = gameState.activePlayerId;

    if (card.type === 'DON' && targetId !== null) {
      dispatch({ type: 'AssignDon', playerId: activeId, donCardId: draggedId, targetCardId: targetId });
    } else if (card.zone === 'hand' && gameState.phase === 'Main' && card.ownerId === activeId) {
      if (card.type === 'Event') {
        dispatch({ type: 'PlayEvent', playerId: activeId, cardId: draggedId });
      } else if (card.type === 'Character' || card.type === 'Stage') {
        dispatch({ type: 'PlayCharacterFromHand', playerId: activeId, cardId: draggedId });
      }
    }
  }, [gameState, dispatch]);

  // ── Screens ───────────────────────────────────────────────────────────────

  if (appScreen === 'lobby') {
    return (
      <LobbyScreen
        onStart={handleStart}
        serverUrl={SERVER_URL}
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
        {uiState.errorMessage !== null && (
          <span style={{ fontSize: 13, color: '#ff6655', maxWidth: 400, textAlign: 'center' }}>
            {uiState.errorMessage}
          </span>
        )}
      </div>
    );
  }

  const [p1Id, p2Id] = gameState.playerOrder;
  const defenderId = gameState.activePlayerId === p1Id ? p2Id : p1Id;
  const combatViewDefenderId = gameState.activeCombat !== null && !needsCombatHandoff ? defenderId : null;
  const hideCards = needsHandoff || needsCombatHandoff;

  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', background: '#0d0d1a' }}>
      {/* Canvas area: fills all available space above the action panel */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', minHeight: 0 }}>
        <GameCanvas
          gameState={gameState}
          uiState={uiState}
          onCardClick={handleCardClick}
          onDragDrop={handleDragDrop}
          hideCards={hideCards}
          combatViewDefenderId={combatViewDefenderId}
          myPlayerId={isNetwork ? myPlayerId : isVsBot ? makePlayerId('P1') : null}
          activityLog={activityLog}
        />

        {/* ── Hotseat handoff overlay — plateau visible en dessous ────────── */}
        {!isNetwork && !isVsBot && needsHandoff && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 40,
            background: 'rgba(0,6,20,0.82)',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 20,
            fontFamily: 'monospace',
          }}>
            <div style={{ fontSize: 13, color: '#6688aa', letterSpacing: 2, textTransform: 'uppercase' }}>
              Passez le clavier
            </div>
            <div style={{ fontSize: 26, fontWeight: 'bold', color: '#ffffff', letterSpacing: 3 }}>
              Tour de {gameState.activePlayerId}
            </div>
            <button
              style={{
                marginTop: 8,
                padding: '12px 36px',
                fontFamily: 'monospace', fontSize: 15, fontWeight: 'bold',
                border: '1px solid #44aa66', borderRadius: 6,
                cursor: 'pointer', background: '#0a3a1a', color: '#88ffaa',
                letterSpacing: 1,
              }}
              onClick={() => setNeedsHandoff(false)}
            >
              C'est parti, {gameState.activePlayerId} !
            </button>
          </div>
        )}

        {/* ── Combat handoff overlay ────────────────────────────────────── */}
        {!isNetwork && !isVsBot && needsCombatHandoff && (() => {
          const defenderId = gameState.activePlayerId === p1Id ? p2Id : p1Id;
          return (
            <div style={{
              position: 'absolute', inset: 0, zIndex: 40,
              background: 'rgba(20,0,0,0.82)',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 20,
              fontFamily: 'monospace',
            }}>
              <div style={{ fontSize: 13, color: '#aa6666', letterSpacing: 2, textTransform: 'uppercase' }}>
                Attaque déclarée — passez le clavier
              </div>
              <div style={{ fontSize: 26, fontWeight: 'bold', color: '#ffffff', letterSpacing: 3 }}>
                {defenderId}
              </div>
              <div style={{ fontSize: 13, color: '#ffaaaa' }}>
                Vous pouvez contrer ou bloquer
              </div>
              <button
                style={{
                  marginTop: 8,
                  padding: '12px 36px',
                  fontFamily: 'monospace', fontSize: 15, fontWeight: 'bold',
                  border: '1px solid #aa4444', borderRadius: 6,
                  cursor: 'pointer', background: '#3a0a0a', color: '#ffcccc',
                  letterSpacing: 1,
                }}
                onClick={() => setNeedsCombatHandoff(false)}
              >
                Je suis prêt, {defenderId} !
              </button>
            </div>
          );
        })()}

        {/* ── Opponent disconnect overlay ──────────────────────────────── */}
        {opponentDisconnected !== null && (
          <div style={{
            position: 'absolute', inset: 0,
            background: 'rgba(0,0,0,0.6)', zIndex: 50,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 12,
            fontFamily: 'monospace',
          }}>
            <div style={{ fontSize: 20, color: '#ffcc44', fontWeight: 'bold' }}>
              Adversaire déconnecté
            </div>
            <div style={{ fontSize: 14, color: '#aabbcc' }}>
              {timeLeft > 0
                ? `Reconnexion possible dans ${timeLeft}s`
                : 'Temps écoulé — en attente du résultat…'}
            </div>
          </div>
        )}

        <GameUI
          gameState={gameState}
          uiState={uiState}
          myPlayerId={isNetwork ? myPlayerId : isVsBot ? makePlayerId('P1') : null}
          notification={notification}
          onDismissNotification={() => setNotification(null)}
        />
      </div>

      {/* ── Action panel — sous le canvas, ne couvre jamais les cartes ───── */}
      <ActionPanel
        gameState={gameState}
        uiState={uiState}
        onAction={dispatch}
        myPlayerId={isNetwork ? myPlayerId : isVsBot ? makePlayerId('P1') : null}
      />
    </div>
  );
}
