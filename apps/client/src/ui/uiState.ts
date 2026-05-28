import type { CardId, DeckFilter, GameAction, HandFilter, PlayerId } from 'game-engine';

export type SelectionMode =
  | 'play'
  | 'attack'
  | 'assignDon'
  | 'declareBlock'
  | 'playCounter'
  | 'chooseTarget'
  | 'resolveOnKO'
  | 'revealFromHand'
  | 'trashFromHand'
  | 'searchDeck'
  | 'forceDiscard'
  | 'koSubstitute';

export interface UIState {
  selectedCardId: CardId | null;
  selectionMode: SelectionMode | null;
  errorMessage: string | null;
  /** Set when selectionMode === 'chooseTarget' — the action to dispatch once a target is picked */
  pendingTargetAction?: GameAction;
  /** Set when selectionMode === 'chooseTarget' — which pool the player must pick from */
  targetScope?: 'ChooseOpponentCharacter' | 'ChooseOwnCharacter' | 'ChooseOwnCharacterOrLeader' | 'ChooseOpponentCharacterOrLeader';
  /** Set when selectionMode === 'resolveOnKO' — filter and source for the pending OnKO interaction */
  onKOInteraction?: { filter: HandFilter; sourceCardId: CardId };
  /** Set when selectionMode === 'revealFromHand' — filter, count, and in-progress selection */
  revealInteraction?: {
    filter?: HandFilter; // absent for deck-sourced reveals
    count: number;
    sourceCardId: CardId;
    selectedCardIds: CardId[];
    /** True when the player may skip even with enough matching cards ("You may"). */
    optional?: true;
    /** For deck-sourced reveals: IDs of the auto-revealed cards (still in deck zone) */
    revealedDeckCardIds?: readonly CardId[];
  };
  /** Set when selectionMode === 'trashFromHand' — filter and in-progress selection */
  trashInteraction?: {
    filter: HandFilter;
    sourceCardId: CardId;
    selectedCardIds: CardId[];
  };
  /** Set when selectionMode === 'searchDeck' — the top N revealed cards the player must choose from */
  searchInteraction?: {
    revealedCardIds: readonly CardId[];
    filter: DeckFilter;
    destination: 'hand' | 'board' | 'bottomOfDeck' | 'TopOfLife';
    maxSelect?: number;
    /** 'trash' when cards are drawn from the player's trash (multi-select return) */
    source?: 'trash';
    /** Accumulates player's selections for trash multi-select */
    selectedCardIds?: CardId[];
  };
  /** Set when selectionMode === 'forceDiscard' — opponent must choose N cards to discard */
  forceDiscardInteraction?: {
    count: number;
    playerId: PlayerId;
    selectedCardIds: CardId[];
  };
  /** Set when selectionMode === 'koSubstitute' — card owner may discard to prevent KO */
  koSubstituteInteraction?: {
    cardId: CardId;
    playerId: PlayerId;
    filter: HandFilter;
    sourceCardId: CardId;
    /** For external protection (Group 1): the card offering the protection */
    protectorCardId?: CardId;
    /** How the player pays: 'TrashFromHand' = choose a hand card; 'Auto' = just confirm */
    costType: 'TrashFromHand' | 'Auto';
    /** Human-readable cost label shown in the overlay */
    costLabel: string;
  };
  /** Set when a ForceAttack is pending — the card that must attack this turn */
  forcedAttackerId?: CardId;
}

export const IDLE_UI: UIState = {
  selectedCardId: null,
  selectionMode: null,
  errorMessage: null,
};
