import type { CSSProperties } from 'react';
import type { CardId, GameState, PlayerId } from 'game-engine';
import type { UIState } from './uiState';

interface Props {
  gameState: GameState;
  uiState: UIState;
  myPlayerId?: PlayerId | null;
  notification?: { cardId: CardId; label: string } | null;
  onDismissNotification?: () => void;
  onReturnToMenu?: () => void;
}

const hudPanel: CSSProperties = {
  background: 'linear-gradient(135deg, rgba(4,8,20,0.92) 0%, rgba(8,15,35,0.88) 100%)',
  border: '1px solid rgba(184,134,11,0.55)',
  borderRadius: 8,
  backdropFilter: 'blur(6px)',
  boxShadow: '0 4px 20px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.04)',
  padding: '6px 14px',
  display: 'flex',
  gap: 16,
  alignItems: 'center',
};

export function GameUI({ gameState, uiState, myPlayerId, notification, onDismissNotification, onReturnToMenu }: Props) {
  const { phase, turnNumber, activePlayerId, playerOrder, players } = gameState;

  const [p1Id, p2Id] = playerOrder;
  const activePlayer = players[activePlayerId];

  const myId       = myPlayerId ?? p1Id;
  const opponentId = myId === p1Id ? p2Id : p1Id;
  const myPlayer   = myId !== undefined ? players[myId] : undefined;
  const oppPlayer  = opponentId !== undefined ? players[opponentId] : undefined;

  const donAvailable = (activePlayer?.donArea.length ?? 0);

  const lifeColor = (n: number) => n <= 2 ? '#ff4444' : '#f0f0e8';

  return (
    <div style={{
      position: 'absolute',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
      fontFamily: "'Cinzel', serif",
    }}>
      {/* Top bar — opponent info */}
      <div style={{
        position: 'absolute',
        top: 8,
        right: 10,
        ...hudPanel,
        fontSize: 12,
      }}>
        <span style={{ color: '#aabbc8', fontSize: 11 }}>🂠 {oppPlayer?.hand.length ?? 0}</span>
        <span style={{ color: lifeColor(oppPlayer?.life.length ?? 5) }}>
          ❤ {oppPlayer?.life.length ?? 0}
        </span>
        <span style={{ color: '#cc88ff' }}>◆ {oppPlayer?.donArea.length ?? 0}</span>
        <span style={{ color: '#ffd700', fontWeight: 'bold', letterSpacing: 1 }}>{opponentId}</span>
      </div>

      {/* Center HUD */}
      <div style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        ...hudPanel,
        gap: 20,
        fontSize: 13,
        padding: '5px 20px',
      }}>
        <span style={{ color: '#8899bb', fontSize: 11 }}>
          {phase === 'Mulligan' ? 'Mulligan' : `Tour ${turnNumber}`}
        </span>
        <span style={{ color: '#ffd700', fontWeight: 'bold', letterSpacing: 1 }}>{phase}</span>
        <span style={{ color: '#66ffaa', fontSize: 11 }}>▶ {activePlayerId}</span>
        <span style={{ color: '#cc88ff', fontSize: 11 }}>◆ ×{donAvailable}</span>
      </div>

      {/* Bottom bar — local player info */}
      <div style={{
        position: 'absolute',
        bottom: 8,
        right: 10,
        ...hudPanel,
        fontSize: 12,
      }}>
        <span style={{ color: '#ffd700', fontWeight: 'bold', letterSpacing: 1 }}>
          {myId}{myPlayerId !== null && myPlayerId !== undefined ? ' ▶ VOUS' : ''}
        </span>
        <span style={{ color: '#cc88ff' }}>◆ {myPlayer?.donArea.length ?? 0}</span>
        <span style={{ color: lifeColor(myPlayer?.life.length ?? 5) }}>
          ❤ {myPlayer?.life.length ?? 0}
        </span>
        <span style={{ color: '#aabbc8', fontSize: 11 }}>🂠 {myPlayer?.hand.length ?? 0}</span>
      </div>

      {/* Victory overlay */}
      {gameState.winner !== null && (
        <div style={{
          position: 'absolute',
          top: 0, left: 0, width: '100%', height: '100%',
          background: 'radial-gradient(ellipse at center, rgba(30,20,5,0.85) 0%, rgba(0,0,0,0.92) 100%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'auto',
        }}>
          <div style={{
            textAlign: 'center',
            animation: 'victoryPulse 1.5s ease-in-out infinite alternate',
          }}>
            <div style={{
              fontFamily: "'Cinzel Decorative', serif",
              fontSize: 64,
              fontWeight: '700',
              color: '#ffd700',
              textShadow: '0 0 40px rgba(255,215,0,0.8), 0 0 80px rgba(184,134,11,0.5)',
              letterSpacing: 6,
            }}>
              {gameState.winner}
            </div>
            <div style={{
              fontFamily: "'Cinzel', serif",
              fontSize: 28,
              color: '#f0e8c0',
              letterSpacing: 8,
              marginTop: 8,
              textShadow: '0 0 20px rgba(255,215,0,0.4)',
            }}>
              VICTOIRE
            </div>
            {onReturnToMenu !== undefined && (
              <button
                onClick={onReturnToMenu}
                style={{
                  marginTop: 32,
                  padding: '12px 36px',
                  fontFamily: "'Cinzel', serif",
                  fontSize: 14,
                  fontWeight: 'bold',
                  letterSpacing: 2,
                  color: '#ffd700',
                  background: 'rgba(10,15,30,0.9)',
                  border: '1px solid rgba(184,134,11,0.7)',
                  borderRadius: 8,
                  cursor: 'pointer',
                  boxShadow: '0 2px 12px rgba(0,0,0,0.6)',
                }}
              >
                Retour au menu
              </button>
            )}
          </div>
          <style>{`
            @keyframes victoryPulse {
              from { opacity: 0.85; transform: scale(1); }
              to   { opacity: 1;    transform: scale(1.04); }
            }
          `}</style>
        </div>
      )}

      {/* Card play notification */}
      {notification !== null && notification !== undefined && (() => {
        const card = gameState.cards[notification.cardId];
        const templateId = String(notification.cardId).match(/[A-Z]{2,3}\d{2}-\d{3}/)?.[0];
        const imgUrl = templateId !== undefined ? `/card-images/${templateId}.png` : null;
        return (
          <div
            style={{
              position: 'absolute',
              top: 0, left: 0, width: '100%', height: '100%',
              background: 'rgba(2,5,15,0.72)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'auto',
              zIndex: 20,
              cursor: 'pointer',
              backdropFilter: 'blur(3px)',
            }}
            onClick={onDismissNotification}
          >
            <div
              style={{
                background: 'linear-gradient(160deg, #08091e 0%, #0d0d28 100%)',
                border: '2px solid rgba(184,134,11,0.7)',
                borderRadius: 12,
                padding: 20,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 12,
                cursor: 'default',
                minWidth: 240,
                boxShadow: '0 8px 40px rgba(0,0,0,0.8), 0 0 20px rgba(184,134,11,0.2)',
              }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ fontFamily: "'Cinzel', serif", fontSize: 11, color: '#b8860b', fontWeight: 'bold', letterSpacing: 3, textTransform: 'uppercase' }}>
                {notification.label}
              </div>
              <div style={{ fontFamily: "'Cinzel', serif", fontSize: 18, color: '#ffd700', fontWeight: 'bold', letterSpacing: 1 }}>
                {card?.name ?? String(notification.cardId)}
              </div>
              {imgUrl !== null && (
                <img
                  src={imgUrl}
                  alt={card?.name ?? ''}
                  style={{ width: 200, height: 280, objectFit: 'cover', borderRadius: 6, border: '2px solid rgba(184,134,11,0.5)', display: 'block', boxShadow: '0 4px 20px rgba(0,0,0,0.6)' }}
                />
              )}
              {card !== undefined && (
                <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#aabbcc', display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
                  <span>{card.type}</span>
                  {card.type !== 'DON' && card.type !== 'Leader' && <span>Coût {card.cost}</span>}
                  {card.power > 0 && <span>{card.power} POW</span>}
                  {(card.counter ?? 0) > 0 && <span style={{ color: '#44ffcc' }}>+{card.counter} CTR</span>}
                  {(card.keywords ?? []).length > 0 && <span style={{ color: '#ffd700' }}>{(card.keywords ?? []).join(' / ')}</span>}
                </div>
              )}
              <div style={{ fontFamily: 'monospace', fontSize: 10, color: '#554433', marginTop: 2 }}>
                Cliquez ailleurs pour fermer
              </div>
            </div>
          </div>
        );
      })()}

      {/* Error flash */}
      {uiState.errorMessage !== null && (
        <div style={{
          position: 'absolute',
          bottom: 36,
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'linear-gradient(90deg, rgba(60,5,5,0.95), rgba(80,10,10,0.95))',
          border: '1px solid rgba(200,50,50,0.7)',
          borderRadius: 6,
          padding: '5px 20px',
          fontSize: 12,
          fontFamily: 'monospace',
          color: '#ffaaaa',
          pointerEvents: 'none',
          boxShadow: '0 2px 12px rgba(200,0,0,0.3)',
        }}>
          {uiState.errorMessage}
        </div>
      )}
    </div>
  );
}
