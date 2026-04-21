import type { CardId, GameState, PlayerId } from 'game-engine';
import type { UIState } from './uiState';

interface Props {
  gameState: GameState;
  uiState: UIState;
  myPlayerId?: PlayerId | null;
  notification?: { cardId: CardId; label: string } | null;
  onDismissNotification?: () => void;
}

export function GameUI({ gameState, uiState, myPlayerId, notification, onDismissNotification }: Props) {
  const { phase, turnNumber, activePlayerId, playerOrder, players } = gameState;

  const [p1Id, p2Id] = playerOrder;
  const activePlayer = players[activePlayerId];

  // In network mode orient HUD so the local player is always at the bottom
  const myId       = myPlayerId ?? p1Id;
  const opponentId = myId === p1Id ? p2Id : p1Id;
  const myPlayer   = myId !== undefined ? players[myId] : undefined;
  const oppPlayer  = opponentId !== undefined ? players[opponentId] : undefined;

  const donAvailable = (activePlayer?.donArea.length ?? 0);

  return (
    <div style={{
      position: 'absolute',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
      fontFamily: 'monospace',
    }}>
      {/* Top bar — opponent info */}
      <div style={{
        position: 'absolute',
        top: 6,
        right: 8,
        display: 'flex',
        gap: 16,
        color: '#8899aa',
        fontSize: 11,
      }}>
        <span>HAND {oppPlayer?.hand.length ?? 0}</span>
        <span>LIFE {oppPlayer?.life.length ?? 0}</span>
        <span>DON {oppPlayer?.donArea.length ?? 0}</span>
        <span style={{ color: '#ccddee', fontWeight: 'bold' }}>{opponentId}</span>
      </div>

      {/* Center HUD */}
      <div style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        display: 'flex',
        gap: 24,
        alignItems: 'center',
        color: '#ffffff',
        fontSize: 13,
        backgroundColor: 'rgba(0,0,0,0.5)',
        padding: '4px 16px',
        borderRadius: 4,
        border: '1px solid #2a2a4a',
      }}>
        <span style={{ color: '#8899bb' }}>{phase === 'Mulligan' ? 'Mulligan' : `Turn ${turnNumber}`}</span>
        <span style={{ color: '#ffdd66', fontWeight: 'bold' }}>{phase}</span>
        <span style={{ color: '#66ffaa' }}>Active: {activePlayerId}</span>
        <span style={{ color: '#cc88ff' }}>DON avail: {donAvailable}</span>
      </div>

      {/* Bottom bar — local player info */}
      <div style={{
        position: 'absolute',
        bottom: 6,
        right: 8,
        display: 'flex',
        gap: 16,
        color: '#8899aa',
        fontSize: 11,
      }}>
        <span style={{ color: '#ccddee', fontWeight: 'bold' }}>
          {myId}{myPlayerId !== null && myPlayerId !== undefined ? ' ▶ VOUS' : ''}
        </span>
        <span>DON {myPlayer?.donArea.length ?? 0}</span>
        <span>LIFE {myPlayer?.life.length ?? 0}</span>
        <span>HAND {myPlayer?.hand.length ?? 0}</span>
      </div>

      {/* Victory overlay */}
      {gameState.winner !== null && (
        <div style={{
          position: 'absolute',
          top: 0, left: 0, width: '100%', height: '100%',
          backgroundColor: 'rgba(0,0,0,0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
        }}>
          <div style={{
            fontSize: 36,
            fontWeight: 'bold',
            color: '#ffee44',
            textShadow: '0 0 20px #ffaa00',
            letterSpacing: 4,
          }}>
            {gameState.winner} WINS!
          </div>
        </div>
      )}

      {/* Card play notification — click backdrop to dismiss */}
      {notification !== null && notification !== undefined && (() => {
        const card = gameState.cards[notification.cardId];
        const templateId = String(notification.cardId).match(/OP\d{2}-\d{3}/)?.[0];
        const imgUrl = templateId !== undefined ? `/card-images/${templateId}.png` : null;
        return (
          <div
            style={{
              position: 'absolute',
              top: 0, left: 0, width: '100%', height: '100%',
              backgroundColor: 'rgba(0,0,0,0.65)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'auto',
              zIndex: 20,
              cursor: 'pointer',
            }}
            onClick={onDismissNotification}
          >
            <div
              style={{
                background: '#09091a',
                border: '2px solid #4488bb',
                borderRadius: 8,
                padding: 16,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 10,
                cursor: 'default',
                minWidth: 220,
              }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ fontFamily: 'monospace', fontSize: 13, color: '#88ccff', fontWeight: 'bold', letterSpacing: 1 }}>
                {notification.label}
              </div>
              <div style={{ fontFamily: 'monospace', fontSize: 16, color: '#ffffff', fontWeight: 'bold' }}>
                {card?.name ?? String(notification.cardId)}
              </div>
              {imgUrl !== null && (
                <img
                  src={imgUrl}
                  alt={card?.name ?? ''}
                  style={{ width: 200, height: 280, objectFit: 'cover', borderRadius: 4, border: '1px solid #2a2a5a', display: 'block' }}
                />
              )}
              {card !== undefined && (
                <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#aabbcc', display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
                  <span>{card.type}</span>
                  {card.type !== 'DON' && card.type !== 'Leader' && <span>Coût {card.cost}</span>}
                  {card.power > 0 && <span>{card.power} POW</span>}
                  {(card.counter ?? 0) > 0 && <span style={{ color: '#44ffcc' }}>+{card.counter} CTR</span>}
                  {(card.keywords ?? []).length > 0 && <span style={{ color: '#ffee44' }}>{(card.keywords ?? []).join(' / ')}</span>}
                </div>
              )}
              <div style={{ fontFamily: 'monospace', fontSize: 10, color: '#445566', marginTop: 4 }}>
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
          bottom: 30,
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(80,10,10,0.9)',
          border: '1px solid #aa4444',
          borderRadius: 4,
          padding: '4px 16px',
          fontSize: 12,
          color: '#ffaaaa',
          pointerEvents: 'none',
        }}>
          {uiState.errorMessage}
        </div>
      )}
    </div>
  );
}
