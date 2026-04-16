import { useEffect, useRef, useState } from 'react';
import { Application, Container } from 'pixi.js';
import type { GameState } from 'game-engine';
import { renderGameState } from './renderGameState';

const CANVAS_W = 1200;
const CANVAS_H = 720;

interface Props {
  gameState: GameState;
}

type Status = 'idle' | 'ready' | 'error';

export function GameCanvas({ gameState }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef  = useRef<Container | null>(null);
  const appRef    = useRef<Application | null>(null);
  const [status, setStatus]     = useState<Status>('idle');
  const [initError, setInitError] = useState<string>('');

  // ── Initialize PixiJS once on mount ─────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;

    let alive = true;
    const app  = new Application();

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
        if (!alive) {
          app.destroy(false);
          return;
        }
        const scene = new Container();
        app.stage.addChild(scene);
        appRef.current  = app;
        sceneRef.current = scene;
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
        appRef.current  = null;
        sceneRef.current = null;
        setStatus('idle');
      }
    };
  }, []);

  // ── Re-render on every gameState change ──────────────────────────────────
  useEffect(() => {
    const scene = sceneRef.current;
    if (status !== 'ready' || scene === null) return;
    try {
      renderGameState(scene, gameState);
    } catch (err) {
      console.error('[GameCanvas] renderGameState threw:', err);
    }
  }, [status, gameState]);

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
