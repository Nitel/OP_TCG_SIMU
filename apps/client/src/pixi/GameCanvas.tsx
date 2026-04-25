import { useEffect, useRef, useState } from 'react';
import { Application, Container } from 'pixi.js';
import type { CardId, GameState, PlayerId } from 'game-engine';
import type { UIState } from '../ui/uiState';
import { renderGameState, setRerenderCallback, setPreviewLayer, preloadAllTextures } from './renderGameState';

const CANVAS_W = 1920;
const CANVAS_H = 1080;

interface Props {
  gameState: GameState;
  uiState: UIState;
  onCardClick: (id: CardId) => void;
  hideCards?: boolean;
  combatViewDefenderId?: PlayerId | null;
  myPlayerId?: PlayerId | null;
}

type Status = 'idle' | 'ready' | 'error';

export function GameCanvas({ gameState, uiState, onCardClick, hideCards = false, combatViewDefenderId = null, myPlayerId = null }: Props) {
  const wrapperRef  = useRef<HTMLDivElement>(null);
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const sceneRef    = useRef<Container | null>(null);
  const animRef     = useRef<Container | null>(null);
  const previewRef  = useRef<Container | null>(null);
  const appRef      = useRef<Application | null>(null);
  const [status, setStatus]       = useState<Status>('idle');
  const [initError, setInitError] = useState<string>('');
  // Initial scale based on window size to avoid overflow flash before ResizeObserver fires
  const [scale, setScale] = useState(() =>
    Math.min(window.innerWidth / CANVAS_W, window.innerHeight / CANVAS_H),
  );

  // ── Responsive scale via ResizeObserver on the wrapper ───────────────────
  useEffect(() => {
    const el = wrapperRef.current;
    if (el === null) return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry === undefined) return;
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        setScale(Math.min(width / CANVAS_W, height / CANVAS_H));
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Keep a ref to the latest render props for the texture-loaded callback
  const renderPropsRef = useRef({ gameState, uiState, onCardClick, hideCards, combatViewDefenderId, myPlayerId });
  renderPropsRef.current = { gameState, uiState, onCardClick, hideCards, combatViewDefenderId, myPlayerId };

  // ── Initialize PixiJS once on mount ─────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;

    let alive = true;
    const app = new Application();

    app
      .init({
        canvas,
        width:      CANVAS_W,
        height:     CANVAS_H,
        background: 0x0d0d1a,
        antialias:  true,
        preference: 'webgl',
      })
      .then(() => {
        if (!alive) { app.destroy(false); return; }
        const scene = new Container();
        const animLayer = new Container();
        const previewLayer = new Container();
        app.stage.addChild(scene);
        app.stage.addChild(animLayer);
        app.stage.addChild(previewLayer); // previewLayer always on top
        appRef.current    = app;
        sceneRef.current  = scene;
        animRef.current   = animLayer;
        previewRef.current = previewLayer;
        setPreviewLayer(previewLayer);
        setRerenderCallback(() => {
          const s = sceneRef.current;
          const al = animRef.current;
          if (s === null || al === null) return;
          const p = renderPropsRef.current;
          try {
            renderGameState(s, al, p.gameState, p.uiState, p.onCardClick, p.hideCards, p.combatViewDefenderId, p.myPlayerId);
          } catch (err) {
            console.error('[GameCanvas] texture rerender threw:', err);
          }
        });
        setStatus('ready');
      })
      .catch((err: unknown) => {
        console.error('[GameCanvas] PixiJS init failed:', err);
        setInitError(String(err));
        setStatus('error');
      });

    return () => {
      alive = false;
      const a = appRef.current;
      if (a !== null) {
        a.destroy(false);
        appRef.current    = null;
        sceneRef.current  = null;
        animRef.current   = null;
        previewRef.current = null;
        setStatus('idle');
      }
    };
  }, []);

  // ── Re-render on every gameState / uiState change ────────────────────────
  useEffect(() => {
    const scene = sceneRef.current;
    const animLayer = animRef.current;
    if (status !== 'ready' || scene === null || animLayer === null) return;
    // Preload only the cards present in this game state (server will filter in online mode)
    const templateIds = [...new Set(
      Object.values(gameState.cards)
        .map(c => c.id.match(/OP\d{2}-\d{3}/)?.[0])
        .filter((id): id is string => id !== undefined),
    )];
    preloadAllTextures(templateIds);
    try {
      renderGameState(scene, animLayer, gameState, uiState, onCardClick, hideCards, combatViewDefenderId, myPlayerId);
    } catch (err) {
      console.error('[GameCanvas] renderGameState threw:', err);
    }
  }, [status, gameState, uiState, onCardClick, hideCards, combatViewDefenderId, myPlayerId]);

  if (status === 'error') {
    return (
      <div ref={wrapperRef} style={{ color: '#ff6666', fontFamily: 'monospace', padding: 16 }}>
        PixiJS init error: {initError}
      </div>
    );
  }

  return (
    <div
      ref={wrapperRef}
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        background: '#0d0d1a',
      }}
    >
      <canvas
        ref={canvasRef}
        width={CANVAS_W}
        height={CANVAS_H}
        style={{
          display: 'block',
          border: '1px solid #222244',
          // CSS display size scales down; PixiJS internal resolution stays 1920×1080.
          // PixiJS interaction manager reads getBoundingClientRect() so clicks stay accurate.
          width:  `${CANVAS_W * scale}px`,
          height: `${CANVAS_H * scale}px`,
          flexShrink: 0,
        }}
      />
    </div>
  );
}
