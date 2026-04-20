import type { CSSProperties } from 'react';
import type { GameAction, GameState } from 'game-engine';
import { calculatePower } from 'game-engine';
import type { UIState } from './uiState';

interface Props {
  gameState: GameState;
  uiState: UIState;
  onAction: (action: GameAction) => void;
  needsHandoff: boolean;
  onHandoffConfirmed: () => void;
  needsCombatHandoff: boolean;
  onCombatHandoffConfirmed: () => void;
}

const btnStyle: CSSProperties = {
  padding: '6px 14px',
  fontFamily: 'monospace',
  fontSize: 12,
  border: '1px solid #445566',
  borderRadius: 4,
  cursor: 'pointer',
  background: '#1a2a3a',
  color: '#ccddee',
};

const primaryBtn: CSSProperties = {
  ...btnStyle,
  background: '#1a4a2a',
  border: '1px solid #44aa66',
  color: '#88ffaa',
};

const dangerBtn: CSSProperties = {
  ...btnStyle,
  background: '#4a1a1a',
  border: '1px solid #aa4444',
  color: '#ffaaaa',
};

const bigBtn: CSSProperties = {
  ...primaryBtn,
  fontSize: 15,
  padding: '8px 24px',
  fontWeight: 'bold',
};

export function ActionPanel({ gameState, uiState, onAction, needsHandoff, onHandoffConfirmed, needsCombatHandoff, onCombatHandoffConfirmed }: Props) {
  const { phase, activePlayerId, activeCombat, playerOrder, winner } = gameState;
  const defenderId = activePlayerId === playerOrder[0] ? playerOrder[1] : playerOrder[0];

  if (winner !== null) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '8px 16px', background: '#0a0a1a', borderTop: '1px solid #2a2a4a', width: 1200, boxSizing: 'border-box' }}>
        <span style={{ fontFamily: 'monospace', fontSize: 16, color: '#ffee44', fontWeight: 'bold' }}>
          Victoire : {winner} !
        </span>
      </div>
    );
  }

  // ── Hotseat handoff screen ─────────────────────────────────────────────────
  if (needsHandoff) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20, padding: '12px 16px', background: '#0a1a2a', borderTop: '2px solid #4488bb', width: 1200, boxSizing: 'border-box' }}>
        <span style={{ fontFamily: 'monospace', fontSize: 14, color: '#88ccff' }}>
          Tour de <strong style={{ color: '#ffffff' }}>{activePlayerId}</strong> — passez le clavier
        </span>
        <button style={bigBtn} onClick={onHandoffConfirmed}>
          C'est parti, {activePlayerId} !
        </button>
      </div>
    );
  }

  // ── Combat handoff screen — show defender's hand ───────────────────────────
  if (needsCombatHandoff) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20, padding: '12px 16px', background: '#1a0a0a', borderTop: '2px solid #aa4444', width: 1200, boxSizing: 'border-box' }}>
        <span style={{ fontFamily: 'monospace', fontSize: 13, color: '#ffaaaa' }}>
          Attaque ! <strong style={{ color: '#ffffff' }}>{defenderId}</strong>, passez le clavier — vous pouvez contrer ou bloquer
        </span>
        <button style={{ ...bigBtn, background: '#3a1a1a', border: '1px solid #aa4444', color: '#ffcccc' }} onClick={onCombatHandoffConfirmed}>
          Je suis pret, {defenderId} !
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 16px', background: '#0a0a1a', borderTop: '1px solid #2a2a4a', width: 1200, boxSizing: 'border-box' }}>

      {/* Error message */}
      {uiState.errorMessage !== null && (
        <div style={{ background: '#3a1a1a', border: '1px solid #aa4444', borderRadius: 4, padding: '4px 12px', fontFamily: 'monospace', fontSize: 12, color: '#ffaaaa' }}>
          {uiState.errorMessage}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>

        {/* Phase label */}
        <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#6688aa', marginRight: 4 }}>
          [{phase}] {activePlayerId} :
        </span>

        {/* ── Active player actions ─────────────────────────────────────── */}

        {/* Mulligan phase: keep or reshuffle */}
        {phase === 'Mulligan' && (
          <>
            <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#88ccff' }}>
              Voulez-vous garder cette main ?
            </span>
            <button style={primaryBtn}
              onClick={() => onAction({ type: 'Mulligan', playerId: activePlayerId, keep: true })}>
              Garder la main
            </button>
            <button style={dangerBtn}
              onClick={() => onAction({ type: 'Mulligan', playerId: activePlayerId, keep: false })}>
              Relancer (Mulligan)
            </button>
          </>
        )}

        {/* Refresh: just advance */}
        {phase === 'Refresh' && activeCombat === null && (
          <button style={primaryBtn} onClick={() => onAction({ type: 'EndPhase', playerId: activePlayerId })}>
            Commencer le tour →
          </button>
        )}

        {/* Draw phase: draw button */}
        {phase === 'Draw' && (
          <button style={primaryBtn} onClick={() => onAction({ type: 'DrawPhase', playerId: activePlayerId })}>
            Piocher
          </button>
        )}

        {/* DON phase: assign hint + end */}
        {phase === 'DON' && activeCombat === null && (
          <>
            <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#cc88ff' }}>
              Cliquez un DON!! puis votre leader/personnage pour l'assigner
            </span>
            <button style={btnStyle} onClick={() => onAction({ type: 'EndPhase', playerId: activePlayerId })}>
              Passer la phase DON →
            </button>
          </>
        )}

        {/* Main phase */}
        {phase === 'Main' && activeCombat === null && (
          <>
            {/* Play selected hand card */}
            {uiState.selectionMode === 'play' && uiState.selectedCardId !== null && (
              <button style={primaryBtn} onClick={() => onAction({
                type: 'PlayCharacterFromHand',
                playerId: activePlayerId,
                cardId: uiState.selectedCardId!,
              })}>
                Jouer la carte
              </button>
            )}
            <button style={btnStyle} onClick={() => onAction({ type: 'EndPhase', playerId: activePlayerId })}>
              Fin de phase →
            </button>
          </>
        )}

        {/* End phase */}
        {phase === 'End' && activeCombat === null && (
          <button style={btnStyle} onClick={() => onAction({ type: 'EndPhase', playerId: activePlayerId })}>
            Fin du tour →
          </button>
        )}

        {/* ── Combat ───────────────────────────────────────────────────── */}

        {/* Combat power summary */}
        {activeCombat !== null && (() => {
          const attacker     = gameState.cards[activeCombat.attackerId];
          const target       = gameState.cards[activeCombat.targetId];
          const isDoubleAtk  = (attacker?.keywords ?? []).includes('DoubleAttack');
          const atkPower     = calculatePower(activeCombat.attackerId, gameState) * (isDoubleAtk ? 2 : 1);
          const defPower     = calculatePower(activeCombat.targetId,  gameState);
          const totalDef     = defPower + activeCombat.counterPower;
          const atkWins      = atkPower >= totalDef;
          return (
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '4px 10px', background: '#0d1a0d', border: '1px solid #2a4a2a', borderRadius: 4, fontFamily: 'monospace', fontSize: 12 }}>
              <span style={{ color: '#ff8844', fontWeight: 'bold' }}>
                ⚔ ATK [{attacker?.name ?? '?'}] {atkPower}{isDoubleAtk ? ' ×2' : ''}
              </span>
              <span style={{ color: '#666688' }}>vs</span>
              <span style={{ color: '#44aaff' }}>
                DEF [{target?.name ?? '?'}] {defPower}
                {activeCombat.counterPower > 0 && (
                  <span style={{ color: '#44ffcc' }}> + CONTRE {activeCombat.counterPower} = {totalDef}</span>
                )}
              </span>
              <span style={{ color: atkWins ? '#ff4444' : '#44ff88', fontWeight: 'bold' }}>
                → {atkWins ? 'ATK PASSE' : 'REPOUSSÉE'}
              </span>
            </div>
          );
        })()}

        {/* Combat: defender actions */}
        {activeCombat !== null && (() => {
          const blockerSelected = uiState.selectionMode === 'declareBlock' && uiState.selectedCardId !== null;
          const counterStaged   = uiState.selectionMode === 'playCounter'  && uiState.selectedCardId !== null;
          const counterPlayed   = activeCombat.counterPower > 0;
          const blockerDeclared = activeCombat.blockerId !== null;

          return (
            <>
              {/* Status indicators */}
              {counterPlayed && (
                <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#44ffcc', fontWeight: 'bold' }}>
                  CONTRE +{activeCombat.counterPower}
                </span>
              )}
              {blockerDeclared && (
                <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#ff8844', fontWeight: 'bold' }}>
                  BLOQUEUR ENGAGÉ
                </span>
              )}

              <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#ffee44' }}>
                {defenderId} :
              </span>

              {/* Counter confirm button */}
              {counterStaged && (
                <button style={primaryBtn} onClick={() => onAction({
                  type: 'PlayCounter',
                  playerId: defenderId,
                  cardId: uiState.selectedCardId!,
                })}>
                  Confirmer le contre
                </button>
              )}

              {/* Counter hint — hidden if blocker already declared or counter already played */}
              {!counterPlayed && !blockerDeclared && !counterStaged && !blockerSelected && (
                <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#888899' }}>
                  Cliquez une carte main (cyan) pour contrer —
                </span>
              )}

              {/* Blocker confirm button — hidden if counter played or staged */}
              {blockerSelected && !counterPlayed && (
                <button style={dangerBtn} onClick={() => onAction({
                  type: 'DeclareBlock',
                  playerId: defenderId,
                  blockerId: uiState.selectedCardId!,
                })}>
                  Confirmer le bloqueur
                </button>
              )}

              {/* Mutual exclusion notice */}
              {blockerSelected && counterPlayed && (
                <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#ff6666' }}>
                  Impossible de bloquer : un contre a déjà été joué
                </span>
              )}

              <button style={btnStyle} onClick={() => onAction({ type: 'ResolveCombat', playerId: activePlayerId })}>
                {blockerDeclared || counterPlayed ? 'Résoudre →' : 'Ne pas bloquer →'}
              </button>
            </>
          );
        })()}

        {/* Attacker resolves */}
        {activeCombat !== null && (
          <button style={primaryBtn} onClick={() => onAction({ type: 'ResolveCombat', playerId: activePlayerId })}>
            Résoudre le combat ⚔
          </button>
        )}

        {/* ── Selection hints ───────────────────────────────────────────── */}
        {uiState.selectionMode === 'attack' && (
          <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#88ffaa' }}>
            Cliquez sur le leader ou un personnage adverse pour attaquer
          </span>
        )}
        {uiState.selectionMode === 'assignDon' && (
          <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#cc88ff' }}>
            Cliquez sur votre leader ou un personnage pour assigner ce DON
          </span>
        )}
      </div>
    </div>
  );
}
