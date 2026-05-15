import type { CSSProperties } from 'react';
import type { GameAction, GameState, PlayerId, ActivatedAbilityAction } from 'game-engine';
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


export function ActionPanel({ gameState, uiState, onAction, myPlayerId }: Props) {
  const { phase, activePlayerId, activeCombat, playerOrder, winner } = gameState;
  const defenderId  = activePlayerId === playerOrder[0] ? playerOrder[1] : playerOrder[0];
  const isMyTurn    = !myPlayerId || myPlayerId === activePlayerId;
  const amIDefender = !!myPlayerId && myPlayerId === defenderId && activeCombat !== null;
  // True while any pending interaction blocks the Block/Counter/Resolve step (OPTCG rules).
  // Uses game state as source of truth — does not depend on uiState being in sync.
  const isCombatPaused =
    gameState.pendingTargetInteraction       !== null ||
    gameState.pendingRevealInteraction       !== null ||
    gameState.pendingTrashInteraction        !== null ||
    gameState.pendingSearchInteraction       !== null ||
    gameState.pendingForceDiscardInteraction !== null ||
    gameState.pendingOnKOInteraction         !== null;
  if (winner !== null) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '8px 20px', background: 'linear-gradient(to top, rgba(3,6,16,0.98) 0%, rgba(5,10,22,0.95) 100%)', borderTop: '2px solid rgba(184,134,11,0.45)', width: '100%', boxSizing: 'border-box' }}>
        <span style={{ fontFamily: "'Cinzel', serif", fontSize: 15, color: '#ffd700', fontWeight: 'bold', letterSpacing: 3, textShadow: '0 0 12px rgba(255,215,0,0.5)' }}>
          Victoire : {winner} !
        </span>
      </div>
    );
  }

  // ── Opponent's turn: no action bar ───────────────────────────────────────
  // Allow through if the inactive player has an [Opponent's Turn] ability selected
  // OR if they have a pending OnKO interaction to resolve
  if (!isMyTurn && !amIDefender) {
    const _sc = uiState.selectedCardId !== null ? gameState.cards[uiState.selectedCardId] : undefined;
    const _hasOTA = !!myPlayerId && _sc?.ownerId === myPlayerId &&
      (_sc?.effects ?? []).some(
        (e) => e.trigger === 'Activated' && (e as { timing?: string }).timing === 'OpponentTurn',
      );
    const _hasPendingInteraction = !!myPlayerId && (
      gameState.pendingOnKOInteraction?.playerId    === myPlayerId ||
      gameState.pendingTargetInteraction?.playerId  === myPlayerId
    );
    if (!_hasOTA && !_hasPendingInteraction) return null;
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

        {/* Choose target hint — shown when human has a pending target interaction (own or bot's turn) */}
        {uiState.selectionMode === 'chooseTarget' &&
          (isMyTurn || (!myPlayerId || gameState.pendingTargetInteraction?.playerId === myPlayerId)) && (
          <>
            <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#ffcc44' }}>
              Cliquez une carte {uiState.targetScope === 'ChooseOpponentCharacter' || uiState.targetScope === 'ChooseOpponentCharacterOrLeader' ? 'adverse' : 'alliée'} sur le plateau comme cible {uiState.targetScope === 'ChooseOwnCharacterOrLeader' || uiState.targetScope === 'ChooseOpponentCharacterOrLeader' ? '(leader inclus)' : ''}
            </span>
            <button style={btnStyle} onClick={() => onAction({ type: 'ResolveTargetInteraction', playerId: gameState.pendingTargetInteraction?.playerId ?? activePlayerId, targetCardId: null })}>
              Passer
            </button>
          </>
        )}

        {/* Main phase */}
        {isMyTurn && phase === 'Main' && activeCombat === null && (
          <>
            {/* Choose target hint already rendered above when selectionMode === 'chooseTarget' */}

            {/* OnKO interaction — player must choose a hand card to play */}
            {uiState.selectionMode === 'resolveOnKO' && uiState.onKOInteraction && (
              <>
                <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#ff9955' }}>
                  Effet OnKO : jouez{
                    uiState.onKOInteraction.filter.color ? ` un personnage ${uiState.onKOInteraction.filter.color}` : ' un personnage'
                  }{
                    uiState.onKOInteraction.filter.maxPower !== undefined ? ` ≤${uiState.onKOInteraction.filter.maxPower}` : ''
                  } depuis votre main (surligné)
                </span>
                <button style={btnStyle} onClick={() => onAction({ type: 'ResolveOnKOInteraction', playerId: activePlayerId, cardId: null })}>
                  Passer
                </button>
              </>
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
              const activatedEffects = selCard?.effects?.filter((e) => e.trigger === 'Activated') ?? [];
              if (activatedEffects.length === 0) return null;
              const ownPlayer = gameState.players[activePlayerId];
              const isOnBoard = ownPlayer !== undefined &&
                (ownPlayer.board.includes(uiState.selectedCardId) || ownPlayer.leader === uiState.selectedCardId);
              if (!isOnBoard) return null;

              const alreadyUsed = gameState.activatedAbilityIds.includes(uiState.selectedCardId);
              const allCards = Object.values(gameState.cards);
              const conditionMet = activatedEffects.some((eff) => {
                const cond = eff.condition;
                if (!cond || cond.type === 'Always') return true;
                if (cond.type === 'HasAttachedDon') {
                  const attached = allCards.filter(d => d.type === 'DON' && d.attachedTo === uiState.selectedCardId!).length;
                  return attached >= cond.count;
                }
                if (cond.type === 'HasRestingDon') {
                  const hasAttachFromRested = eff.actions?.some(
                    (a: { type: string; from?: string }) => a.type === 'AttachDon' && a.from === 'rested',
                  );
                  if (hasAttachFromRested) {
                    const rested = allCards.filter(d => d.type === 'DON' && d.zone === 'donArea' && d.ownerId === activePlayerId && d.tapped && d.attachedTo === null).length;
                    return rested >= 1; // "up to N" — need ≥1 rested DON to activate
                  }
                  const active = allCards.filter(d => d.type === 'DON' && d.zone === 'donArea' && d.ownerId === activePlayerId && !d.tapped && d.attachedTo === null).length;
                  return active >= cond.count;
                }
                return true;
              });

              const canActivate = conditionMet && !alreadyUsed;
              const tooltip = alreadyUsed ? 'Déjà activé ce tour' : !conditionMet ? 'Conditions non remplies' : undefined;

              return (
                <button
                  style={{ ...primaryBtn, background: canActivate ? '#2a1a4a' : '#1a1a2a', border: `1px solid ${canActivate ? '#8844cc' : '#443355'}`, color: canActivate ? '#cc88ff' : '#665577', cursor: canActivate ? 'pointer' : 'not-allowed' }}
                  disabled={!canActivate}
                  title={tooltip}
                  onClick={() => onAction({ type: 'ActivatedAbility', playerId: activePlayerId, cardId: uiState.selectedCardId! } satisfies ActivatedAbilityAction)}>
                  Activer{alreadyUsed ? ' ✓' : ''}
                </button>
              );
            })()}

            <button style={btnStyle} onClick={() => onAction({ type: 'EndPhase', playerId: activePlayerId })}>
              Fin de tour →
            </button>
          </>
        )}

        {/* ── [Opponent's Turn] Activate — inactive player's EndOfOpponentTurn abilities ── */}
        {phase === 'Main' && activeCombat === null && uiState.selectedCardId !== null && (() => {
          const selCard = gameState.cards[uiState.selectedCardId];
          const oppTurnEffects = (selCard?.effects ?? []).filter(
            (e) => e.trigger === 'Activated' && (e as { timing?: string }).timing === 'OpponentTurn',
          );
          if (oppTurnEffects.length === 0) return null;
          const cardOwner = selCard?.ownerId;
          if (cardOwner === undefined || cardOwner === activePlayerId) return null;
          if (myPlayerId !== null && cardOwner !== myPlayerId) return null;
          const cardOwnerPlayer = gameState.players[cardOwner];
          const isOnBoard = cardOwnerPlayer !== undefined &&
            (cardOwnerPlayer.board.includes(uiState.selectedCardId) || cardOwnerPlayer.leader === uiState.selectedCardId);
          if (!isOnBoard) return null;

          const alreadyUsed = gameState.activatedAbilityIds.includes(uiState.selectedCardId);
          const allCards = Object.values(gameState.cards);
          const conditionMet = oppTurnEffects.some((eff) => {
            const cond = eff.condition;
            if (!cond || cond.type === 'Always') return true;
            if (cond.type === 'HasAttachedDon') {
              const attached = allCards.filter(d => d.type === 'DON' && d.attachedTo === uiState.selectedCardId!).length;
              return attached >= cond.count;
            }
            if (cond.type === 'HasRestingDon') {
              const active = allCards.filter(d => d.type === 'DON' && d.zone === 'donArea' && d.ownerId === cardOwner && !d.tapped && d.attachedTo === null).length;
              return active >= cond.count;
            }
            return true;
          });

          const canActivate = conditionMet && !alreadyUsed;
          return (
            <button
              style={{ ...primaryBtn, background: canActivate ? '#1a2a1a' : '#1a1a2a', border: `1px solid ${canActivate ? '#44aa44' : '#334433'}`, color: canActivate ? '#88ee88' : '#557755', cursor: canActivate ? 'pointer' : 'not-allowed' }}
              disabled={!canActivate}
              title={alreadyUsed ? 'Déjà activé ce tour' : !conditionMet ? 'Conditions non remplies' : undefined}
              onClick={() => onAction({ type: 'ActivatedAbility', playerId: cardOwner, cardId: uiState.selectedCardId! } satisfies ActivatedAbilityAction)}>
              Activer [↩ Adv.]{alreadyUsed ? ' ✓' : ''}
            </button>
          );
        })()}

        {/* ── Combat ───────────────────────────────────────────────────── */}

        {/* Combat power summary — hidden while any pending interaction blocks the Block step */}
        {activeCombat !== null && !isCombatPaused && (() => {
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

        {/* Combat: defender actions — hidden while any pending interaction blocks the Block step */}
        {activeCombat !== null && !isCombatPaused && (!myPlayerId || amIDefender) && (() => {
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

        {/* Attacker resolves — hidden while any pending interaction blocks combat resolution */}
        {activeCombat !== null && !isCombatPaused && isMyTurn && !!myPlayerId && !amIDefender && (
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

        {/* ── OnKO interaction for inactive player (e.g. Zoro KO'd during opponent's attack) ── */}
        {!isMyTurn && uiState.selectionMode === 'resolveOnKO' && uiState.onKOInteraction &&
          (!myPlayerId || gameState.pendingOnKOInteraction?.playerId === myPlayerId) && (
          <>
            <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#ff9955' }}>
              Effet [On K.O.] : jouez{
                uiState.onKOInteraction.filter.color ? ` un personnage ${uiState.onKOInteraction.filter.color}` : ' un personnage'
              }{
                uiState.onKOInteraction.filter.maxPower !== undefined ? ` ≤${uiState.onKOInteraction.filter.maxPower}` : ''
              } depuis votre main (surligné)
            </span>
            <button style={btnStyle} onClick={() => onAction({ type: 'ResolveOnKOInteraction', playerId: myPlayerId!, cardId: null })}>
              Passer
            </button>
          </>
        )}

      </div>
    </div>
  );
}
