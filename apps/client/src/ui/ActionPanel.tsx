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

function CardThumb({ id, card }: { id: string; card: Card }) {
  const [err, setErr] = useState(false);
  const templateId = id.match(/OP\d{2}-\d{3}/)?.[0];
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

export function ActionPanel({ gameState, uiState, onAction, myPlayerId, needsHandoff, onHandoffConfirmed, needsCombatHandoff, onCombatHandoffConfirmed }: Props) {
  const { phase, activePlayerId, activeCombat, playerOrder, winner } = gameState;
  const defenderId  = activePlayerId === playerOrder[0] ? playerOrder[1] : playerOrder[0];
  const isMyTurn    = !myPlayerId || myPlayerId === activePlayerId;
  const amIDefender = !!myPlayerId && myPlayerId === defenderId && activeCombat !== null;
  const [showTrash, setShowTrash] = useState(false);

  const renderTrashList = (trash: readonly string[], label: string) => (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#6688aa', marginBottom: 6, borderBottom: '1px solid #2a2a4a', paddingBottom: 4 }}>
        {label} — {trash.length} carte{trash.length !== 1 ? 's' : ''}
      </div>
      {trash.length === 0 ? (
        <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#333344' }}>Vide</div>
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
        background: '#080810',
        border: '1px solid #2a2a4a',
        borderRadius: 4,
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

  // ── Network mode: waiting screen (with trash viewer still accessible) ────────
  if (!isMyTurn && !amIDefender) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', background: '#0a0a1a', borderTop: '1px solid #2a2a4a', width: 1200, boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', fontFamily: 'monospace' }}>
          <span style={{ color: '#6688aa', fontSize: 13 }}>En attente de l'adversaire…</span>
          <span style={{ color: '#445566', fontSize: 11 }}>{phase} · Tour {gameState.turnNumber}</span>
          <span style={{ marginLeft: 'auto' }}>
            <button style={btnStyle} onClick={() => setShowTrash(v => !v)}>
              Défausses{showTrash ? ' ×' : ' ↑'}
            </button>
          </span>
        </div>
        {showTrash && renderTrashPanel()}
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

        {/* Combat: defender actions — shown to defender (or both in hotseat) */}
        {activeCombat !== null && (isMyTurn || amIDefender) && (() => {
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

        {/* Attacker resolves — only for the active player */}
        {activeCombat !== null && isMyTurn && (
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
