import { useEffect, useRef, useState } from 'react';
import { Application, Container } from 'pixi.js';
import type { CardId, GameState } from 'game-engine';
import type { UIState } from '../ui/uiState';
import { renderGameState } from './renderGameState';

const CANVAS_W = 1200;
const CANVAS_H = 720;

interface Props {
  gameState: GameState;
  uiState: UIState;
  onCardClick: (id: CardId) => void;
}

type Status = 'idle' | 'ready' | 'error';

export function GameCanvas({ gameState, uiState, onCardClick }: Props) {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const sceneRef   = useRef<Container | null>(null);
  const animRef    = useRef<Container | null>(null);
  const appRef     = useRef<Application | null>(null);
  const [status, setStatus]       = useState<Status>('idle');
  const [initError, setInitError] = useState<string>('');

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
        app.stage.addChild(scene);
        app.stage.addChild(animLayer); // animLayer on top
        appRef.current   = app;
        sceneRef.current = scene;
        animRef.current  = animLayer;
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
        appRef.current   = null;
        sceneRef.current = null;
        animRef.current  = null;
        setStatus('idle');
      }
    };
  }, []);

  // ── Re-render on every gameState / uiState change ────────────────────────
  useEffect(() => {
    const scene = sceneRef.current;
    const animLayer = animRef.current;
    if (status !== 'ready' || scene === null || animLayer === null) return;
    try {
      renderGameState(scene, animLayer, gameState, uiState, onCardClick);
    } catch (err) {
      console.error('[GameCanvas] renderGameState threw:', err);
    }
  }, [status, gameState, uiState, onCardClick]);

  if (status === 'error') {
    return (
      <div style={{ color: '#ff6666', fontFamily: 'monospace', padding: 16 }}>
        PixiJS init error: {initError}
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      width={CANVAS_W}
      height={CANVAS_H}
      style={{ display: 'block', border: '1px solid #222244' }}
    />
  );
}
