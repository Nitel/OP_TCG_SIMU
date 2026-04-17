import type { CardId } from 'game-engine';

export type SelectionMode = 'play' | 'attack' | 'assignDon' | 'declareBlock';

export interface UIState {
  selectedCardId: CardId | null;
  selectionMode: SelectionMode | null;
  errorMessage: string | null;
}

export const IDLE_UI: UIState = {
  selectedCardId: null,
  selectionMode: null,
  errorMessage: null,
};
