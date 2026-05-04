import json
import re

ROOT = '/Users/valentinnahim/Documents/sideproj/OP_TCG_SIMU'
sets_arg = ['ST-11','ST-12','ST-13','ST-14','ST-15','ST-21','ST-22','EB-01','EB-02','EB-03']
import sys
sets = sys.argv[1:] if len(sys.argv) > 1 else sets_arg

KEYWORD_TAG = re.compile(r'^(Rush|Blocker|Banish|Double Attack|Unblockable)$', re.I)

def extract_trigger(text):
    remaining = text
    trigger = None
    don_count = None
    while remaining.startswith('['):
        m = re.match(r'^\[([^\]]+)\]\s*', remaining)
        if not m:
            break
        tag = m.group(1).strip()
        remaining = remaining[len(m.group(0)):]
        don_m = re.match(r'^DON!! x(\d)$', tag, re.I)
        if don_m:
            don_count = int(don_m.group(1))
            continue
        if re.match(r'^once per turn$', tag, re.I):
            continue
        if re.match(r'^your turn$', tag, re.I):
            continue
        if re.match(r"^opponent", tag, re.I) and 'turn' in tag.lower():
            continue
        if KEYWORD_TAG.match(tag):
            trigger = 'SKIP'
            break
        TRIGGER_MAP = [
            (r'^on play$', 'OnPlay'),
            (r'^on k', 'OnKO'),
            (r'^when attacking$', 'OnAttack'),
            (r'^when attacked$', 'OnAttacked'),
            (r'^on your opponent', 'OnAttacked'),
            (r'^counter$', 'Counter'),
            (r'^trigger$', 'Trigger'),
            (r'^on block$', 'OnBlock'),
            (r'^activate', 'Activated'),
            (r'^main$', 'OnPlay'),
            (r'^end of', 'EndOfTurn'),
            (r'^start of', 'StartOfTurn'),
        ]
        matched = False
        for pat, trig in TRIGGER_MAP:
            if re.match(pat, tag, re.I):
                trigger = trig
                matched = True
                break
        if not matched:
            trigger = None
        break
    if trigger is None and don_count is not None:
        trigger = 'Activated'
        remaining = re.sub(r'^(\[[^\]]+\]\s*)+', '', text)
    return trigger, remaining

COMPLEX_PATTERNS = [
    re.compile(r'you (may|can) .{5,60}:', re.I),
    re.compile(r'if you have', re.I),
    re.compile(r'if your', re.I),
    re.compile(r'cannot be K\.O\.', re.I),
    re.compile(r'when your opponent', re.I),
    re.compile(r'can also attack', re.I),
    re.compile(r'cannot attack', re.I),
    re.compile(r'Look at', re.I),
    re.compile(r'place .{5,40} at the bottom', re.I),
]

def is_complex(text):
    if 'DON!!' in text:
        if re.search(r'DON!! [-−]\d', text):
            return True
    if 'other than [' in text:
        return True
    return any(p.search(text) for p in COMPLEX_PATTERNS)

total = 0
rule_ok = 0
no_effect = 0
llm_needed = 0
misses = []

for setf in sets:
    with open('%s/packages/data/raw/%s.json' % (ROOT, setf)) as f:
        cards = json.load(f)
    for card in cards:
        total += 1
        e = (card.get('effectText') or '').strip()
        t = (card.get('triggerText') or '').strip()
        if (not e or e == '-') and not t:
            no_effect += 1
            rule_ok += 1
            continue
        can_parse = True
        if e and e != '-':
            blocks = re.split(r'<br\s*/?>', e, flags=re.I)
        else:
            blocks = []
        for block in blocks:
            trimmed = re.sub(r'\s*\([^)]{15,}\)\s*$', '', block.strip()).strip()
            if not trimmed:
                continue
            trigger, body = extract_trigger(trimmed)
            if trigger is None:
                can_parse = False
                break
            if trigger == 'SKIP':
                continue
            if is_complex(body):
                can_parse = False
                break
        if can_parse:
            rule_ok += 1
        else:
            llm_needed += 1
            if len(misses) < 15:
                misses.append((card['id'], (e or '')[:100]))

pct = 100 * rule_ok // total
print('Coverage: %s' % ', '.join(sets))
print('  Total:       %d' % total)
print('  Rule parser: %d (%d%%)' % (rule_ok, pct))
print('  No effect:   %d' % no_effect)
print('  LLM needed:  %d (%d%%)' % (llm_needed, 100 * llm_needed // total))
print()
print('Sample LLM cases:')
for cid, text in misses:
    print('  %s  %s' % (cid, text[:90]))
