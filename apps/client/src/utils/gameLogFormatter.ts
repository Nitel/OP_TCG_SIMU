import type { GameLogEntry } from 'game-engine';

/**
 * Compact event prefix mapping:
 *
 * Event                   Prefix   Meaning
 * ──────────────────────  ──────   ──────────────────────────────────────────
 * KO                       ⚔       Card KO'd (battle or effect)
 * ON_KO_TRIGGER            ↯       OnKO effect triggered for a card
 * EFFECT_CANDIDATES        …       Eligible hand cards listed for player choice
 * PROMPT_CREATED           ?       Interactive prompt opened (awaiting choice)
 * EFFECT_SKIPPED           –       Effect skipped (no eligible cards in hand)
 * PLAYER_CHOICE            ✓       Player chose a card or skipped
 * CARD_PLAYED_VIA_EFFECT   →       Card played from hand via effect
 * QUEUED_TRIGGER           ⏳      Queued trigger promoted to active prompt
 */
const EVENT_TAG: Record<GameLogEntry['event'], string> = {
  KO:                    '⚔',
  ON_KO_TRIGGER:         '↯',
  EFFECT_CANDIDATES:     '…',
  PROMPT_CREATED:        '?',
  EFFECT_SKIPPED:        '–',
  PLAYER_CHOICE:         '✓',
  CARD_PLAYED_VIA_EFFECT:'→',
  QUEUED_TRIGGER:        '⏳',
};

export function formatGameLogEntry(entry: GameLogEntry): string {
  return `${EVENT_TAG[entry.event] ?? '·'} ${entry.message}`;
}
