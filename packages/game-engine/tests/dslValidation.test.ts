/**
 * DSL Schema Validation — all 304 effect files in packages/data/effects/*.json
 *
 * Catches: typos in type names, invalid keywords/scopes/durations, unknown action/condition types.
 * Does NOT catch semantic bugs (wrong condition type that is syntactically valid).
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EFFECTS_DIR = path.join(__dirname, '../../data/effects');

const VALID_TRIGGERS = new Set([
  'Activated', 'OnPlay', 'OnAttack', 'OnBlock', 'OnKO', 'OnLeaveField', 'Trigger',
  'StartOfTurn', 'StartOfOpponentTurn', 'StartOfMainPhase', 'EndOfTurn',
]);
const VALID_CONDITIONS = new Set([
  'Always', 'TurnCount', 'HasRestingDon', 'HasAttachedDon', 'LeaderHasAttachedDon',
]);
const VALID_ACTIONS = new Set([
  'Draw', 'KO', 'ReturnToHand', 'PowerBoost', 'TrashCard', 'AddLife',
  'GiveDon', 'TakeLifeToHand', 'AttachDon', 'GainKeyword', 'Rest',
  'RemoveLife', 'PlaySelf', 'SearchDeck',
]);
const VALID_KEYWORDS = new Set(['Rush', 'Blocker', 'DoubleAttack', 'Banish', 'Trigger']);
const VALID_SCOPES = new Set([
  'Self', 'Attacker', 'OriginalTarget',
  'AllOwnCharacters', 'AllOwnCharactersAndLeader',
  'AllOpponentCharacters',
  'OpponentLeader', 'OwnLeader',
  'ChooseOwnCharacter', 'ChooseOpponentCharacter',
]);
const VALID_DURATIONS = new Set(['EndOfTurn', 'EndOfBattle', 'EndOfOpponentTurn', 'Permanent']);
const VALID_FILTER_KINDS = new Set(['Any', 'ByType', 'ByCost', 'ByName']);
const VALID_CARD_TYPES = new Set(['Character', 'Event', 'Stage']);

describe('DSL Schema Validation', () => {
  const files = fs.readdirSync(EFFECTS_DIR).filter((f) => f.endsWith('.json')).sort();

  it('at least 300 effect files found', () => {
    expect(files.length).toBeGreaterThanOrEqual(300);
  });

  for (const file of files) {
    it(file, () => {
      const raw = fs.readFileSync(path.join(EFFECTS_DIR, file), 'utf-8');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const def = JSON.parse(raw) as any;

      for (const [ei, effect] of (def.effects ?? []).entries()) {
        const lbl = `${file} effects[${ei}]`;

        expect(VALID_TRIGGERS, `${lbl}.trigger "${effect.trigger}"`).toContain(effect.trigger);

        if (effect.condition != null) {
          expect(VALID_CONDITIONS, `${lbl}.condition.type "${effect.condition.type}"`).toContain(
            effect.condition.type,
          );
        }

        for (const [ai, action] of (effect.actions ?? []).entries()) {
          const albl = `${lbl} actions[${ai}]`;

          expect(VALID_ACTIONS, `${albl}.type "${action.type}"`).toContain(action.type);

          if (action.keyword != null) {
            expect(VALID_KEYWORDS, `${albl}.keyword "${action.keyword}"`).toContain(action.keyword);
          }
          if (action.duration != null) {
            expect(VALID_DURATIONS, `${albl}.duration "${action.duration}"`).toContain(
              action.duration,
            );
          }
          if (action.target?.scope != null) {
            expect(VALID_SCOPES, `${albl}.target.scope "${action.target.scope}"`).toContain(
              action.target.scope,
            );
          }
          if (action.filter?.kind != null) {
            expect(VALID_FILTER_KINDS, `${albl}.filter.kind "${action.filter.kind}"`).toContain(
              action.filter.kind,
            );
          }
          if (action.filter?.cardType != null) {
            expect(
              VALID_CARD_TYPES,
              `${albl}.filter.cardType "${action.filter.cardType}"`,
            ).toContain(action.filter.cardType);
          }
        }
      }
    });
  }
});
