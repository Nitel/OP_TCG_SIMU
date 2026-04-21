import type { CardId, GameAction } from 'game-engine';

export type SelectionMode =
  | 'play'
  | 'attack'
  | 'assignDon'
  | 'declareBlock'
  | 'playCounter'
  | 'chooseTarget';

export interface UIState {
  selectedCardId: CardId | null;
  selectionMode: SelectionMode | null;
  errorMessage: string | null;
  /** Set when selectionMode === 'chooseTarget' — the action to dispatch once a target is picked */
  pendingTargetAction?: GameAction;
  /** Set when selectionMode === 'chooseTarget' — which pool the player must pick from */
  targetScope?: 'ChooseOpponentCharacter' | 'ChooseOwnCharacter';
}

export const IDLE_UI: UIState = {
  selectedCardId: null,
  selectionMode: null,
  errorMessage: null,
};
