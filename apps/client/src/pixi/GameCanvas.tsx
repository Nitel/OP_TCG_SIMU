import { useEffect, useRef, useState } from 'react';
import { Application, Container } from 'pixi.js';
import type { Card, CardId, GameState, PlayerId } from 'game-engine';
import type { UIState } from '../ui/uiState';
import { renderGameState, setRerenderCallback, setCardHoverCallback, setTrashClickCallback, preloadAllTextures, setupBgLayer, setupDragLayer } from './renderGameState';
import { ActivityLog } from '../ui/ActivityLog';
import type { ActivityEntry } from '../ui/ActivityLog';

const CDN_BASE: string = (import.meta.env.VITE_CDN_BASE_URL as string | undefined) ?? '';

function CardPreviewPanel({ card, scale }: { card: Card; scale: number }) {
  const [imgErr, setImgErr] = useState(false);
  const templateId = card.id.match(/[A-Z]{2,3}\d{2}-\d{3}/)?.[0] ?? card.id;
  const imgUrl = `${CDN_BASE}/card-images/${templateId}.png`;
  const W = Math.round(420 * scale);
  const H = Math.round(588 * scale);
  const fs = (n: number) => Math.max(9, Math.round(n * scale));

  const infoParts: string[] = [card.type];
  if (card.type !== 'DON' && card.type !== 'Leader') infoParts.push(`Coût ${card.cost}`);
  if (card.power > 0) infoParts.push(`Power ${card.power}`);
  const kws = [...(card.keywords ?? []), ...(card.temporaryKeywords ?? [])];

  return (
    <div style={{
      position: 'absolute',
      right: Math.round(20 * scale),
      top: '50%',
      transform: 'translateY(-50%)',
      zIndex: 300,
      pointerEvents: 'none',
      width: W,
      background: 'rgba(0,0,0,0.92)',
      border: '2px solid #6666bb',
      borderRadius: 6,
      overflow: 'hidden',
      boxShadow: '0 4px 24px rgba(0,0,0,0.8)',
    }}>
      {!imgErr ? (
        <img
          src={imgUrl}
          alt={card.name}
          style={{ width: W, height: H, display: 'block', objectFit: 'cover', flexShrink: 0 }}
          onError={() => setImgErr(true)}
        />
      ) : (
        <div style={{ width: W, height: H, background: '#1a1a3a', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 8, boxSizing: 'border-box', flexShrink: 0 }}>
          <span style={{ color: '#aaa', fontFamily: 'monospace', fontSize: fs(13), textAlign: 'center' }}>{card.name}</span>
        </div>
      )}
      <div style={{ padding: `${fs(6)}px ${fs(10)}px`, background: '#0d0d2a' }}>
        <div style={{ color: '#fff', fontFamily: 'monospace', fontWeight: 'bold', fontSize: fs(13), marginBottom: fs(4) }}>{card.name}</div>
        <div style={{ color: '#aaaacc', fontFamily: 'monospace', fontSize: fs(11) }}>{infoParts.join('  •  ')}</div>
        {(card.counter ?? 0) > 0 && (
          <div style={{ color: '#44ffcc', fontFamily: 'monospace', fontSize: fs(11) }}>Counter +{card.counter}</div>
        )}
        {kws.length > 0 && (
          <div style={{ color: '#ffee44', fontFamily: 'monospace', fontWeight: 'bold', fontSize: fs(11) }}>{kws.join(' / ')}</div>
        )}
      </div>
    </div>
  );
}

function TrashViewPanel({ cards, onClose }: { cards: Card[]; onClose: () => void }) {
  const [hovered, setHovered] = useState<Card | null>(null);
  const [imgErr, setImgErr] = useState<Record<string, boolean>>({});

  return (
    <div
      onClick={onClose}
      style={{
        position: 'absolute', inset: 0, zIndex: 450,
        background: 'rgba(0,0,0,0.78)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        pointerEvents: 'auto',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          display: 'flex', gap: 16, alignItems: 'flex-start',
          background: 'rgba(4,8,24,0.97)',
          border: '1px solid rgba(184,134,11,0.55)',
          borderRadius: 10,
          padding: 16,
          maxHeight: '85vh',
          boxShadow: '0 8px 40px rgba(0,0,0,0.8)',
        }}
      >
        {/* Scrollable card grid */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontFamily: "'Cinzel', serif", fontSize: 11, color: '#b8860b', letterSpacing: 3, textTransform: 'uppercase', textAlign: 'center' }}>
            Défausse ({cards.length})
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 86px)',
            gap: 6,
            overflowY: 'auto',
            maxHeight: 'calc(85vh - 60px)',
            paddingRight: 4,
          }}>
            {cards.map(card => {
              const templateId = card.id.match(/[A-Z]{2,3}\d{2}-\d{3}/)?.[0];
              const imgUrl = templateId !== undefined ? `${CDN_BASE}/card-images/${templateId}.png` : null;
              const errKey = templateId ?? card.id;
              const isHovered = hovered?.id === card.id;
              return (
                <div
                  key={card.id}
                  onMouseEnter={() => setHovered(card)}
                  onMouseLeave={() => setHovered(null)}
                  style={{
                    width: 86, height: 120, flexShrink: 0,
                    borderRadius: 4, overflow: 'hidden', cursor: 'default',
                    border: isHovered ? '2px solid #ffd700' : '1px solid rgba(184,134,11,0.25)',
                    transition: 'border-color 0.1s',
                  }}
                >
                  {imgUrl !== null && !imgErr[errKey] ? (
                    <img
                      src={imgUrl}
                      alt={card.name}
                      onError={() => setImgErr(prev => ({ ...prev, [errKey]: true }))}
                      style={{ width: '100%', height: '100%', display: 'block', objectFit: 'cover' }}
                    />
                  ) : (
                    <div style={{ width: '100%', height: '100%', background: '#1a1a3a', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 4, boxSizing: 'border-box' }}>
                      <span style={{ color: '#aaa', fontFamily: 'monospace', fontSize: 9, textAlign: 'center' }}>{card.name}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Inline preview */}
        <div style={{ width: 300, flexShrink: 0, minHeight: 420 }}>
          {hovered !== null && (() => {
            const templateId = hovered.id.match(/[A-Z]{2,3}\d{2}-\d{3}/)?.[0];
            const imgUrl = templateId !== undefined ? `${CDN_BASE}/card-images/${templateId}.png` : null;
            const infoParts: string[] = [hovered.type];
            if (hovered.type !== 'DON' && hovered.type !== 'Leader') infoParts.push(`Coût ${hovered.cost}`);
            if (hovered.power > 0) infoParts.push(`Power ${hovered.power}`);
            const kws = [...(hovered.keywords ?? []), ...(hovered.temporaryKeywords ?? [])];
            return (
              <div style={{ border: '1px solid rgba(184,134,11,0.4)', borderRadius: 6, overflow: 'hidden', background: '#0d0d2a' }}>
                {imgUrl !== null ? (
                  <img src={imgUrl} alt={hovered.name} style={{ width: 300, height: 420, display: 'block', objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: 300, height: 420, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1a1a3a' }}>
                    <span style={{ color: '#aaa', fontFamily: 'monospace', fontSize: 14, textAlign: 'center', padding: 8 }}>{hovered.name}</span>
                  </div>
                )}
                <div style={{ padding: '8px 12px' }}>
                  <div style={{ color: '#fff', fontFamily: 'monospace', fontWeight: 'bold', fontSize: 14, marginBottom: 4 }}>{hovered.name}</div>
                  <div style={{ color: '#aaaacc', fontFamily: 'monospace', fontSize: 12 }}>{infoParts.join('  •  ')}</div>
                  {(hovered.counter ?? 0) > 0 && <div style={{ color: '#44ffcc', fontFamily: 'monospace', fontSize: 12 }}>Counter +{hovered.counter}</div>}
                  {kws.length > 0 && <div style={{ color: '#ffee44', fontFamily: 'monospace', fontSize: 12 }}>{kws.join(' / ')}</div>}
                </div>
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

const CANVAS_W = 1920;
const CANVAS_H = 1080;

interface Props {
  gameState: GameState;
  uiState: UIState;
  onCardClick: (id: CardId) => void;
  onDragDrop?: (draggedId: CardId, targetId: CardId | null) => void;
  hideCards?: boolean;
  combatViewDefenderId?: PlayerId | null;
  myPlayerId?: PlayerId | null;
  activityLog?: ActivityEntry[];
}

type Status = 'idle' | 'ready' | 'error';

export function GameCanvas({ gameState, uiState, onCardClick, onDragDrop, hideCards = false, combatViewDefenderId = null, myPlayerId = null, activityLog = [] }: Props) {
  const wrapperRef  = useRef<HTMLDivElement>(null);
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const sceneRef    = useRef<Container | null>(null);
  const animRef     = useRef<Container | null>(null);
  const dragRef     = useRef<Container | null>(null);
  const bgRef       = useRef<Container | null>(null);
  const appRef      = useRef<Application | null>(null);
  const [previewCard, setPreviewCard] = useState<Card | null>(null);
  const [trashCards, setTrashCards] = useState<Card[] | null>(null);
  // Keep latest onDragDrop in a ref so setupDragLayer never needs re-running
  const onDragDropRef = useRef(onDragDrop);
  onDragDropRef.current = onDragDrop;
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
        const bgLayer = new Container();
        const scene = new Container();
        const animLayer = new Container();
        const dragLayer = new Container();
        dragLayer.eventMode = 'none'; // ghost is passive — events go through to stage
        app.stage.addChild(bgLayer);    // z=0: background artwork
        app.stage.addChild(scene);
        app.stage.addChild(animLayer);
        app.stage.addChild(dragLayer);  // dragLayer always on top
        app.stage.eventMode = 'static'; // ensure stage receives pointer events for drag
        appRef.current     = app;
        bgRef.current      = bgLayer;
        sceneRef.current   = scene;
        animRef.current    = animLayer;
        dragRef.current    = dragLayer;
        setCardHoverCallback(card => setPreviewCard(card));
        setTrashClickCallback(cards => setTrashCards(cards));
        setupDragLayer(dragLayer, app.stage, (dragged, target) => {
          onDragDropRef.current?.(dragged, target);
        });
        setupBgLayer(bgLayer).catch((err: unknown) => {
          console.warn('[GameCanvas] background assets not loaded:', err);
        });
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
        appRef.current     = null;
        bgRef.current      = null;
        sceneRef.current   = null;
        animRef.current    = null;
        dragRef.current    = null;
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
        .map(c => c.id.match(/[A-Z]{2,3}\d{2}-\d{3}/)?.[0])
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
        position: 'relative',
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
      <ActivityLog
        entries={activityLog}
        right={Math.round(20 * scale)}
        top="50%"
        transform="translateY(-50%)"
        zIndex={290}
      />
      {previewCard !== null && <CardPreviewPanel card={previewCard} scale={scale} />}
      {trashCards !== null && <TrashViewPanel cards={trashCards} onClose={() => setTrashCards(null)} />}
    </div>
  );
}
