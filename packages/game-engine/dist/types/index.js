// ─── Branded types ────────────────────────────────────────────────────────────
export function makeCardId(id) {
    return id;
}
export function makePlayerId(id) {
    return id;
}
export function isGameError(result) {
    return result.kind === 'GameError';
}
export function makeGameError(code, message) {
    return { kind: 'GameError', code, message };
}
// ─── Utilities ────────────────────────────────────────────────────────────────
/** Returns an empty placeholder GameState. Pass to applyAction(StartGame) to bootstrap. */
export function makeEmptyState(p1, p2) {
    const emptyPlayer = (id) => ({
        id,
        leader: null,
        life: [],
        deck: [],
        hand: [],
        board: [],
        donDeck: [],
        donArea: [],
        trash: [],
    });
    return {
        cards: {},
        players: {
            [p1]: emptyPlayer(p1),
            [p2]: emptyPlayer(p2),
        },
        playerOrder: [p1, p2],
        activePlayerId: p1,
        phase: 'Refresh',
        turnNumber: 0,
        activeCombat: null,
        winner: null,
        firstPlayerId: p1,
        mulliganDecided: [],
    };
}
//# sourceMappingURL=index.js.map