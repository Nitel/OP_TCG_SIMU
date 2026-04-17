// ─── Power calculation ────────────────────────────────────────────────────────
/**
 * Total power of a card = base power + 1 000 per DON!! attached to it.
 */
export function calculatePower(cardId, state) {
    const card = state.cards[cardId];
    if (card === undefined)
        return 0;
    const donAttached = Object.values(state.cards).filter((c) => c.type === 'DON' && c.attachedTo === cardId).length;
    return card.power + donAttached * 1000;
}
// ─── KO helper ────────────────────────────────────────────────────────────────
/**
 * Move a card to its owner's trash.
 * Any DON attached to it are detached and returned to donArea (untapped).
 */
export function sendToTrash(state, cardId) {
    const card = state.cards[cardId];
    if (card === undefined)
        return state;
    const owner = state.players[card.ownerId];
    if (owner === undefined)
        return state;
    const updatedCards = { ...state.cards };
    // Detach DON attached to the KO'd card
    for (const [id, c] of Object.entries(state.cards)) {
        if (c.type === 'DON' && c.attachedTo === cardId) {
            updatedCards[id] = { ...c, attachedTo: null, tapped: false };
        }
    }
    // Move card to trash
    updatedCards[cardId] = { ...card, zone: 'trash' };
    const updatedOwner = {
        ...owner,
        board: owner.board.filter((id) => id !== cardId),
        trash: [...owner.trash, cardId],
    };
    return {
        ...state,
        cards: updatedCards,
        players: { ...state.players, [card.ownerId]: updatedOwner },
    };
}
// ─── Leader damage ────────────────────────────────────────────────────────────
/**
 * Apply one damage to the defending leader:
 * - If life is already empty → set winner to the attacking player.
 * - Otherwise reveal the top life card (move to defending player's hand).
 */
export function applyLeaderDamage(state, attackingPlayerId) {
    const [p1, p2] = state.playerOrder;
    const defendingPlayerId = attackingPlayerId === p1 ? p2 : p1;
    const defender = state.players[defendingPlayerId];
    if (defender === undefined)
        return state;
    if (defender.life.length === 0) {
        return { ...state, winner: attackingPlayerId };
    }
    // Reveal top life card → goes to hand (trigger detection handled later)
    const [revealedId, ...remainingLife] = defender.life;
    const revealedCard = state.cards[revealedId];
    if (revealedCard === undefined)
        return state;
    const updatedCards = {
        ...state.cards,
        [revealedId]: { ...revealedCard, zone: 'hand' },
    };
    const updatedDefender = {
        ...defender,
        life: remainingLife,
        hand: [...defender.hand, revealedId],
    };
    return {
        ...state,
        cards: updatedCards,
        players: { ...state.players, [defendingPlayerId]: updatedDefender },
    };
}
// ─── Combat resolution ────────────────────────────────────────────────────────
/**
 * Resolve the pending combat in `state.activeCombat`.
 * Returns a new GameState with activeCombat cleared and all outcomes applied.
 */
export function resolveCombat(state) {
    const combat = state.activeCombat;
    if (combat === null)
        return state;
    const { attackerId, targetId, blockerId, counterPower } = combat;
    let next = { ...state, activeCombat: null };
    const attackerPower = calculatePower(attackerId, state);
    if (blockerId !== null) {
        // ── Blocked combat: compare attacker vs blocker + counter ────────────────
        const blockerPower = calculatePower(blockerId, state) + counterPower;
        if (attackerPower >= blockerPower) {
            next = sendToTrash(next, blockerId); // blocker KO'd
        }
        else {
            next = sendToTrash(next, attackerId); // attacker KO'd
        }
    }
    else {
        // ── Unblocked attack ─────────────────────────────────────────────────────
        const target = state.cards[targetId];
        if (target === undefined)
            return next;
        const defenderPower = calculatePower(targetId, state) + counterPower;
        if (attackerPower >= defenderPower) {
            if (target.type === 'Leader') {
                const attacker = state.cards[attackerId];
                if (attacker !== undefined) {
                    next = applyLeaderDamage(next, attacker.ownerId);
                }
            }
            else {
                // Character vs Character (unblocked): attacker wins ties
                next = sendToTrash(next, targetId);
            }
        }
        // attacker power < defender power + counter → attack blocked, nothing happens
    }
    return next;
}
//# sourceMappingURL=combat.js.map