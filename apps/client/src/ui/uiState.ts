import type { CardId, GameAction, HandFilter } from 'game-engine';

export type SelectionMode =
  | 'play'
  | 'attack'
  | 'assignDon'
  | 'declareBlock'
  | 'playCounter'
  | 'chooseTarget'
  | 'resolveOnKO'
  | 'revealFromHand';

export interface UIState {
  selectedCardId: CardId | null;
  selectionMode: SelectionMode | null;
  errorMessage: string | null;
  /** Set when selectionMode === 'chooseTarget' — the action to dispatch once a target is picked */
  pendingTargetAction?: GameAction;
  /** Set when selectionMode === 'chooseTarget' — which pool the player must pick from */
  targetScope?: 'ChooseOpponentCharacter' | 'ChooseOwnCharacter';
  /** Set when selectionMode === 'resolveOnKO' — filter and source for the pending OnKO interaction */
  onKOInteraction?: { filter: HandFilter; sourceCardId: CardId };
  /** Set when selectionMode === 'revealFromHand' — filter, count, and in-progress selection */
  revealInteraction?: {
    filter: HandFilter;
    count: number;
    sourceCardId: CardId;
    selectedCardIds: CardId[];
  };
}

export const IDLE_UI: UIState = {
  selectedCardId: null,
  selectionMode: null,
  errorMessage: null,
};
