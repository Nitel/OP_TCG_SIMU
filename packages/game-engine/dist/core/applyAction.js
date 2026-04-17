import { makeGameError } from '../types/index.js';
import { resolveCombat } from '../rules/combat.js';
// ─── Phase helpers ────────────────────────────────────────────────────────────
/** Draw up to 2 DON!! from donDeck → donArea for the active player. */
function applyDonDraw(state, playerId) {
    const player = state.players[playerId];
    if (player === undefined)
        return state;
    const count = Math.min(2, player.donDeck.length);
    if (count === 0)
        return state;
    const drawn = player.donDeck.slice(0, count);
    const remaining = player.donDeck.slice(count);
    const updatedCards = { ...state.cards };
    for (const id of drawn) {
        updatedCards[id] = { ...updatedCards[id], zone: 'donArea' };
    }
    return {
        ...state,
        cards: updatedCards,
        players: {
            ...state.players,
            [playerId]: {
                ...player,
                donDeck: remaining,
                donArea: [...player.donArea, ...drawn],
            },
        },
    };
}
/** Untap leader, all board cards, and all DON in donArea for a player. */
function applyRefresh(state, playerId) {
    const player = state.players[playerId];
    if (player === undefined)
        return state;
    const updatedCards = { ...state.cards };
    if (player.leader !== null) {
        updatedCards[player.leader] = { ...updatedCards[player.leader], tapped: false };
    }
    for (const id of player.board) {
        updatedCards[id] = { ...updatedCards[id], tapped: false };
    }
    for (const id of player.donArea) {
        updatedCards[id] = { ...updatedCards[id], tapped: false };
    }
    return {
        ...state,
        cards: updatedCards,
    };
}
/** Return all assigned DON to donArea (detach + untap) at end of turn. */
function applyReturnDon(state, playerId) {
    const player = state.players[playerId];
    if (player === undefined)
        return state;
    const updatedCards = { ...state.cards };
    for (const id of player.donArea) {
        updatedCards[id] = { ...updatedCards[id], attachedTo: null, tapped: false };
    }
    return {
        ...state,
        cards: updatedCards,
    };
}
// ─── DrawCard (legacy) ────────────────────────────────────────────────────────
function applyDrawCard(state, action) {
    const player = state.players[action.playerId];
    if (player === undefined) {
        return makeGameError('UNKNOWN_PLAYER', `Player ${action.playerId} not found`);
    }
    if (player.deck.length === 0) {
        return makeGameError('EMPTY_DECK', `Player ${action.playerId} has no cards left in deck`);
    }
    const [drawnCardId, ...remainingDeck] = player.deck;
    const updatedCard = { ...state.cards[drawnCardId], zone: 'hand' };
    const updatedPlayer = {
        ...player,
        deck: remainingDeck,
        hand: [...player.hand, drawnCardId],
    };
    return {
        ...state,
        cards: { ...state.cards, [drawnCardId]: updatedCard },
        players: { ...state.players, [action.playerId]: updatedPlayer },
    };
}
// ─── StartGame ────────────────────────────────────────────────────────────────
function buildPlayerState(setup, allCards) {
    // Leader
    const leader = { ...setup.leaderCard, zone: 'leader', ownerId: setup.id, tapped: false, attachedTo: null };
    allCards[leader.id] = leader;
    // DON!! deck
    const donIds = [];
    for (const don of setup.donCards) {
        const donCard = { ...don, zone: 'donDeck', ownerId: setup.id, tapped: false, attachedTo: null };
        allCards[don.id] = donCard;
        donIds.push(don.id);
    }
    // Main deck in draw order
    const deckOrdered = setup.deckCards.map((c) => ({
        ...c,
        zone: 'deck',
        ownerId: setup.id,
        tapped: false,
        attachedTo: null,
    }));
    for (const c of deckOrdered) {
        allCards[c.id] = c;
    }
    // Top 5 → life (face-down)
    const lifeIds = deckOrdered.slice(0, 5).map((c) => c.id);
    for (const id of lifeIds) {
        allCards[id] = { ...allCards[id], zone: 'life' };
    }
    // Next 5 → starting hand
    const handIds = deckOrdered.slice(5, 10).map((c) => c.id);
    for (const id of handIds) {
        allCards[id] = { ...allCards[id], zone: 'hand' };
    }
    // Rest stays in deck
    const remainingDeckIds = deckOrdered.slice(10).map((c) => c.id);
    return {
        id: setup.id,
        leader: leader.id,
        life: lifeIds,
        deck: remainingDeckIds,
        hand: handIds,
        board: [],
        donDeck: donIds,
        donArea: [],
        trash: [],
    };
}
function applyStartGame(_state, action) {
    const { player1, player2, firstPlayerId } = action;
    if (player1.id === player2.id) {
        return makeGameError('DUPLICATE_PLAYER', 'Both players cannot have the same ID');
    }
    if (firstPlayerId !== player1.id && firstPlayerId !== player2.id) {
        return makeGameError('UNKNOWN_PLAYER', `First player "${firstPlayerId}" is not in the game`);
    }
    if (player1.deckCards.length < 10) {
        return makeGameError('INVALID_DECK', 'Player 1 deck must have at least 10 cards (5 life + 5 hand)');
    }
    if (player2.deckCards.length < 10) {
        return makeGameError('INVALID_DECK', 'Player 2 deck must have at least 10 cards (5 life + 5 hand)');
    }
    const allCards = {};
    const p1State = buildPlayerState(player1, allCards);
    const p2State = buildPlayerState(player2, allCards);
    return {
        cards: allCards,
        players: {
            [player1.id]: p1State,
            [player2.id]: p2State,
        },
        playerOrder: [player1.id, player2.id],
        activePlayerId: firstPlayerId,
        phase: 'Refresh',
        turnNumber: 1,
        activeCombat: null,
        winner: null,
    };
}
// ─── DrawPhase ────────────────────────────────────────────────────────────────
function applyDrawPhase(state, action) {
    if (action.playerId !== state.activePlayerId) {
        return makeGameError('NOT_ACTIVE_PLAYER', `Player ${action.playerId} is not the active player`);
    }
    if (state.phase !== 'Draw') {
        return makeGameError('WRONG_PHASE', `DrawPhase requires Draw phase, current: ${state.phase}`);
    }
    const player = state.players[action.playerId];
    if (player === undefined) {
        return makeGameError('UNKNOWN_PLAYER', `Player ${action.playerId} not found`);
    }
    if (player.deck.length === 0) {
        return makeGameError('EMPTY_DECK', `Player ${action.playerId} has no cards left in deck`);
    }
    const [drawnCardId, ...remainingDeck] = player.deck;
    const updatedCard = { ...state.cards[drawnCardId], zone: 'hand' };
    const updatedPlayer = {
        ...player,
        deck: remainingDeck,
        hand: [...player.hand, drawnCardId],
    };
    const afterDraw = {
        ...state,
        phase: 'DON',
        cards: { ...state.cards, [drawnCardId]: updatedCard },
        players: { ...state.players, [action.playerId]: updatedPlayer },
    };
    return applyDonDraw(afterDraw, action.playerId);
}
// ─── PlayCharacterFromHand ────────────────────────────────────────────────────
function applyPlayCharacterFromHand(state, action) {
    if (action.playerId !== state.activePlayerId) {
        return makeGameError('NOT_ACTIVE_PLAYER', `Player ${action.playerId} is not the active player`);
    }
    if (state.phase !== 'Main') {
        return makeGameError('WRONG_PHASE', `PlayCharacterFromHand requires Main phase, current: ${state.phase}`);
    }
    const player = state.players[action.playerId];
    if (player === undefined) {
        return makeGameError('UNKNOWN_PLAYER', `Player ${action.playerId} not found`);
    }
    const card = state.cards[action.cardId];
    if (card === undefined) {
        return makeGameError('UNKNOWN_CARD', `Card ${action.cardId} not found`);
    }
    if (card.type !== 'Character') {
        return makeGameError('INVALID_CARD_TYPE', `Card ${action.cardId} is not a Character (got ${card.type})`);
    }
    if (!player.hand.includes(action.cardId)) {
        return makeGameError('CARD_NOT_IN_HAND', `Card ${action.cardId} is not in ${action.playerId}'s hand`);
    }
    // Active DON = in donArea, not tapped, not attached
    const activeDonIds = player.donArea.filter((donId) => {
        const don = state.cards[donId];
        return don !== undefined && !don.tapped && don.attachedTo === null;
    });
    if (activeDonIds.length < card.cost) {
        return makeGameError('INSUFFICIENT_DON', `Card costs ${card.cost} DON but only ${activeDonIds.length} active DON available`);
    }
    // Auto-rest exactly card.cost DON cards
    const donToRest = activeDonIds.slice(0, card.cost);
    const updatedCards = { ...state.cards };
    for (const donId of donToRest) {
        updatedCards[donId] = { ...updatedCards[donId], tapped: true };
    }
    updatedCards[action.cardId] = { ...card, zone: 'board' };
    const updatedPlayer = {
        ...player,
        hand: player.hand.filter((id) => id !== action.cardId),
        board: [...player.board, action.cardId],
    };
    return {
        ...state,
        cards: updatedCards,
        players: { ...state.players, [action.playerId]: updatedPlayer },
    };
}
// ─── AssignDon ────────────────────────────────────────────────────────────────
function applyAssignDon(state, action) {
    const player = state.players[action.playerId];
    if (player === undefined) {
        return makeGameError('UNKNOWN_PLAYER', `Player ${action.playerId} not found`);
    }
    const donCard = state.cards[action.donCardId];
    if (donCard === undefined) {
        return makeGameError('UNKNOWN_CARD', `DON card ${action.donCardId} not found`);
    }
    if (donCard.type !== 'DON') {
        return makeGameError('INVALID_CARD_TYPE', `Card ${action.donCardId} is not a DON card`);
    }
    if (!player.donArea.includes(action.donCardId)) {
        return makeGameError('DON_NOT_IN_AREA', `DON card ${action.donCardId} is not in ${action.playerId}'s donArea`);
    }
    if (donCard.attachedTo !== null) {
        return makeGameError('DON_ALREADY_ATTACHED', `DON card ${action.donCardId} is already attached to ${donCard.attachedTo}`);
    }
    const targetCard = state.cards[action.targetCardId];
    if (targetCard === undefined) {
        return makeGameError('UNKNOWN_CARD', `Target card ${action.targetCardId} not found`);
    }
    const onBoard = player.board.includes(action.targetCardId);
    const isLeader = player.leader === action.targetCardId;
    if (!onBoard && !isLeader) {
        return makeGameError('TARGET_NOT_ON_BOARD', `Target card ${action.targetCardId} is not on ${action.playerId}'s board or leader zone`);
    }
    return {
        ...state,
        cards: {
            ...state.cards,
            [action.donCardId]: { ...donCard, attachedTo: action.targetCardId },
        },
    };
}
// ─── EndPhase ─────────────────────────────────────────────────────────────────
const PHASE_SEQUENCE = ['Refresh', 'Draw', 'DON', 'Main', 'End'];
function applyEndPhase(state, action) {
    if (action.playerId !== state.activePlayerId) {
        return makeGameError('NOT_ACTIVE_PLAYER', `Player ${action.playerId} is not the active player`);
    }
    if (state.phase === 'End') {
        // Return all assigned DON for the current player
        let next = applyReturnDon(state, state.activePlayerId);
        // Switch active player, reset to Refresh, increment turn counter
        const currentIndex = next.playerOrder.indexOf(next.activePlayerId);
        const nextIndex = currentIndex === 0 ? 1 : 0;
        const nextPlayerId = next.playerOrder[nextIndex];
        next = {
            ...next,
            activePlayerId: nextPlayerId,
            phase: 'Refresh',
            turnNumber: next.turnNumber + 1,
        };
        // Untap the new active player's cards
        return applyRefresh(next, nextPlayerId);
    }
    const currentIndex = PHASE_SEQUENCE.indexOf(state.phase);
    const nextPhase = PHASE_SEQUENCE[currentIndex + 1];
    let next = { ...state, phase: nextPhase };
    // Entering DON phase via EndPhase (player skipped DrawPhase)
    if (nextPhase === 'DON') {
        next = applyDonDraw(next, state.activePlayerId);
    }
    return next;
}
// ─── DeclareAttack ────────────────────────────────────────────────────────────
function applyDeclareAttack(state, action) {
    if (action.playerId !== state.activePlayerId) {
        return makeGameError('NOT_ACTIVE_PLAYER', `Player ${action.playerId} is not the active player`);
    }
    if (state.phase !== 'Main') {
        return makeGameError('WRONG_PHASE', `DeclareAttack requires Main phase, current: ${state.phase}`);
    }
    if (state.activeCombat !== null) {
        return makeGameError('COMBAT_ALREADY_ACTIVE', 'Another combat is already pending resolution');
    }
    if (state.winner !== null) {
        return makeGameError('GAME_OVER', 'The game has already ended');
    }
    const player = state.players[action.playerId];
    if (player === undefined) {
        return makeGameError('UNKNOWN_PLAYER', `Player ${action.playerId} not found`);
    }
    const attacker = state.cards[action.attackerId];
    if (attacker === undefined) {
        return makeGameError('UNKNOWN_CARD', `Attacker ${action.attackerId} not found`);
    }
    if (attacker.tapped) {
        return makeGameError('ATTACKER_TAPPED', `Card ${action.attackerId} is rested and cannot attack`);
    }
    // Attacker must be on the active player's board or be their leader
    const onBoard = player.board.includes(action.attackerId);
    const isLeader = player.leader === action.attackerId;
    if (!onBoard && !isLeader) {
        return makeGameError('INVALID_ATTACKER', `Card ${action.attackerId} is not on ${action.playerId}'s board or leader zone`);
    }
    // Target must be on the opponent's board or be their leader
    const [p1, p2] = state.playerOrder;
    const opponentId = action.playerId === p1 ? p2 : p1;
    const opponent = state.players[opponentId];
    if (opponent === undefined) {
        return makeGameError('UNKNOWN_PLAYER', `Opponent not found`);
    }
    const target = state.cards[action.targetId];
    if (target === undefined) {
        return makeGameError('UNKNOWN_CARD', `Target ${action.targetId} not found`);
    }
    const targetOnBoard = opponent.board.includes(action.targetId);
    const targetIsLeader = opponent.leader === action.targetId;
    if (!targetOnBoard && !targetIsLeader) {
        return makeGameError('INVALID_TARGET', `Card ${action.targetId} is not a valid target on opponent's side`);
    }
    // Tap (rest) the attacker
    return {
        ...state,
        cards: {
            ...state.cards,
            [action.attackerId]: { ...attacker, tapped: true },
        },
        activeCombat: {
            attackerId: action.attackerId,
            targetId: action.targetId,
            blockerId: null,
        },
    };
}
// ─── DeclareBlock ─────────────────────────────────────────────────────────────
function applyDeclareBlock(state, action) {
    if (state.activeCombat === null) {
        return makeGameError('NO_ACTIVE_COMBAT', 'No attack has been declared yet');
    }
    if (state.activeCombat.blockerId !== null) {
        return makeGameError('BLOCKER_ALREADY_SET', 'A blocker has already been assigned');
    }
    if (action.playerId === state.activePlayerId) {
        return makeGameError('ACTIVE_PLAYER_CANNOT_BLOCK', 'Only the defending player can assign a blocker');
    }
    if (state.winner !== null) {
        return makeGameError('GAME_OVER', 'The game has already ended');
    }
    const player = state.players[action.playerId];
    if (player === undefined) {
        return makeGameError('UNKNOWN_PLAYER', `Player ${action.playerId} not found`);
    }
    const blocker = state.cards[action.blockerId];
    if (blocker === undefined) {
        return makeGameError('UNKNOWN_CARD', `Blocker ${action.blockerId} not found`);
    }
    if (!player.board.includes(action.blockerId)) {
        return makeGameError('INVALID_BLOCKER', `Card ${action.blockerId} is not on ${action.playerId}'s board`);
    }
    if (blocker.tapped) {
        return makeGameError('BLOCKER_TAPPED', `Card ${action.blockerId} is rested and cannot block`);
    }
    if (!(blocker.keywords ?? []).includes('Blocker')) {
        return makeGameError('NO_BLOCKER_KEYWORD', `Card ${action.blockerId} does not have the Blocker keyword`);
    }
    // Tap the blocker
    return {
        ...state,
        cards: {
            ...state.cards,
            [action.blockerId]: { ...blocker, tapped: true },
        },
        activeCombat: { ...state.activeCombat, blockerId: action.blockerId },
    };
}
// ─── ResolveCombat ────────────────────────────────────────────────────────────
function applyResolveCombat(state, action) {
    if (action.playerId !== state.activePlayerId) {
        return makeGameError('NOT_ACTIVE_PLAYER', `Player ${action.playerId} is not the active player`);
    }
    if (state.activeCombat === null) {
        return makeGameError('NO_ACTIVE_COMBAT', 'No attack has been declared yet');
    }
    if (state.winner !== null) {
        return makeGameError('GAME_OVER', 'The game has already ended');
    }
    return resolveCombat(state);
}
// ─── applyAction (dispatcher) ─────────────────────────────────────────────────
export function applyAction(state, action) {
    switch (action.type) {
        case 'DrawCard':
            return applyDrawCard(state, action);
        case 'StartGame':
            return applyStartGame(state, action);
        case 'DrawPhase':
            return applyDrawPhase(state, action);
        case 'PlayCharacterFromHand':
            return applyPlayCharacterFromHand(state, action);
        case 'AssignDon':
            return applyAssignDon(state, action);
        case 'EndPhase':
            return applyEndPhase(state, action);
        case 'DeclareAttack':
            return applyDeclareAttack(state, action);
        case 'DeclareBlock':
            return applyDeclareBlock(state, action);
        case 'ResolveCombat':
            return applyResolveCombat(state, action);
        default: {
            const _exhaustive = action;
            return makeGameError('UNKNOWN_ACTION', `Unknown action type: ${JSON.stringify(_exhaustive)}`);
        }
    }
}
//# sourceMappingURL=applyAction.js.map