import { calculatePower, sendToTrash, drawCards, returnToHand } from '../rules/cardUtils.js';
// ─── Target selection ─────────────────────────────────────────────────────────
/**
 * Resolve a TargetSelector to a list of CardIds.
 * For "Choose" selectors: auto-selects the first valid card (stubs behaviour).
 */
function selectTargets(selector, context, state) {
    const [p1, p2] = state.playerOrder;
    const opponentId = context.sourcePlayerId === p1 ? p2 : p1;
    const ownPlayer = state.players[context.sourcePlayerId];
    const opponent = state.players[opponentId];
    switch (selector.scope) {
        case 'Self':
            return [context.sourceCardId];
        case 'Attacker':
            return state.activeCombat !== null ? [state.activeCombat.attackerId] : [];
        case 'OriginalTarget':
            return state.activeCombat !== null ? [state.activeCombat.targetId] : [];
        case 'OpponentLeader':
            return opponent?.leader !== null && opponent?.leader !== undefined
                ? [opponent.leader]
                : [];
        case 'OwnLeader':
            return ownPlayer?.leader !== null && ownPlayer?.leader !== undefined
                ? [ownPlayer.leader]
                : [];
        case 'AllOpponentCharacters':
            return opponent?.board ?? [];
        case 'AllOwnCharacters':
            return ownPlayer?.board ?? [];
        case 'ChooseOpponentCharacter': {
            // Auto-select: first opponent character satisfying optional filters
            const candidates = (opponent?.board ?? []).filter((id) => {
                const card = state.cards[id];
                if (card === undefined)
                    return false;
                if (selector.maxCost !== undefined && card.cost > selector.maxCost)
                    return false;
                if (selector.maxPower !== undefined && calculatePower(id, state) > selector.maxPower)
                    return false;
                return true;
            });
            return candidates.length > 0 ? [candidates[0]] : [];
        }
        case 'ChooseOwnCharacter': {
            const candidates = (ownPlayer?.board ?? []).filter((id) => {
                const card = state.cards[id];
                if (card === undefined)
                    return false;
                if (selector.maxCost !== undefined && card.cost > selector.maxCost)
                    return false;
                if (selector.maxPower !== undefined && calculatePower(id, state) > selector.maxPower)
                    return false;
                return true;
            });
            return candidates.length > 0 ? [candidates[0]] : [];
        }
    }
}
// ─── Single action resolver ───────────────────────────────────────────────────
function resolveAction(action, context, state) {
    const [p1, p2] = state.playerOrder;
    const opponentId = context.sourcePlayerId === p1 ? p2 : p1;
    switch (action.type) {
        // ── Draw ──────────────────────────────────────────────────────────────────
        case 'Draw':
            return drawCards(state, context.sourcePlayerId, action.count);
        // ── KO ───────────────────────────────────────────────────────────────────
        case 'KO': {
            const targets = selectTargets(action.target, context, state);
            let next = state;
            for (const id of targets) {
                next = sendToTrash(next, id);
                // Note: OnKO effects of the KO'd card are NOT re-triggered here
                // to avoid infinite recursion. Callers (combat.ts) handle top-level OnKO.
            }
            return next;
        }
        // ── ReturnToHand ──────────────────────────────────────────────────────────
        case 'ReturnToHand': {
            const targets = selectTargets(action.target, context, state);
            let next = state;
            for (const id of targets) {
                next = returnToHand(next, id);
            }
            return next;
        }
        // ── PowerBoost ────────────────────────────────────────────────────────────
        case 'PowerBoost': {
            const targets = selectTargets(action.target, context, state);
            if (targets.length === 0)
                return state;
            const updatedCards = { ...state.cards };
            for (const id of targets) {
                const card = state.cards[id];
                if (card !== undefined) {
                    updatedCards[id] = {
                        ...card,
                        powerModifier: (card.powerModifier ?? 0) + action.amount,
                    };
                }
            }
            return { ...state, cards: updatedCards };
        }
        // ── TrashCard (force discard) ──────────────────────────────────────────────
        case 'TrashCard': {
            const targetPlayerId = action.from === 'OpponentHand' ? opponentId : context.sourcePlayerId;
            const targetPlayer = state.players[targetPlayerId];
            if (targetPlayer === undefined || targetPlayer.hand.length === 0)
                return state;
            // Discard up to `count` cards (pick from the end — arbitrary for stubs)
            const count = Math.min(action.count, targetPlayer.hand.length);
            const toDiscard = targetPlayer.hand.slice(-count);
            const updatedCards = { ...state.cards };
            for (const id of toDiscard) {
                updatedCards[id] = { ...updatedCards[id], zone: 'trash' };
            }
            const updatedPlayer = {
                ...targetPlayer,
                hand: targetPlayer.hand.slice(0, targetPlayer.hand.length - count),
                trash: [...targetPlayer.trash, ...toDiscard],
            };
            return {
                ...state,
                cards: updatedCards,
                players: { ...state.players, [targetPlayerId]: updatedPlayer },
            };
        }
        // ── AddLife ───────────────────────────────────────────────────────────────
        case 'AddLife': {
            const player = state.players[context.sourcePlayerId];
            if (player === undefined || player.deck.length === 0)
                return state;
            const count = Math.min(action.count, player.deck.length);
            const newLife = player.deck.slice(0, count);
            const remaining = player.deck.slice(count);
            const updatedCards = { ...state.cards };
            for (const id of newLife) {
                updatedCards[id] = { ...updatedCards[id], zone: 'life' };
            }
            const updatedPlayer = {
                ...player,
                deck: remaining,
                life: [...player.life, ...newLife],
            };
            return {
                ...state,
                cards: updatedCards,
                players: { ...state.players, [context.sourcePlayerId]: updatedPlayer },
            };
        }
        // ── GiveDon ───────────────────────────────────────────────────────────────
        case 'GiveDon': {
            // Give opponent DON!! cards from their donDeck
            const opponent = state.players[opponentId];
            if (opponent === undefined || opponent.donDeck.length === 0)
                return state;
            const count = Math.min(action.count, opponent.donDeck.length);
            const drawn = opponent.donDeck.slice(0, count);
            const remaining = opponent.donDeck.slice(count);
            const updatedCards = { ...state.cards };
            for (const id of drawn) {
                updatedCards[id] = { ...updatedCards[id], zone: 'donArea' };
            }
            const updatedOpponent = {
                ...opponent,
                donDeck: remaining,
                donArea: [...opponent.donArea, ...drawn],
            };
            return {
                ...state,
                cards: updatedCards,
                players: { ...state.players, [opponentId]: updatedOpponent },
            };
        }
        // ── SearchDeck ────────────────────────────────────────────────────────────
        case 'SearchDeck': {
            // Find the first card in deck matching the filter
            const player = state.players[context.sourcePlayerId];
            if (player === undefined || player.deck.length === 0)
                return state;
            const foundIdx = player.deck.findIndex((id) => {
                const card = state.cards[id];
                if (card === undefined)
                    return false;
                switch (action.filter.kind) {
                    case 'Any': return true;
                    case 'ByType': return card.type === action.filter.cardType;
                    case 'ByCost': return card.cost <= action.filter.maxCost;
                    case 'ByName': return card.name === action.filter.name;
                }
            });
            if (foundIdx === -1)
                return state;
            const foundId = player.deck[foundIdx];
            const newDeck = player.deck.filter((_, i) => i !== foundIdx);
            const dest = action.destination === 'hand' ? 'hand' : 'board';
            const updatedCards = {
                ...state.cards,
                [foundId]: { ...state.cards[foundId], zone: dest },
            };
            const updatedPlayer = {
                ...player,
                deck: newDeck,
                hand: dest === 'hand' ? [...player.hand, foundId] : player.hand,
                board: dest === 'board' ? [...player.board, foundId] : player.board,
            };
            return {
                ...state,
                cards: updatedCards,
                players: { ...state.players, [context.sourcePlayerId]: updatedPlayer },
            };
        }
    }
}
// ─── Public API ───────────────────────────────────────────────────────────────
/**
 * Filter and resolve all effects matching `trigger` from the given list.
 * Returns the updated GameState after all matching effects are applied in order.
 */
export function resolveEffects(effects, trigger, context, state) {
    let next = state;
    for (const effect of effects) {
        if (effect.trigger !== trigger)
            continue;
        // Evaluate optional condition
        if (effect.condition !== undefined) {
            const cond = effect.condition;
            if (cond.type === 'TurnCount') {
                const t = next.turnNumber;
                if (cond.min !== undefined && t < cond.min)
                    continue;
                if (cond.max !== undefined && t > cond.max)
                    continue;
            }
            if (cond.type === 'HasRestingDon') {
                const player = next.players[context.sourcePlayerId];
                const resting = (player?.donArea ?? []).filter((id) => {
                    const d = next.cards[id];
                    return d !== undefined && d.tapped && d.attachedTo === null;
                }).length;
                if (resting < cond.count)
                    continue;
            }
            // 'Always' → always passes
        }
        for (const action of effect.actions) {
            next = resolveAction(action, context, next);
        }
    }
    return next;
}
//# sourceMappingURL=effectResolver.js.map