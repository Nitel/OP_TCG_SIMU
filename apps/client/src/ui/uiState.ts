import type { CardId, DeckFilter, GameAction, HandFilter } from 'game-engine';

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
  | 'searchDeck';

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
    filter: HandFilter;
    count: number;
    sourceCardId: CardId;
    selectedCardIds: CardId[];
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
    destination: 'hand' | 'board';
  };
}

export const IDLE_UI: UIState = {
  selectedCardId: null,
  selectionMode: null,
  errorMessage: null,
};
