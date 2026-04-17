import type { GameState } from 'game-engine';
import type { UIState } from './uiState';

interface Props {
  gameState: GameState;
  uiState: UIState;
}

export function GameUI({ gameState, uiState }: Props) {
  const { phase, turnNumber, activePlayerId, playerOrder, players } = gameState;

  const [p1Id, p2Id] = playerOrder;
  const activePlayer = players[activePlayerId];
  const p1 = players[p1Id];
  const p2 = players[p2Id];

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
        <span>HAND {p2?.hand.length ?? 0}</span>
        <span>LIFE {p2?.life.length ?? 0}</span>
        <span>DON {p2?.donArea.length ?? 0}</span>
        <span style={{ color: '#ccddee', fontWeight: 'bold' }}>{p2Id}</span>
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
        <span style={{ color: '#8899bb' }}>Turn {turnNumber}</span>
        <span style={{ color: '#ffdd66', fontWeight: 'bold' }}>{phase}</span>
        <span style={{ color: '#66ffaa' }}>Active: {activePlayerId}</span>
        <span style={{ color: '#cc88ff' }}>DON avail: {donAvailable}</span>
      </div>

      {/* Bottom bar — p1 info */}
      <div style={{
        position: 'absolute',
        bottom: 6,
        right: 8,
        display: 'flex',
        gap: 16,
        color: '#8899aa',
        fontSize: 11,
      }}>
        <span style={{ color: '#ccddee', fontWeight: 'bold' }}>{p1Id}</span>
        <span>DON {p1?.donArea.length ?? 0}</span>
        <span>LIFE {p1?.life.length ?? 0}</span>
        <span>HAND {p1?.hand.length ?? 0}</span>
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
