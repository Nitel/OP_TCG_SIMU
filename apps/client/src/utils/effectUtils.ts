import type { CardEffect } from 'game-engine';

/**
 * Returns the Choose* target scope required by an effect, if any.
 * Used to determine whether the UI needs to ask the player to select a target
 * before dispatching an action.
 *
 * @param effects - The card's effect list
 * @param trigger - If provided, only inspect effects matching this trigger
 */
export function getEffectTargetScope(
  effects: readonly CardEffect[],
  trigger?: string,
): 'ChooseOpponentCharacter' | 'ChooseOwnCharacter' | null {
  for (const eff of effects) {
    if (trigger !== undefined && eff.trigger !== trigger) continue;
    for (const action of eff.actions) {
      if ('target' in action) {
        const scope = (action as { target: { scope: string } }).target.scope;
        if (scope === 'ChooseOpponentCharacter') return 'ChooseOpponentCharacter';
        if (scope === 'ChooseOwnCharacter') return 'ChooseOwnCharacter';
      }
    }
  }
  return null;
}
