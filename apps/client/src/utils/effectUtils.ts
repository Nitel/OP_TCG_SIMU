import type { CardEffect } from 'game-engine';

/**
 * Returns the Choose* target scope required by an effect, if any.
 * Used to determine whether the UI needs to ask the player to select a target
 * before dispatching an action.
 *
 * @param effects - The card's effect list
 * @param trigger - If provided, only inspect effects matching this trigger
 */
type ChooseScope =
  | 'ChooseOpponentCharacter'
  | 'ChooseOwnCharacter'
  | 'ChooseOwnCharacterOrLeader'
  | 'ChooseOpponentCharacterOrLeader';

export function getEffectTargetScope(
  effects: readonly CardEffect[],
  trigger?: string,
): ChooseScope | null {
  const CHOOSE_SCOPES = new Set<string>([
    'ChooseOpponentCharacter',
    'ChooseOwnCharacter',
    'ChooseOwnCharacterOrLeader',
    'ChooseOpponentCharacterOrLeader',
  ]);
  for (const eff of effects) {
    if (trigger !== undefined && eff.trigger !== trigger) continue;
    for (const action of eff.actions) {
      if ('target' in action) {
        const scope = (action as { target: { scope: string } }).target.scope;
        if (CHOOSE_SCOPES.has(scope)) return scope as ChooseScope;
      }
    }
  }
  return null;
}
