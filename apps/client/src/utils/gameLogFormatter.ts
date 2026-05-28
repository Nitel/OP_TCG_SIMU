import type { GameLogEntry } from 'game-engine';

const EVENT_TAG: Record<GameLogEntry['event'], string> = {
  // Legacy
  KO:                    '⚔',
  ON_KO_TRIGGER:         '↯',
  EFFECT_CANDIDATES:     '…',
  PROMPT_CREATED:        '?',
  EFFECT_SKIPPED:        '–',
  PLAYER_CHOICE:         '✓',
  CARD_PLAYED_VIA_EFFECT:'→',
  QUEUED_TRIGGER:        '⏳',
  // Player actions
  CARD_PLAYED:           '▶',
  DON_ATTACHED:          '+',
  ATTACK_DECLARED:       '⚡',
  BLOCKER_DECLARED:      '🛡',
  COUNTER_USED:          '↑',
  TURN_ENDED:            '⏩',
  ABILITY_ACTIVATED:     '★',
  REVEAL_ACKNOWLEDGED:   '👁',
  REVEAL_FROM_HAND_CHOSEN:'✋',
  REVEAL_SKIPPED:        '↷',
  TARGET_CHOSEN:         '◎',
  TARGET_SKIPPED:        '○',
  // Effect engine
  EFFECT_TRIGGERED:      '⚙',
  POWER_BOOST_APPLIED:   '↑',
  POWER_BOOST_EXPIRED:   '↓',
  // Combat
  COMBAT_RESOLVED:       '⚔',
  DAMAGE_DEALT:          '❤',
};

export function formatGameLogEntry(entry: GameLogEntry): string {
  const tag = EVENT_TAG[entry.event] ?? '·';
  const turn = entry.turn !== undefined ? `T${entry.turn} ` : '';
  return `${turn}${tag} ${entry.message}`;
}
