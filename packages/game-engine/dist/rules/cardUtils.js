// ─── hasKeyword ───────────────────────────────────────────────────────────────
/**
 * Returns true if `card` has `kw` as a permanent or temporary keyword.
 */
export function hasKeyword(card, kw) {
    return (card.keywords ?? []).includes(kw) ||
        (card.temporaryKeywords ?? []).includes(kw);
}
// ─── calculatePower ───────────────────────────────────────────────────────────
/**
 * Total power of a card = base power + 1 000 per DON!! attached + powerModifier.
 */
export function calculatePower(cardId, state) {
    const card = state.cards[cardId];
    if (card === undefined)
        return 0;
    const donAttached = Object.values(state.cards).filter((c) => c.type === 'DON' && c.attachedTo === cardId).length;
    return card.power + donAttached * 1000 + (card.powerModifier ?? 0);
}
// ─── clearPowerModifiers ──────────────────────────────────────────────────────
/**
 * Clear `powerModifier` on a set of card IDs (e.g. at end of battle or turn).
 */
export function clearPowerModifiers(state, cardIds) {
    const updatedCards = { ...state.cards };
    let changed = false;
    for (const id of cardIds) {
        if (updatedCards[id]?.powerModifier !== undefined) {
            const { powerModifier: _pm, ...rest } = updatedCards[id];
            void _pm;
            updatedCards[id] = rest;
            changed = true;
        }
    }
    if (!changed)
        return state;
    return { ...state, cards: updatedCards };
}
// ─── clearTemporaryKeywords ───────────────────────────────────────────────────
/**
 * Remove all `temporaryKeywords` from every card in state (called at end of turn).
 */
export function clearTemporaryKeywords(state) {
    const updatedCards = { ...state.cards };
    let changed = false;
    for (const [id, card] of Object.entries(state.cards)) {
        if (card.temporaryKeywords !== undefined && card.temporaryKeywords.length > 0) {
            const { temporaryKeywords: _tk, ...rest } = card;
            void _tk;
            updatedCards[id] = rest;
            changed = true;
        }
    }
    if (!changed)
        return state;
    return { ...state, cards: updatedCards };
}
// ─── sendToTrash ──────────────────────────────────────────────────────────────
/**
 * Move a card to its owner's trash.
 * Any DON attached to it are detached and returned to donArea (untapped).
 * Does NOT trigger OnKO effects — callers must do that separately.
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
    // Move card to trash, clear power modifier
    const { powerModifier: _trashPm, ...cardNoModifier } = card;
    void _trashPm;
    updatedCards[cardId] = { ...cardNoModifier, zone: 'trash' };
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
// ─── drawCards ────────────────────────────────────────────────────────────────
/**
 * Draw up to `count` cards from the given player's deck to hand.
 * If deck runs out, draws what remains (no error — callers handle empty deck separately).
 */
export function drawCards(state, playerId, count) {
    const player = state.players[playerId];
    if (player === undefined)
        return state;
    const actual = Math.min(count, player.deck.length);
    if (actual === 0)
        return state;
    const drawn = player.deck.slice(0, actual);
    const remaining = player.deck.slice(actual);
    const updatedCards = { ...state.cards };
    for (const id of drawn) {
        updatedCards[id] = { ...updatedCards[id], zone: 'hand' };
    }
    return {
        ...state,
        cards: updatedCards,
        players: {
            ...state.players,
            [playerId]: {
                ...player,
                deck: remaining,
                hand: [...player.hand, ...drawn],
            },
        },
    };
}
// ─── returnToHand ─────────────────────────────────────────────────────────────
/**
 * Return a board card to its owner's hand.
 * Detaches any DON attached to it.
 */
export function returnToHand(state, cardId) {
    const card = state.cards[cardId];
    if (card === undefined || card.zone !== 'board')
        return state;
    const owner = state.players[card.ownerId];
    if (owner === undefined)
        return state;
    const updatedCards = { ...state.cards };
    // Detach DON
    for (const [id, c] of Object.entries(state.cards)) {
        if (c.type === 'DON' && c.attachedTo === cardId) {
            updatedCards[id] = { ...c, attachedTo: null, tapped: false };
        }
    }
    const { powerModifier: _pm, ...cardWithoutModifier } = card;
    void _pm;
    updatedCards[cardId] = { ...cardWithoutModifier, zone: 'hand', tapped: false };
    const updatedOwner = {
        ...owner,
        board: owner.board.filter((id) => id !== cardId),
        hand: [...owner.hand, cardId],
    };
    return {
        ...state,
        cards: updatedCards,
        players: { ...state.players, [card.ownerId]: updatedOwner },
    };
}
//# sourceMappingURL=cardUtils.js.map