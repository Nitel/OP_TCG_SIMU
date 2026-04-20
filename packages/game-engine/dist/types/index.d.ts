declare const __cardId: unique symbol;
export type CardId = string & {
    readonly [__cardId]: true;
};
declare const __playerId: unique symbol;
export type PlayerId = string & {
    readonly [__playerId]: true;
};
export declare function makeCardId(id: string): CardId;
export declare function makePlayerId(id: string): PlayerId;
export type Zone = 'deck' | 'hand' | 'board' | 'leader' | 'life' | 'donDeck' | 'donArea' | 'trash';
export type CardColor = 'Red' | 'Blue' | 'Green' | 'Purple' | 'Black' | 'Yellow';
export type CardType = 'Leader' | 'Character' | 'Event' | 'Stage' | 'DON';
export type GamePhase = 'Mulligan' | 'Refresh' | 'Draw' | 'DON' | 'Main' | 'End';
export type CardKeyword = 'Rush' | 'Blocker' | 'Banish' | 'DoubleAttack' | 'Unblockable';
export type TargetSelector = {
    readonly scope: 'Self';
} | {
    readonly scope: 'Attacker';
} | {
    readonly scope: 'OriginalTarget';
} | {
    readonly scope: 'AllOpponentCharacters';
} | {
    readonly scope: 'AllOwnCharacters';
} | {
    readonly scope: 'OpponentLeader';
} | {
    readonly scope: 'OwnLeader';
} | {
    readonly scope: 'ChooseOpponentCharacter';
    readonly maxCost?: number;
    readonly maxPower?: number;
} | {
    readonly scope: 'ChooseOwnCharacter';
    readonly maxCost?: number;
    readonly maxPower?: number;
};
export type EffectDuration = 'EndOfTurn' | 'EndOfBattle' | 'Permanent';
export type DeckFilter = {
    readonly kind: 'Any';
} | {
    readonly kind: 'ByType';
    readonly cardType: 'Character' | 'Event' | 'Stage';
} | {
    readonly kind: 'ByCost';
    readonly maxCost: number;
} | {
    readonly kind: 'ByName';
    readonly name: string;
};
export type EffectAction = {
    readonly type: 'Draw';
    readonly count: number;
} | {
    readonly type: 'KO';
    readonly target: TargetSelector;
} | {
    readonly type: 'ReturnToHand';
    readonly target: TargetSelector;
} | {
    readonly type: 'PowerBoost';
    readonly amount: number;
    readonly target: TargetSelector;
    readonly duration: EffectDuration;
} | {
    readonly type: 'TrashCard';
    readonly count: number;
    readonly from: 'OpponentHand' | 'OwnHand';
} | {
    readonly type: 'AddLife';
    readonly count: number;
} | {
    readonly type: 'GiveDon';
    readonly count: number;
} | {
    readonly type: 'SearchDeck';
    readonly filter: DeckFilter;
    readonly destination: 'hand' | 'board';
} | {
    readonly type: 'TakeLifeToHand';
    readonly count: number;
} | {
    readonly type: 'AttachDon';
    readonly count: number;
    readonly target: TargetSelector;
} | {
    readonly type: 'GainKeyword';
    readonly keyword: CardKeyword;
    readonly target: TargetSelector;
    readonly duration: EffectDuration;
} | {
    readonly type: 'Rest';
    readonly target: TargetSelector;
} | {
    readonly type: 'RemoveLife';
    readonly count: number;
} | {
    readonly type: 'PlaySelf';
};
export type EffectTrigger = 'OnPlay' | 'OnAttack' | 'OnKO' | 'OnBlock' | 'Trigger' | 'Activated';
export type EffectCondition = {
    readonly type: 'Always';
} | {
    readonly type: 'TurnCount';
    readonly min?: number;
    readonly max?: number;
} | {
    readonly type: 'HasRestingDon';
    readonly count: number;
};
export interface CardEffect {
    readonly trigger: EffectTrigger;
    readonly condition?: EffectCondition;
    readonly actions: readonly EffectAction[];
}
export interface Card {
    readonly id: CardId;
    readonly name: string;
    readonly cost: number;
    readonly power: number;
    readonly color: CardColor;
    readonly type: CardType;
    readonly zone: Zone;
    readonly ownerId: PlayerId;
    readonly tapped: boolean;
    /** DON cards only: ID of the character card this DON is attached to, or null */
    readonly attachedTo: CardId | null;
    /** Keywords: 'Blocker', 'Rush', 'DoubleAttack', 'Unblockable', 'Banish' */
    readonly keywords?: readonly CardKeyword[];
    /** Counter value: power boost this card provides when played from hand during combat */
    readonly counter?: number;
    /** DSL-encoded card effects (OnPlay, OnAttack, OnKO, Trigger, …) */
    readonly effects?: readonly CardEffect[];
    /**
     * Temporary power modifier (e.g. OnAttack PowerBoost).
     * Added to calculatePower; cleared at end of battle (EndOfBattle) or end of turn (EndOfTurn).
     */
    readonly powerModifier?: number;
    /** Temporary keywords granted by GainKeyword effects — cleared at end of turn */
    readonly temporaryKeywords?: readonly CardKeyword[];
}
export interface PlayerState {
    readonly id: PlayerId;
    readonly leader: CardId | null;
    readonly life: readonly CardId[];
    readonly deck: readonly CardId[];
    readonly hand: readonly CardId[];
    readonly board: readonly CardId[];
    readonly donDeck: readonly CardId[];
    /** Active DON cards (includes attached DON, identified by card.attachedTo !== null) */
    readonly donArea: readonly CardId[];
    readonly trash: readonly CardId[];
}
export interface CombatState {
    /** The attacking card (already tapped) */
    readonly attackerId: CardId;
    /** The original declared target (character or leader) */
    readonly targetId: CardId;
    /** Blocker assigned by the defending player, or null if unblocked */
    readonly blockerId: CardId | null;
    /** Total counter power played by the defending player from hand */
    readonly counterPower: number;
}
export interface GameState {
    readonly cards: Readonly<Record<CardId, Card>>;
    readonly players: Readonly<Record<PlayerId, PlayerState>>;
    readonly playerOrder: readonly [PlayerId, PlayerId];
    readonly activePlayerId: PlayerId;
    readonly phase: GamePhase;
    readonly turnNumber: number;
    /** Pending combat waiting for block decision / resolution, or null */
    readonly activeCombat: CombatState | null;
    /** Set to the winning player's ID when the game ends, null otherwise */
    readonly winner: PlayerId | null;
    /** ID of the player who goes first (used for first-turn restrictions) */
    readonly firstPlayerId: PlayerId;
    /** Players who have already made their mulligan decision */
    readonly mulliganDecided: readonly PlayerId[];
}
export interface PlayerSetup {
    readonly id: PlayerId;
    /** The leader card for this player */
    readonly leaderCard: Card;
    /** The 50-card main deck, in draw order (index 0 = top) */
    readonly deckCards: readonly Card[];
    /** The 10 DON!! cards */
    readonly donCards: readonly Card[];
}
/** Active player decides to keep or reshuffle their starting hand (Mulligan phase) */
export interface MulliganAction {
    readonly type: 'Mulligan';
    readonly playerId: PlayerId;
    readonly keep: boolean;
}
/** Legacy low-level draw — usable outside phase restrictions */
export interface DrawCardAction {
    readonly type: 'DrawCard';
    readonly playerId: PlayerId;
}
/** Create a new game from two player setups */
export interface StartGameAction {
    readonly type: 'StartGame';
    readonly player1: PlayerSetup;
    readonly player2: PlayerSetup;
    readonly firstPlayerId: PlayerId;
}
/** Active player draws 1 card (must be in Draw phase) */
export interface DrawPhaseAction {
    readonly type: 'DrawPhase';
    readonly playerId: PlayerId;
}
/** Play a Character card from hand to board, paying its DON cost */
export interface PlayCharacterFromHandAction {
    readonly type: 'PlayCharacterFromHand';
    readonly playerId: PlayerId;
    readonly cardId: CardId;
}
/** Attach one DON card from donArea to a character on the board (or leader) */
export interface AssignDonAction {
    readonly type: 'AssignDon';
    readonly playerId: PlayerId;
    readonly donCardId: CardId;
    readonly targetCardId: CardId;
}
/** Advance to the next phase (or next player's turn if in End phase) */
export interface EndPhaseAction {
    readonly type: 'EndPhase';
    readonly playerId: PlayerId;
}
/**
 * Active player taps an attacker and declares a target (character or leader).
 * Must be in Main phase. Sets activeCombat.
 */
export interface DeclareAttackAction {
    readonly type: 'DeclareAttack';
    readonly playerId: PlayerId;
    readonly attackerId: CardId;
    readonly targetId: CardId;
}
/**
 * Defending player assigns a Blocker card to redirect the attack.
 * Only valid while activeCombat is pending and no blocker is set yet.
 */
export interface DeclareBlockAction {
    readonly type: 'DeclareBlock';
    readonly playerId: PlayerId;
    readonly blockerId: CardId;
}
/**
 * Active player resolves the pending combat (after blocker decision).
 * Compares powers, applies KO / leader damage, clears activeCombat.
 */
export interface ResolveCombatAction {
    readonly type: 'ResolveCombat';
    readonly playerId: PlayerId;
}
/**
 * Defending player plays a card from hand as counter during combat.
 * The card's counter value is added to the defender's power for this combat.
 * The card goes to trash.
 */
export interface PlayCounterAction {
    readonly type: 'PlayCounter';
    readonly playerId: PlayerId;
    readonly cardId: CardId;
}
export type GameAction = MulliganAction | DrawCardAction | StartGameAction | DrawPhaseAction | PlayCharacterFromHandAction | AssignDonAction | EndPhaseAction | DeclareAttackAction | DeclareBlockAction | ResolveCombatAction | PlayCounterAction;
export interface GameError {
    readonly kind: 'GameError';
    readonly code: string;
    readonly message: string;
}
export type ActionResult = GameState | GameError;
export declare function isGameError(result: ActionResult): result is GameError;
export declare function makeGameError(code: string, message: string): GameError;
/** Returns an empty placeholder GameState. Pass to applyAction(StartGame) to bootstrap. */
export declare function makeEmptyState(p1: PlayerId, p2: PlayerId): GameState;
export {};
//# sourceMappingURL=index.d.ts.map