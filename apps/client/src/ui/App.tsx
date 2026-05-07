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
import { PLAY_ZONE_ID } from '../pixi/renderGameState';
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
    // Intercept Activated abilities that need a player-chosen target (client-side, pre-dispatch).
    // OnPlay effects are now handled engine-side via pendingTargetInteraction.
    if (action.type === 'ActivatedAbility') {
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

      // Detect counter/event cards played from hand → trash
      for (const cardId of nextPlayer.trash) {
        if (prevPlayer.trash.includes(cardId)) continue;
        if (!prevPlayer.hand.includes(cardId)) continue;
        const card = gameState.cards[cardId];
        if (card === undefined || card.type === 'DON') continue;
        const typeLabel = card.type === 'Event' ? 'Évènement' : 'Contre';
        setNotification({ cardId, label: `${String(playerId)} joue [${typeLabel}]` });
        break;
      }

      // Detect OnKO → PlaySelf: card moved from trash back to board
      for (const cardId of nextPlayer.board) {
        if (prevPlayer.board.includes(cardId)) continue; // was already on board
        const prevCard = prev.cards[cardId];
        if (prevCard?.zone !== 'trash') continue; // didn't come from trash
        const card = gameState.cards[cardId];
        if (card === undefined) continue;
        const id = ++activitySeqRef.current;
        setActivityLog(prevLog => [
          ...prevLog.slice(-19),
          { id, text: `✦ ${card.name} revient sur le board (effet OnKO)` },
        ]);
      }
    }
  }, [gameState]);

  // ── Detect pendingTargetInteraction — show chooseTarget UI for human player ──
  useEffect(() => {
    if (gameState === null) return;
    const pending = gameState.pendingTargetInteraction;
    const humanId = isVsBot ? makePlayerId('P1') : isNetwork ? myPlayerId : null;

    if (pending !== null && (humanId === null || pending.playerId === humanId)) {
      setUiState({
        selectedCardId: null,
        selectionMode: 'chooseTarget',
        errorMessage: null,
        targetScope: pending.scope,
      });
    } else if (pending === null) {
      setUiState((prev) => prev.selectionMode === 'chooseTarget' && prev.pendingTargetAction === undefined ? IDLE_UI : prev);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState?.pendingTargetInteraction]);

  // ── Detect pendingOnKOInteraction — show resolveOnKO UI for human player ──
  useEffect(() => {
    if (gameState === null) return;
    const pending = gameState.pendingOnKOInteraction;
    const humanId = isVsBot ? makePlayerId('P1') : isNetwork ? myPlayerId : null;

    if (pending !== null && (humanId === null || pending.playerId === humanId)) {
      setUiState({
        selectedCardId: null,
        selectionMode: 'resolveOnKO',
        errorMessage: null,
        onKOInteraction: { filter: pending.filter, sourceCardId: pending.sourceCardId },
      });
    } else if (pending === null) {
      setUiState((prev) => prev.selectionMode === 'resolveOnKO' ? IDLE_UI : prev);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState?.pendingOnKOInteraction]);

  // ── Detect pendingRevealInteraction — show revealFromHand UI for human player ──
  useEffect(() => {
    if (gameState === null) return;
    const pending = gameState.pendingRevealInteraction;
    const humanId = isVsBot ? makePlayerId('P1') : isNetwork ? myPlayerId : null;

    if (pending !== null && (humanId === null || pending.playerId === humanId)) {
      setUiState((prev) => ({
        ...prev,
        selectionMode: 'revealFromHand',
        revealInteraction: {
          filter: pending.filter,
          count: pending.count,
          sourceCardId: pending.sourceCardId,
          selectedCardIds: [],
        },
      }));
    } else if (pending === null) {
      setUiState((prev) => prev.selectionMode === 'revealFromHand' ? IDLE_UI : prev);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState?.pendingRevealInteraction]);

  // ── Detect pendingTrashInteraction — show trashFromHand UI for human player ──
  useEffect(() => {
    if (gameState === null) return;
    const pending = gameState.pendingTrashInteraction;
    const humanId = isVsBot ? makePlayerId('P1') : isNetwork ? myPlayerId : null;

    if (pending !== null && (humanId === null || pending.playerId === humanId)) {
      setUiState((prev) => ({
        ...prev,
        selectionMode: 'trashFromHand',
        trashInteraction: {
          filter: pending.filter,
          sourceCardId: pending.sourceCardId,
          selectedCardIds: [],
        },
      }));
    } else if (pending === null) {
      setUiState((prev) => prev.selectionMode === 'trashFromHand' ? IDLE_UI : prev);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState?.pendingTrashInteraction]);

  // ── Detect pendingSearchInteraction — show searchDeck UI for human player ──
  useEffect(() => {
    if (gameState === null) return;
    const pending = gameState.pendingSearchInteraction;
    const humanId = isVsBot ? makePlayerId('P1') : isNetwork ? myPlayerId : null;

    if (pending !== null && (humanId === null || pending.playerId === humanId)) {
      setUiState((prev) => ({
        ...prev,
        selectionMode: 'searchDeck',
        searchInteraction: {
          revealedCardIds: pending.revealedCardIds,
          filter: pending.filter,
          destination: pending.destination,
        },
      }));
    } else if (pending === null) {
      setUiState((prev) => prev.selectionMode === 'searchDeck' ? IDLE_UI : prev);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState?.pendingSearchInteraction]);

  // ── Detect pendingForceDiscardInteraction — show discard UI for human, auto for bot ──
  useEffect(() => {
    if (gameState === null) return;
    const pending = gameState.pendingForceDiscardInteraction;
    const humanId = isVsBot ? makePlayerId('P1') : isNetwork ? myPlayerId : null;

    if (pending !== null && (humanId === null || pending.playerId === humanId)) {
      setUiState((prev) => ({
        ...prev,
        selectionMode: 'forceDiscard',
        forceDiscardInteraction: { count: pending.count, playerId: pending.playerId, selectedCardIds: [] },
      }));
    } else if (pending === null) {
      setUiState((prev) => prev.selectionMode === 'forceDiscard' ? IDLE_UI : prev);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState?.pendingForceDiscardInteraction]);

  // ── Detect pendingForcedAttack — auto-select the forced attacker for the human ──
  useEffect(() => {
    if (gameState === null) return;
    const forced = gameState.pendingForcedAttack;
    if (forced !== null) {
      setUiState((prev) => ({
        ...prev,
        selectionMode: 'attack',
        selectedCardId: forced.attackerCardId,
        forcedAttackerId: forced.attackerCardId,
      }));
    } else {
      setUiState((prev) => prev.forcedAttackerId !== undefined ? { ...IDLE_UI } : prev);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState?.pendingForcedAttack]);

  // ── Greedy bot (vsBot mode) ───────────────────────────────────────────────

  useEffect(() => {
    if (!isVsBot || gameState === null || gameState.winner !== null) return;

    const { activePlayerId, activeCombat } = gameState;
    // Don't auto-resolve when bot is attacker — human must click "Ne pas bloquer" first
    const isBotTurn     = activePlayerId === BOT_ID && activeCombat === null;
    const isBotDefender = activeCombat !== null
      && activePlayerId !== BOT_ID
      && gameState.cards[activeCombat.targetId]?.ownerId === BOT_ID;
    const isBotPendingTarget      = gameState.pendingTargetInteraction?.playerId      === BOT_ID;
    const isBotPendingOnKO        = gameState.pendingOnKOInteraction?.playerId        === BOT_ID;
    const isBotPendingReveal      = gameState.pendingRevealInteraction?.playerId      === BOT_ID;
    const isBotPendingTrash       = gameState.pendingTrashInteraction?.playerId       === BOT_ID;
    const isBotPendingSearch      = gameState.pendingSearchInteraction?.playerId      === BOT_ID;
    const isBotPendingForceDiscard = gameState.pendingForceDiscardInteraction?.playerId === BOT_ID;
    const isBotForcedAttack       = gameState.pendingForcedAttack?.ownerId            === BOT_ID;

    if (!isBotTurn && !isBotDefender && !isBotPendingTarget && !isBotPendingOnKO && !isBotPendingReveal && !isBotPendingTrash && !isBotPendingSearch && !isBotPendingForceDiscard && !isBotForcedAttack) return;

    const action = greedyBotDecide(gameState, BOT_ID);
    if (action === null) return;

    // Faster for trivial phase transitions, slower for strategic decisions
    const trivial = action.type === 'EndPhase' || action.type === 'DrawPhase' || action.type === 'Mulligan';
    const delay   = trivial ? 350 : 750;

    const timer = setTimeout(() => dispatch(action), delay);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState, isVsBot]);

  // ── Auto-advance transient phases (DON, End, Draw) ──────────────────────────
  // Merged into a single effect to avoid cascading re-renders (flickering).
  useEffect(() => {
    if (gameState === null) return;

    // Network: dispatch individually so the socket receives each action
    if (isNetwork) {
      const phase = gameState.phase;
      if (phase !== 'End' && phase !== 'Draw') return;
      if (myPlayerId !== null && gameState.activePlayerId !== myPlayerId) return;
      dispatch(phase === 'Draw'
        ? { type: 'DrawPhase', playerId: gameState.activePlayerId }
        : { type: 'EndPhase', playerId: gameState.activePlayerId });
      return;
    }

    // Local / vsBot: cascade all transient phases in one synchronous pass → one setGameState
    const humanId = isVsBot ? makePlayerId('P1') : null;
    const isAutoPhase = (s: GameState) =>
      s.phase === 'DON' || s.phase === 'End' || s.phase === 'Draw';

    let current = gameState;
    let advanced = false;
    while (isAutoPhase(current)) {
      if (humanId !== null && current.activePlayerId !== humanId) break;
      const action = current.phase === 'Draw'
        ? { type: 'DrawPhase' as const, playerId: current.activePlayerId }
        : { type: 'EndPhase' as const, playerId: current.activePlayerId };
      const next = applyAction(current, action);
      if (isGameError(next)) break;
      current = next;
      advanced = true;
    }
    if (!advanced) return;

    const playerChanged = current.activePlayerId !== gameState.activePlayerId;
    setGameState(prev => (prev !== gameState ? prev : current));
    if (playerChanged) {
      setNeedsHandoff(true);
      prevActivePlayerRef.current = current.activePlayerId;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState, isVsBot, isNetwork, myPlayerId]);

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

      if (selectionMode === 'resolveOnKO') {
        const { onKOInteraction } = prev;
        if (onKOInteraction === undefined) return IDLE_UI;
        if (card.zone !== 'hand') return prev; // must click a hand card
        const f = onKOInteraction.filter;
        const valid =
          (f.color === undefined || card.color === f.color) &&
          (f.cardType === undefined || card.type === f.cardType) &&
          (f.maxPower === undefined || card.power <= f.maxPower) &&
          (f.excludeSelf !== true || cardId !== onKOInteraction.sourceCardId);
        if (valid) {
          const humanId = isVsBot ? makePlayerId('P1') : myPlayerId ?? activeId;
          setTimeout(() => dispatch({ type: 'ResolveOnKOInteraction', playerId: humanId, cardId }), 0);
        }
        return IDLE_UI;
      }

      if (selectionMode === 'chooseTarget') {
        const { pendingTargetAction, targetScope } = prev;
        if (targetScope === undefined) return IDLE_UI;
        const opponentId = activeId === p1Id ? p2Id : p1Id;
        const isOpponentScope = targetScope === 'ChooseOpponentCharacter' || targetScope === 'ChooseOpponentCharacterOrLeader';
        const isOrLeader = targetScope === 'ChooseOwnCharacterOrLeader' || targetScope === 'ChooseOpponentCharacterOrLeader';
        const targetPlayerId = isOpponentScope ? opponentId : activeId;
        const targetPlayer = gameState.players[targetPlayerId];
        const pool = [
          ...(targetPlayer?.board ?? []),
          ...(isOrLeader && targetPlayer?.leader != null ? [targetPlayer.leader] : []),
        ];
        if (pool.includes(cardId)) {
          const humanId = isVsBot ? makePlayerId('P1') : myPlayerId ?? activeId;
          if (pendingTargetAction !== undefined) {
            // Client-side intercept: re-dispatch the stored action with chosenTargetId
            const withTarget = { ...pendingTargetAction, chosenTargetId: cardId } as GameAction;
            setTimeout(() => dispatch(withTarget), 0);
          } else {
            // Engine-side pending: dispatch ResolveTargetInteraction
            setTimeout(() => dispatch({ type: 'ResolveTargetInteraction', playerId: humanId, targetCardId: cardId }), 0);
          }
        }
        return IDLE_UI;
      }

      if (selectionMode === 'revealFromHand') {
        const { revealInteraction } = prev;
        if (revealInteraction === undefined) return IDLE_UI;
        if (card.zone !== 'hand') return prev;
        const f = revealInteraction.filter;
        const valid =
          (f.color === undefined || card.color === f.color) &&
          (f.cardType === undefined || card.type === f.cardType) &&
          (f.maxPower === undefined || card.power <= f.maxPower) &&
          (f.excludeSelf !== true || cardId !== revealInteraction.sourceCardId);
        if (!valid) return prev;
        // Toggle card selection
        const alreadySelected = revealInteraction.selectedCardIds.includes(cardId);
        const newSelected = alreadySelected
          ? revealInteraction.selectedCardIds.filter((id) => id !== cardId)
          : [...revealInteraction.selectedCardIds, cardId];
        // Auto-confirm when count reached
        if (!alreadySelected && newSelected.length === revealInteraction.count) {
          const humanId = isVsBot ? makePlayerId('P1') : myPlayerId ?? activeId;
          setTimeout(() => dispatch({ type: 'ResolveRevealInteraction', playerId: humanId, revealedCardIds: newSelected }), 0);
          return IDLE_UI;
        }
        return { ...prev, revealInteraction: { ...revealInteraction, selectedCardIds: newSelected } };
      }

      if (selectionMode === 'trashFromHand') {
        const { trashInteraction } = prev;
        if (trashInteraction === undefined) return IDLE_UI;
        if (card.zone !== 'hand') return prev;
        const f = trashInteraction.filter;
        const typeOk =
          f.cardType  !== undefined ? card.type === f.cardType :
          f.cardTypes !== undefined ? (f.cardTypes as string[]).includes(card.type) :
          true;
        const valid =
          typeOk &&
          (f.color    === undefined || card.color === f.color) &&
          (f.maxPower === undefined || card.power <= f.maxPower) &&
          (f.excludeSelf !== true   || cardId !== trashInteraction.sourceCardId);
        if (!valid) return prev;
        // Toggle card selection
        const alreadySelected = trashInteraction.selectedCardIds.includes(cardId);
        const newSelected = alreadySelected
          ? trashInteraction.selectedCardIds.filter((id) => id !== cardId)
          : [...trashInteraction.selectedCardIds, cardId];
        return { ...prev, trashInteraction: { ...trashInteraction, selectedCardIds: newSelected } };
      }

      if (selectionMode === 'forceDiscard') {
        const { forceDiscardInteraction } = prev;
        if (forceDiscardInteraction === undefined) return IDLE_UI;
        if (card.zone !== 'hand' || card.ownerId !== forceDiscardInteraction.playerId) return prev;
        // Toggle selection (capped at required count)
        const alreadySelected = forceDiscardInteraction.selectedCardIds.includes(cardId);
        const newSelected = alreadySelected
          ? forceDiscardInteraction.selectedCardIds.filter((id) => id !== cardId)
          : forceDiscardInteraction.selectedCardIds.length < forceDiscardInteraction.count
            ? [...forceDiscardInteraction.selectedCardIds, cardId]
            : forceDiscardInteraction.selectedCardIds; // cap reached
        return { ...prev, forceDiscardInteraction: { ...forceDiscardInteraction, selectedCardIds: newSelected } };
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

    if (card.type === 'DON' && targetId !== null && targetId !== PLAY_ZONE_ID) {
      dispatch({ type: 'AssignDon', playerId: activeId, donCardId: draggedId, targetCardId: targetId });
    } else if (card.zone === 'hand' && targetId === PLAY_ZONE_ID && gameState.phase === 'Main' && card.ownerId === activeId) {
      if (card.type === 'Event') {
        dispatch({ type: 'PlayEvent', playerId: activeId, cardId: draggedId });
      } else if (card.type === 'Character' || card.type === 'Stage') {
        dispatch({ type: 'PlayCharacterFromHand', playerId: activeId, cardId: draggedId });
      }
    }
    // targetId === null → card released outside valid zone, drag cancelled
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

        {/* ── Reveal-from-hand overlay ────────────────────────────────────── */}
        {uiState.selectionMode === 'revealFromHand' && uiState.revealInteraction !== undefined && (() => {
          const ri = uiState.revealInteraction;
          const humanId = isVsBot ? makePlayerId('P1') : myPlayerId ?? gameState.activePlayerId;
          const playerHand = gameState.players[humanId]?.hand ?? [];
          const validCards = playerHand
            .map((id) => gameState.cards[id])
            .filter((c): c is NonNullable<typeof c> => {
              if (c === undefined) return false;
              const f = ri.filter;
              return (
                (f.color === undefined || c.color === f.color) &&
                (f.cardType === undefined || c.type === f.cardType) &&
                (f.maxPower === undefined || c.power <= f.maxPower) &&
                (f.excludeSelf !== true || c.id !== ri.sourceCardId)
              );
            });
          const CDN_BASE: string = (import.meta.env.VITE_CDN_BASE_URL as string | undefined) ?? '';
          return (
            <div style={{
              position: 'absolute', inset: 0, zIndex: 460,
              background: 'rgba(0,0,0,0.82)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              pointerEvents: 'auto',
            }}>
              <div style={{
                background: 'rgba(4,8,24,0.97)',
                border: '1px solid rgba(85,187,255,0.55)',
                borderRadius: 10,
                padding: 20,
                maxWidth: '80vw',
                boxShadow: '0 8px 40px rgba(0,0,0,0.8)',
                display: 'flex', flexDirection: 'column', gap: 16,
              }}>
                <div style={{ fontFamily: 'monospace', fontSize: 13, color: '#55bbff', textAlign: 'center', letterSpacing: 1 }}>
                  Révélez {ri.count} carte{ri.count > 1 ? 's' : ''}
                  {ri.filter.color !== undefined ? ` [${ri.filter.color}]` : ''} de votre main
                </div>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${Math.min(validCards.length, 7)}, 86px)`,
                  gap: 8,
                  justifyContent: 'center',
                }}>
                  {validCards.map((card) => {
                    const templateId = card.id.match(/[A-Z]{2,3}\d{2}-\d{3}/)?.[0];
                    const imgUrl = templateId !== undefined ? `${CDN_BASE}/card-images/${templateId}.png` : null;
                    const isSelected = ri.selectedCardIds.includes(card.id);
                    return (
                      <div
                        key={card.id}
                        onClick={() => handleCardClick(card.id)}
                        style={{
                          width: 86, height: 120, borderRadius: 4, overflow: 'hidden',
                          cursor: 'pointer', flexShrink: 0,
                          border: isSelected ? '2px solid #55bbff' : '1px solid rgba(85,187,255,0.25)',
                          boxShadow: isSelected ? '0 0 8px rgba(85,187,255,0.6)' : 'none',
                          transition: 'border-color 0.1s, box-shadow 0.1s',
                        }}
                      >
                        {imgUrl !== null ? (
                          <img src={imgUrl} alt={card.name} style={{ width: '100%', height: '100%', display: 'block', objectFit: 'cover' }} />
                        ) : (
                          <div style={{ width: '100%', height: '100%', background: '#1a1a3a', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 4, boxSizing: 'border-box' }}>
                            <span style={{ color: '#aaa', fontFamily: 'monospace', fontSize: 9, textAlign: 'center' }}>{card.name}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {validCards.length === 0 && (
                    <div style={{ color: '#aaaacc', fontFamily: 'monospace', fontSize: 12, gridColumn: '1/-1', textAlign: 'center' }}>
                      Aucune carte valide en main
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
                  <span style={{ color: '#aaaacc', fontFamily: 'monospace', fontSize: 12 }}>
                    {ri.selectedCardIds.length}/{ri.count} sélectionnée{ri.count > 1 ? 's' : ''}
                  </span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => dispatch({ type: 'ResolveRevealInteraction', playerId: humanId, revealedCardIds: [] })}
                      style={{
                        padding: '6px 16px', fontFamily: 'monospace', fontSize: 12,
                        border: '1px solid rgba(170,170,204,0.4)', borderRadius: 4,
                        cursor: 'pointer', background: '#1a1a3a', color: '#aaaacc',
                      }}
                    >
                      Passer
                    </button>
                    {ri.selectedCardIds.length === ri.count && (
                      <button
                        onClick={() => dispatch({ type: 'ResolveRevealInteraction', playerId: humanId, revealedCardIds: ri.selectedCardIds })}
                        style={{
                          padding: '6px 16px', fontFamily: 'monospace', fontSize: 12,
                          border: '1px solid #55bbff', borderRadius: 4,
                          cursor: 'pointer', background: '#0a1a3a', color: '#55bbff',
                          fontWeight: 'bold',
                        }}
                      >
                        Révéler
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ── Trash-from-hand overlay ─────────────────────────────────────── */}
        {uiState.selectionMode === 'trashFromHand' && uiState.trashInteraction !== undefined && (() => {
          const ti = uiState.trashInteraction;
          const humanId = isVsBot ? makePlayerId('P1') : myPlayerId ?? gameState.activePlayerId;
          const playerHand = gameState.players[humanId]?.hand ?? [];
          const validCards = playerHand
            .map((id) => gameState.cards[id])
            .filter((c): c is NonNullable<typeof c> => {
              if (c === undefined) return false;
              const f = ti.filter;
              const typeOk =
                f.cardType  !== undefined ? c.type === f.cardType :
                f.cardTypes !== undefined ? (f.cardTypes as string[]).includes(c.type) :
                true;
              return (
                typeOk &&
                (f.color    === undefined || c.color === f.color) &&
                (f.maxPower === undefined || c.power <= f.maxPower) &&
                (f.excludeSelf !== true   || c.id !== ti.sourceCardId)
              );
            });
          const CDN_BASE_: string = (import.meta.env.VITE_CDN_BASE_URL as string | undefined) ?? '';
          const typeLabel = ti.filter.cardTypes !== undefined
            ? ti.filter.cardTypes.join('/') : (ti.filter.cardType ?? 'carte');
          return (
            <div style={{
              position: 'absolute', inset: 0, zIndex: 460,
              background: 'rgba(0,0,0,0.82)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              pointerEvents: 'auto',
            }}>
              <div style={{
                background: 'rgba(4,8,24,0.97)',
                border: '1px solid rgba(255,140,0,0.55)',
                borderRadius: 10,
                padding: 20,
                maxWidth: '80vw',
                boxShadow: '0 8px 40px rgba(0,0,0,0.8)',
                display: 'flex', flexDirection: 'column', gap: 16,
              }}>
                <div style={{ fontFamily: 'monospace', fontSize: 13, color: '#ff8c00', textAlign: 'center', letterSpacing: 1 }}>
                  Défaussez des cartes [{typeLabel}] de votre main (+1000 force/carte)
                </div>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${Math.min(Math.max(validCards.length, 1), 7)}, 86px)`,
                  gap: 8,
                  justifyContent: 'center',
                }}>
                  {validCards.map((card) => {
                    const templateId = card.id.match(/[A-Z]{2,3}\d{2}-\d{3}/)?.[0];
                    const imgUrl = templateId !== undefined ? `${CDN_BASE_}/card-images/${templateId}.png` : null;
                    const isSelected = ti.selectedCardIds.includes(card.id);
                    return (
                      <div
                        key={card.id}
                        onClick={() => handleCardClick(card.id)}
                        style={{
                          width: 86, height: 120, borderRadius: 4, overflow: 'hidden',
                          cursor: 'pointer', flexShrink: 0,
                          border: isSelected ? '2px solid #ff8c00' : '1px solid rgba(255,140,0,0.25)',
                          boxShadow: isSelected ? '0 0 8px rgba(255,140,0,0.6)' : 'none',
                          transition: 'border-color 0.1s, box-shadow 0.1s',
                        }}
                      >
                        {imgUrl !== null ? (
                          <img src={imgUrl} alt={card.name} style={{ width: '100%', height: '100%', display: 'block', objectFit: 'cover' }} />
                        ) : (
                          <div style={{ width: '100%', height: '100%', background: '#1a1a3a', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 4, boxSizing: 'border-box' }}>
                            <span style={{ color: '#aaa', fontFamily: 'monospace', fontSize: 9, textAlign: 'center' }}>{card.name}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {validCards.length === 0 && (
                    <div style={{ color: '#aaaacc', fontFamily: 'monospace', fontSize: 12, gridColumn: '1/-1', textAlign: 'center' }}>
                      Aucune carte éligible en main
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
                  <span style={{ color: '#aaaacc', fontFamily: 'monospace', fontSize: 12 }}>
                    {ti.selectedCardIds.length} carte{ti.selectedCardIds.length !== 1 ? 's' : ''} sélectionnée{ti.selectedCardIds.length !== 1 ? 's' : ''}
                  </span>
                  <button
                    onClick={() => dispatch({ type: 'ResolveTrashInteraction', playerId: humanId, trashedCardIds: ti.selectedCardIds })}
                    style={{
                      padding: '6px 20px', fontFamily: 'monospace', fontSize: 12,
                      border: '1px solid #ff8c00', borderRadius: 4,
                      cursor: 'pointer', background: '#1a0a00', color: '#ff8c00',
                      fontWeight: 'bold',
                    }}
                  >
                    {ti.selectedCardIds.length === 0 ? 'Passer (0 carte)' : `Défausser (${ti.selectedCardIds.length})`}
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ── Force-discard overlay ───────────────────────────────────────── */}
        {uiState.selectionMode === 'forceDiscard' && uiState.forceDiscardInteraction !== undefined && (() => {
          const fdi = uiState.forceDiscardInteraction;
          const playerHand = gameState.players[fdi.playerId]?.hand ?? [];
          const handCards = playerHand
            .map((id) => gameState.cards[id])
            .filter((c): c is NonNullable<typeof c> => c !== undefined);
          const CDN_BASE_FD: string = (import.meta.env.VITE_CDN_BASE_URL as string | undefined) ?? '';
          return (
            <div style={{
              position: 'absolute', inset: 0, zIndex: 460,
              background: 'rgba(0,0,0,0.82)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              pointerEvents: 'auto',
            }}>
              <div style={{
                background: 'rgba(24,4,4,0.97)',
                border: '1px solid rgba(255,60,60,0.55)',
                borderRadius: 10,
                padding: 20,
                maxWidth: '80vw',
                boxShadow: '0 8px 40px rgba(0,0,0,0.8)',
                display: 'flex', flexDirection: 'column', gap: 16,
              }}>
                <div style={{ fontFamily: 'monospace', fontSize: 13, color: '#ff4444', textAlign: 'center', letterSpacing: 1 }}>
                  {String(fdi.playerId)} : défaussez {fdi.count} carte{fdi.count > 1 ? 's' : ''} de votre main
                </div>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${Math.min(Math.max(handCards.length, 1), 7)}, 86px)`,
                  gap: 8,
                  justifyContent: 'center',
                }}>
                  {handCards.map((card) => {
                    const templateId = card.id.match(/[A-Z]{2,3}\d{2}-\d{3}/)?.[0];
                    const imgUrl = templateId !== undefined ? `${CDN_BASE_FD}/card-images/${templateId}.png` : null;
                    const isSelected = fdi.selectedCardIds.includes(card.id);
                    return (
                      <div
                        key={card.id}
                        onClick={() => handleCardClick(card.id)}
                        style={{
                          width: 86, height: 120, borderRadius: 4, overflow: 'hidden',
                          cursor: 'pointer', flexShrink: 0,
                          border: isSelected ? '2px solid #ff4444' : '1px solid rgba(255,60,60,0.25)',
                          boxShadow: isSelected ? '0 0 8px rgba(255,60,60,0.6)' : 'none',
                          transition: 'border-color 0.1s, box-shadow 0.1s',
                        }}
                      >
                        {imgUrl !== null ? (
                          <img src={imgUrl} alt={card.name} style={{ width: '100%', height: '100%', display: 'block', objectFit: 'cover' }} />
                        ) : (
                          <div style={{ width: '100%', height: '100%', background: '#2a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 4, boxSizing: 'border-box' }}>
                            <span style={{ color: '#aaa', fontFamily: 'monospace', fontSize: 9, textAlign: 'center' }}>{card.name}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
                  <span style={{ color: '#ffaaaa', fontFamily: 'monospace', fontSize: 12 }}>
                    {fdi.selectedCardIds.length}/{fdi.count} sélectionnée{fdi.count > 1 ? 's' : ''}
                  </span>
                  <button
                    disabled={fdi.selectedCardIds.length !== fdi.count}
                    onClick={() => dispatch({ type: 'ResolveForceDiscardInteraction', playerId: fdi.playerId, discardedCardIds: fdi.selectedCardIds })}
                    style={{
                      padding: '6px 20px', fontFamily: 'monospace', fontSize: 12,
                      border: `1px solid ${fdi.selectedCardIds.length === fdi.count ? '#ff4444' : 'rgba(255,60,60,0.3)'}`,
                      borderRadius: 4,
                      cursor: fdi.selectedCardIds.length === fdi.count ? 'pointer' : 'default',
                      background: '#2a0a0a', color: fdi.selectedCardIds.length === fdi.count ? '#ff4444' : '#884444',
                      fontWeight: 'bold',
                      opacity: fdi.selectedCardIds.length === fdi.count ? 1 : 0.5,
                    }}
                  >
                    Défausser ({fdi.selectedCardIds.length}/{fdi.count})
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ── Search-deck overlay ─────────────────────────────────────────── */}
        {uiState.selectionMode === 'searchDeck' && uiState.searchInteraction !== undefined && (() => {
          const si = uiState.searchInteraction;
          const humanId = isVsBot ? makePlayerId('P1') : myPlayerId ?? gameState.activePlayerId;
          const revealedCards = si.revealedCardIds
            .map((id) => gameState.cards[id])
            .filter((c): c is NonNullable<typeof c> => c !== undefined);
          const CDN_BASE_: string = (import.meta.env.VITE_CDN_BASE_URL as string | undefined) ?? '';
          const matchCard = (c: { id: string; type: string; cost: number; name: string }) => {
            switch (si.filter.kind) {
              case 'Any': return true;
              case 'ByType': return c.type === si.filter.cardType;
              case 'ByCost': return c.cost <= si.filter.maxCost;
              case 'ByName': return c.name === si.filter.name;
            }
          };
          return (
            <div style={{
              position: 'absolute', inset: 0, zIndex: 470,
              background: 'rgba(0,0,0,0.85)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              pointerEvents: 'auto',
            }}>
              <div style={{
                background: 'rgba(4,8,24,0.97)',
                border: '1px solid rgba(100,200,255,0.5)',
                borderRadius: 10, padding: 20,
                maxWidth: '85vw',
                boxShadow: '0 8px 40px rgba(0,0,0,0.8)',
                display: 'flex', flexDirection: 'column', gap: 16,
              }}>
                <div style={{ fontFamily: 'monospace', fontSize: 13, color: '#44ddff', textAlign: 'center', letterSpacing: 1 }}>
                  Choisissez 1 carte parmi les {revealedCards.length} premières de votre deck (ou passez)
                </div>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${Math.min(Math.max(revealedCards.length, 1), 7)}, 86px)`,
                  gap: 8, justifyContent: 'center',
                }}>
                  {revealedCards.map((card) => {
                    const tplId = card.id.match(/[A-Z]{2,3}\d{2}-\d{3}/)?.[0];
                    const imgUrl = tplId !== undefined ? `${CDN_BASE_}/card-images/${tplId}.png` : null;
                    const isValid = matchCard(card as { id: string; type: string; cost: number; name: string });
                    return (
                      <div
                        key={card.id}
                        onClick={() => isValid && dispatch({ type: 'ResolveSearchInteraction', playerId: humanId, chosenCardId: card.id })}
                        style={{
                          width: 86, height: 120, borderRadius: 4, overflow: 'hidden',
                          cursor: isValid ? 'pointer' : 'default',
                          border: isValid ? '2px solid #44ddff' : '1px solid rgba(100,200,255,0.2)',
                          opacity: isValid ? 1 : 0.4,
                          boxShadow: isValid ? '0 0 8px rgba(68,221,255,0.5)' : 'none',
                          transition: 'box-shadow 0.1s',
                        }}
                      >
                        {imgUrl !== null ? (
                          <img src={imgUrl} alt={card.name} style={{ width: '100%', height: '100%', display: 'block', objectFit: 'cover' }} />
                        ) : (
                          <div style={{ width: '100%', height: '100%', background: '#0a1a2a', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 4, boxSizing: 'border-box' }}>
                            <span style={{ color: '#aaa', fontFamily: 'monospace', fontSize: 9, textAlign: 'center' }}>{card.name}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => dispatch({ type: 'ResolveSearchInteraction', playerId: humanId, chosenCardId: null })}
                    style={{
                      padding: '6px 20px', fontFamily: 'monospace', fontSize: 12,
                      border: '1px solid #44ddff', borderRadius: 4,
                      cursor: 'pointer', background: '#001a24', color: '#44ddff', fontWeight: 'bold',
                    }}
                  >
                    Passer
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

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
          onReturnToMenu={() => setAppScreen('lobby')}
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
