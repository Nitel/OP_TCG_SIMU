import { useState } from 'react';
import type { CSSProperties } from 'react';
import type { Card, CardId, GameAction, GameState, PlayerId, ActivatedAbilityAction } from 'game-engine';
import { calculatePower } from 'game-engine';
import type { UIState } from './uiState';

interface Props {
  gameState: GameState;
  uiState: UIState;
  onAction: (action: GameAction) => void;
  myPlayerId?: PlayerId | null;
}

const btnStyle: CSSProperties = {
  padding: '6px 16px',
  fontFamily: "'Cinzel', serif",
  fontSize: 11,
  border: '1px solid rgba(60,90,120,0.7)',
  borderRadius: 8,
  cursor: 'pointer',
  background: 'linear-gradient(160deg, #081828 0%, #050e1a 100%)',
  color: '#6aabcc',
  whiteSpace: 'nowrap',
  transition: 'transform 0.12s ease, box-shadow 0.12s ease, background 0.12s ease',
  boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
};

const primaryBtn: CSSProperties = {
  ...btnStyle,
  background: 'linear-gradient(160deg, #0a2a44 0%, #051828 100%)',
  border: '1px solid rgba(0,120,200,0.7)',
  color: '#55ddff',
  fontWeight: 'bold',
  boxShadow: '0 2px 10px rgba(0,80,160,0.3)',
};

const dangerBtn: CSSProperties = {
  ...btnStyle,
  background: 'linear-gradient(160deg, #2a0818 0%, #1a0410 100%)',
  border: '1px solid rgba(160,30,60,0.7)',
  color: '#ff7799',
  boxShadow: '0 2px 10px rgba(160,0,50,0.3)',
};

function CardThumb({ id, card }: { id: string; card: Card }) {
  const [err, setErr] = useState(false);
  const templateId = id.match(/[A-Z]{2,3}\d{2}-\d{3}/)?.[0];
  const title = [
    card.name,
    card.type,
    card.type !== 'DON' && card.type !== 'Leader' ? `Coût ${card.cost}` : null,
    card.power > 0 ? `${card.power}` : null,
    (card.counter ?? 0) > 0 ? `+${card.counter}` : null,
  ].filter(Boolean).join(' · ');

  return (
    <div style={{ width: 56, height: 78, flexShrink: 0 }} title={title}>
      {!err && templateId !== undefined ? (
        <img
          src={`/card-images/${templateId}.png`}
          alt={card.name}
          style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 2, display: 'block' }}
          onError={() => setErr(true)}
        />
      ) : (
        <div style={{
          width: '100%', height: '100%',
          background: '#2a3a4a', borderRadius: 2,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 9, color: '#aabbcc', textAlign: 'center',
          padding: 2, boxSizing: 'border-box', wordBreak: 'break-word',
        }}>
          {card.name}
        </div>
      )}
    </div>
  );
}

export function ActionPanel({ gameState, uiState, onAction, myPlayerId }: Props) {
  const { phase, activePlayerId, activeCombat, playerOrder, winner } = gameState;
  const defenderId  = activePlayerId === playerOrder[0] ? playerOrder[1] : playerOrder[0];
  const isMyTurn    = !myPlayerId || myPlayerId === activePlayerId;
  const amIDefender = !!myPlayerId && myPlayerId === defenderId && activeCombat !== null;
  const [showTrash, setShowTrash] = useState(false);

  const renderTrashList = (trash: readonly string[], label: string) => (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontFamily: "'Cinzel', serif", fontSize: 10, color: '#b8860b', marginBottom: 6, borderBottom: '1px solid rgba(184,134,11,0.3)', paddingBottom: 4, letterSpacing: 1 }}>
        {label} — {trash.length} carte{trash.length !== 1 ? 's' : ''}
      </div>
      {trash.length === 0 ? (
        <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#2a2a3a' }}>Vide</div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {[...trash].reverse().map(id => {
            const card = gameState.cards[id as CardId];
            if (card === undefined) return null;
            return <CardThumb key={id} id={id} card={card} />;
          })}
        </div>
      )}
    </div>
  );

  const renderTrashPanel = () => {
    const [p1Id, p2Id] = playerOrder;
    const p1 = p1Id !== undefined ? gameState.players[p1Id] : undefined;
    const p2 = p2Id !== undefined ? gameState.players[p2Id] : undefined;
    return (
      <div style={{
        display: 'flex',
        gap: 16,
        maxHeight: 260,
        overflowY: 'auto',
        background: 'rgba(4,6,18,0.96)',
        border: '1px solid rgba(184,134,11,0.35)',
        borderRadius: 8,
        padding: '8px 12px',
        marginTop: 4,
      }}>
        {renderTrashList(p1?.trash ?? [], `Défausse ${String(p1Id)}`)}
        <div style={{ width: 1, background: '#2a2a4a', flexShrink: 0 }} />
        {renderTrashList(p2?.trash ?? [], `Défausse ${String(p2Id)}`)}
      </div>
    );
  };

  if (winner !== null) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '8px 20px', background: 'linear-gradient(to top, rgba(3,6,16,0.98) 0%, rgba(5,10,22,0.95) 100%)', borderTop: '2px solid rgba(184,134,11,0.45)', width: '100%', boxSizing: 'border-box' }}>
        <span style={{ fontFamily: "'Cinzel', serif", fontSize: 15, color: '#ffd700', fontWeight: 'bold', letterSpacing: 3, textShadow: '0 0 12px rgba(255,215,0,0.5)' }}>
          Victoire : {winner} !
        </span>
      </div>
    );
  }

  // ── Opponent's turn: minimal bar (no action messages) ────────────────────
  if (!isMyTurn && !amIDefender) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', background: 'linear-gradient(to top, rgba(3,6,16,0.98) 0%, rgba(5,10,22,0.95) 100%)', borderTop: '1px solid rgba(184,134,11,0.2)', width: '100%', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '6px 20px' }}>
          <button style={btnStyle} onClick={() => setShowTrash(v => !v)}>
            Défausses{showTrash ? ' ×' : ' ↑'}
          </button>
        </div>
        {showTrash && renderTrashPanel()}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '8px 20px', background: 'linear-gradient(to top, rgba(3,6,16,0.98) 0%, rgba(5,10,22,0.95) 100%)', borderTop: '2px solid rgba(184,134,11,0.45)', width: '100%', boxSizing: 'border-box' }}>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>

        {/* Phase + player badge */}
        <span style={{ fontFamily: "'Cinzel', serif", fontSize: 10, color: '#b8860b', background: 'rgba(20,14,4,0.8)', border: '1px solid rgba(184,134,11,0.5)', borderRadius: 6, padding: '3px 10px', whiteSpace: 'nowrap', letterSpacing: 1 }}>
          {phase}
        </span>
        <span style={{ fontFamily: "'Cinzel', serif", fontSize: 11, color: '#6688aa', marginRight: 2 }}>
          {activePlayerId} :
        </span>

        {/* ── Active player actions ─────────────────────────────────────── */}

        {/* Mulligan phase: keep or reshuffle */}
        {isMyTurn && phase === 'Mulligan' && (
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
        {isMyTurn && phase === 'Refresh' && activeCombat === null && (
          <button style={primaryBtn} onClick={() => onAction({ type: 'EndPhase', playerId: activePlayerId })}>
            Commencer le tour →
          </button>
        )}

        {/* Draw phase: draw button */}
        {isMyTurn && phase === 'Draw' && (
          <button style={primaryBtn} onClick={() => onAction({ type: 'DrawPhase', playerId: activePlayerId })}>
            Piocher
          </button>
        )}

        {/* DON phase: assign hint + end */}
        {isMyTurn && phase === 'DON' && activeCombat === null && (
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
        {isMyTurn && phase === 'Main' && activeCombat === null && (
          <>
            {/* Choose target hint */}
            {uiState.selectionMode === 'chooseTarget' && (
              <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#ffcc44' }}>
                Cliquez une carte {uiState.targetScope === 'ChooseOpponentCharacter' ? 'adverse' : 'alliée'} sur le plateau comme cible
              </span>
            )}

            {/* Play selected hand card */}
            {uiState.selectionMode === 'play' && uiState.selectedCardId !== null && (() => {
              const selectedCard = gameState.cards[uiState.selectedCardId];
              const isEvent = selectedCard?.type === 'Event';
              return (
                <button style={primaryBtn} onClick={() => onAction(
                  isEvent
                    ? { type: 'PlayEvent', playerId: activePlayerId, cardId: uiState.selectedCardId! }
                    : { type: 'PlayCharacterFromHand', playerId: activePlayerId, cardId: uiState.selectedCardId! }
                )}>
                  {isEvent ? 'Jouer l\'événement' : 'Jouer la carte'}
                </button>
              );
            })()}

            {/* Activate button — shown when a board card or leader with Activated effect is selected */}
            {(uiState.selectionMode === null || uiState.selectionMode === 'attack') && uiState.selectedCardId !== null && (() => {
              const selCard = gameState.cards[uiState.selectedCardId];
              const hasActivated = selCard?.effects?.some((e) => e.trigger === 'Activated');
              if (!hasActivated) return null;
              const ownPlayer = gameState.players[activePlayerId];
              const isOnBoard = ownPlayer !== undefined &&
                (ownPlayer.board.includes(uiState.selectedCardId) || ownPlayer.leader === uiState.selectedCardId);
              if (!isOnBoard) return null;
              return (
                <button style={{ ...primaryBtn, background: '#2a1a4a', border: '1px solid #8844cc', color: '#cc88ff' }}
                  onClick={() => onAction({ type: 'ActivatedAbility', playerId: activePlayerId, cardId: uiState.selectedCardId! } satisfies ActivatedAbilityAction)}>
                  Activer
                </button>
              );
            })()}

            <button style={btnStyle} onClick={() => onAction({ type: 'EndPhase', playerId: activePlayerId })}>
              Fin de phase →
            </button>
          </>
        )}

        {/* End phase */}
        {isMyTurn && phase === 'End' && activeCombat === null && (
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
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '5px 12px', background: 'rgba(4,10,22,0.9)', border: '1px solid rgba(184,134,11,0.4)', borderRadius: 8, fontFamily: 'monospace', fontSize: 12, boxShadow: '0 2px 10px rgba(0,0,0,0.4)' }}>
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

        {/* Combat: defender actions — shown to defender only (or both in hotseat when myPlayerId is null) */}
        {activeCombat !== null && (!myPlayerId || amIDefender) && (() => {
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

        {/* Attacker resolves — only in vsBot/network mode (hotseat uses the defender section above) */}
        {activeCombat !== null && isMyTurn && !!myPlayerId && !amIDefender && (
          <button style={primaryBtn} onClick={() => onAction({ type: 'ResolveCombat', playerId: activePlayerId })}>
            Résoudre le combat ⚔
          </button>
        )}

        {/* ── Selection hints ───────────────────────────────────────────── */}
        {isMyTurn && uiState.selectionMode === 'attack' && (
          <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#88ffaa' }}>
            Cliquez sur le leader ou un personnage adverse pour attaquer
          </span>
        )}
        {isMyTurn && uiState.selectionMode === 'assignDon' && (
          <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#cc88ff' }}>
            Cliquez sur votre leader ou un personnage pour assigner ce DON
          </span>
        )}

        {/* ── Trash viewer button — always visible ──────────────────────── */}
        <span style={{ marginLeft: 'auto' }}>
          <button style={btnStyle} onClick={() => setShowTrash(v => !v)}>
            Défausses{showTrash ? ' ×' : ' ↑'}
          </button>
        </span>
      </div>

      {/* ── Trash panel ─────────────────────────────────────────────────────── */}
      {showTrash && renderTrashPanel()}
    </div>
  );
}
