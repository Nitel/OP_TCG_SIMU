import { useState, useMemo, useRef } from 'react';
import type { CSSProperties } from 'react';
import type { CardTemplate, SavedDeck } from '../data/deckBuilder';
import { ALL_CARD_TEMPLATES, saveDeckToStorage } from '../data/deckBuilder';

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  initialDeck?: SavedDeck;
  onSave: (deck: SavedDeck) => void;
  onCancel: () => void;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const COLOR_HEX: Record<string, string> = {
  Red: '#cc2222', Blue: '#2266cc', Green: '#22aa44',
  Purple: '#8833cc', Black: '#444455', Yellow: '#ccaa22',
};

const s: Record<string, CSSProperties> = {
  root: {
    minHeight: '100vh', background: '#07071a', fontFamily: 'monospace',
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
  },
  topBar: {
    display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
    padding: '10px 20px', background: '#0d0d24',
    borderBottom: '1px solid #2a2a4a', flexShrink: 0,
  },
  nameInput: {
    background: '#111128', border: '1px solid #2a2a4a', borderRadius: 4,
    color: '#ccddee', fontFamily: 'monospace', fontSize: 14,
    padding: '5px 10px', width: 'clamp(120px, 30%, 220px)',
  },
  btn: {
    padding: '5px 14px', fontFamily: 'monospace', fontSize: 12,
    border: '1px solid #445566', borderRadius: 4, cursor: 'pointer',
    background: '#1a2a3a', color: '#ccddee',
  },
  saveBtn: {
    padding: '5px 14px', fontFamily: 'monospace', fontSize: 12, fontWeight: 'bold',
    border: '1px solid #44aa66', borderRadius: 4, cursor: 'pointer',
    background: '#0a3a1a', color: '#88ffaa',
  },
  body: {
    display: 'flex', flex: 1, overflow: 'hidden',
  },
  left: {
    flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden',
    borderRight: '1px solid #2a2a4a',
  },
  filterBar: {
    display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap',
    padding: '8px 14px', background: '#0a0a1a', borderBottom: '1px solid #1a1a3a', flexShrink: 0,
  },
  filterInput: {
    background: '#111128', border: '1px solid #2a2a4a', borderRadius: 4,
    color: '#ccddee', fontFamily: 'monospace', fontSize: 12, padding: '4px 8px',
    width: 'clamp(100px, 25%, 160px)',
  },
  cardGrid: {
    display: 'flex', flexWrap: 'wrap', gap: 6,
    padding: 12, overflowY: 'auto', flex: 1, alignContent: 'flex-start',
  },
  right: {
    width: 'clamp(200px, 22%, 280px)', display: 'flex', flexDirection: 'column', overflow: 'hidden',
    background: '#0a0a1a',
  },
  deckHeader: {
    padding: '10px 14px', borderBottom: '1px solid #1a1a3a', flexShrink: 0,
  },
  deckList: {
    flex: 1, overflowY: 'auto', padding: '8px 12px',
  },
};

// ─── Filter pill ──────────────────────────────────────────────────────────────

function Pill({ label, active, color, onClick }: {
  label: string; active: boolean; color?: string | undefined; onClick: () => void;
}) {
  return (
    <button
      style={{
        padding: '3px 10px', borderRadius: 12, cursor: 'pointer', fontSize: 11,
        fontFamily: 'monospace',
        border: active ? `1px solid ${color ?? '#44aaff'}` : '1px solid #2a2a4a',
        background: active ? (color ? `${color}22` : '#0a2a4a') : '#111128',
        color: active ? (color ?? '#88ccff') : '#556677',
        fontWeight: active ? 'bold' : 'normal',
      }}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

// ─── Large card preview popup (position: fixed, pointer-events: none) ────────

const PREVIEW_W = 200;
const PREVIEW_H = 280;

function CardPreviewPopup({ tpl, x, y }: { tpl: CardTemplate; x: number; y: number }) {
  const [imgErr, setImgErr] = useState(false);
  return (
    <div style={{
      position: 'fixed', left: x, top: y,
      width: PREVIEW_W, zIndex: 100,
      background: '#0d0d24', border: '2px solid #3355aa',
      borderRadius: 6, overflow: 'hidden',
      boxShadow: '0 8px 32px rgba(0,0,0,0.85)',
      pointerEvents: 'none',
    }}>
      {!imgErr ? (
        <img
          src={tpl.isParallel ? `/card-images/${tpl.id}_p1.png` : `/card-images/${tpl.id}.png`}
          alt={tpl.name}
          style={{ width: '100%', height: PREVIEW_H, objectFit: 'cover', display: 'block' }}
          onError={() => setImgErr(true)}
        />
      ) : (
        <div style={{
          width: '100%', height: PREVIEW_H, display: 'flex', alignItems: 'center',
          justifyContent: 'center', padding: 12, boxSizing: 'border-box',
          background: COLOR_HEX[tpl.color] ? `${COLOR_HEX[tpl.color]}33` : '#1a2a3a',
          fontSize: 13, color: '#aabbcc', textAlign: 'center',
        }}>
          {tpl.name}
        </div>
      )}
      <div style={{ padding: '6px 10px', background: '#0a0a1c' }}>
        <div style={{ fontSize: 11, color: '#ccddee', fontWeight: 'bold' }}>{tpl.name}</div>
        <div style={{ fontSize: 10, color: '#556677', marginTop: 2 }}>
          {tpl.type} · Coût {tpl.cost}
          {tpl.power > 0 ? ` · ${tpl.power}` : ''}
          {tpl.counter !== null ? ` · +${tpl.counter}` : ''}
        </div>
        {tpl.keywords.length > 0 && (
          <div style={{ fontSize: 9, color: '#88aacc', marginTop: 2 }}>
            {tpl.keywords.join(' · ')}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Card thumbnail in grid ───────────────────────────────────────────────────

function GridCard({ tpl, count, onAdd, colorMismatch = false, onHoverStart, onHoverEnd }: {
  tpl: CardTemplate; count: number; onAdd: () => void; colorMismatch?: boolean;
  onHoverStart: (rect: DOMRect) => void; onHoverEnd: () => void;
}) {
  const [imgErr, setImgErr] = useState(false);
  const atMax = count >= 4 || (tpl.type === 'Leader' && count >= 1);
  const disabled = atMax || colorMismatch;
  const templateId = tpl.id;
  const title = colorMismatch
    ? `${tpl.name} — couleur incompatible avec le leader`
    : `${tpl.name} · ${tpl.type} · Coût ${tpl.cost}${tpl.power > 0 ? ` · ${tpl.power}` : ''}${tpl.counter !== null ? ` · +${tpl.counter}` : ''}`;

  return (
    <div
      style={{
        position: 'relative', width: 64, height: 90,
        cursor: disabled ? 'default' : 'pointer',
        opacity: colorMismatch ? 0.15 : atMax ? 0.45 : 1,
        borderRadius: 3, overflow: 'hidden',
        border: count > 0 ? '2px solid #44aa66' : '1px solid #2a2a4a',
        flexShrink: 0,
      }}
      title={title}
      onClick={() => { if (!disabled) onAdd(); }}
      onMouseEnter={e => onHoverStart(e.currentTarget.getBoundingClientRect())}
      onMouseLeave={onHoverEnd}
    >
      {!imgErr ? (
        <img
          src={tpl.isParallel ? `/card-images/${templateId}_p1.png` : `/card-images/${templateId}.png`}
          alt={tpl.name}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          onError={() => setImgErr(true)}
        />
      ) : (
        <div style={{
          width: '100%', height: '100%', display: 'flex', alignItems: 'center',
          justifyContent: 'center', fontSize: 9, color: '#aabbcc', textAlign: 'center',
          padding: 4, boxSizing: 'border-box', wordBreak: 'break-word',
          background: COLOR_HEX[tpl.color] ? `${COLOR_HEX[tpl.color]}33` : '#1a2a3a',
        }}>
          {tpl.name}
        </div>
      )}
      {count > 0 && (
        <div style={{
          position: 'absolute', bottom: 2, right: 3,
          background: 'rgba(0,0,0,0.8)', borderRadius: 2,
          fontSize: 11, color: '#88ffaa', fontWeight: 'bold', padding: '0 3px',
        }}>
          ×{count}
        </div>
      )}
      {tpl.type === 'Leader' && (
        <div style={{
          position: 'absolute', top: 2, left: 2,
          background: 'rgba(0,0,0,0.7)', borderRadius: 2,
          fontSize: 8, color: '#ffee44', padding: '0 2px',
        }}>
          LDR
        </div>
      )}
      {tpl.name.includes('(Parallel)') && (
        <div style={{
          position: 'absolute', top: 2, right: 2,
          background: 'rgba(180,130,0,0.85)', borderRadius: 2,
          fontSize: 8, color: '#fff8cc', padding: '0 3px', fontWeight: 'bold',
        }}>
          P
        </div>
      )}
    </div>
  );
}

// ─── Import popup ─────────────────────────────────────────────────────────────

function ImportPopup({ onImport, onClose }: {
  onImport: (text: string) => void; onClose: () => void;
}) {
  const [text, setText] = useState('');
  const [clipErr, setClipErr] = useState('');

  const pasteFromClipboard = async () => {
    try {
      const content = await navigator.clipboard.readText();
      setText(content);
      setClipErr('');
    } catch {
      setClipErr('Accès au presse-papier refusé — collez manuellement (Ctrl+V).');
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50,
    }}>
      <div style={{
        background: '#0d0d24', border: '1px solid #2a2a5a', borderRadius: 8,
        padding: 24, width: '90vw', maxWidth: 480, display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        <div style={{ fontSize: 13, color: '#88ccff', fontWeight: 'bold' }}>
          Importer un deck (texte)
        </div>
        <div style={{ fontSize: 11, color: '#556677', lineHeight: 1.6 }}>
          Format accepté (une entrée par ligne) :<br />
          <code style={{ color: '#aabbcc' }}>4 OP01-005</code> ·{' '}
          <code style={{ color: '#aabbcc' }}>4x OP01-005</code> ·{' '}
          <code style={{ color: '#aabbcc' }}>4 ST21-007 Sentomaru</code><br />
          Le leader est détecté automatiquement. Les cartes hors couleur du leader sont ignorées.
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={s.btn} onClick={() => { void pasteFromClipboard(); }}>
            Coller depuis le presse-papier ↓
          </button>
          {clipErr !== '' && (
            <span style={{ fontSize: 10, color: '#cc6644', alignSelf: 'center' }}>{clipErr}</span>
          )}
        </div>
        <textarea
          style={{
            background: '#111128', border: '1px solid #2a2a4a', borderRadius: 4,
            color: '#ccddee', fontFamily: 'monospace', fontSize: 12, padding: 8,
            height: 220, resize: 'vertical',
          }}
          placeholder={'1 OP01-001\n4 OP01-005\n4 OP01-007\n...\n\nou avec noms :\n1 ST21-001 Monkey.D.Luffy\n4 ST21-004 Jewelry Bonney'}
          value={text}
          onChange={e => setText(e.currentTarget.value)}
        />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button style={s.btn} onClick={onClose}>Annuler</button>
          <button style={s.saveBtn} onClick={() => { onImport(text); onClose(); }}>
            Importer
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── DeckBuilder ─────────────────────────────────────────────────────────────

export function DeckBuilder({ initialDeck, onSave, onCancel }: Props) {
  const [deckName, setDeckName]     = useState(initialDeck?.name ?? 'Mon deck');
  const [leaderId, setLeaderId]     = useState<string | null>(initialDeck?.leaderId ?? null);
  const [counts, setCounts]         = useState<Record<string, number>>(() => {
    const m: Record<string, number> = {};
    initialDeck?.cards.forEach(({ id, count }) => { m[id] = count; });
    return m;
  });
  const [filterColor, setFilterColor] = useState<string | null>(null);
  const [filterType, setFilterType]   = useState<string | null>(null);
  const [filterCost, setFilterCost]   = useState<number | null>(null);
  const [search, setSearch]           = useState('');
  const [showImport, setShowImport]   = useState(false);

  // Hover preview
  const [preview, setPreview] = useState<{ tpl: CardTemplate; x: number; y: number } | null>(null);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleHoverStart = (tpl: CardTemplate, rect: DOMRect) => {
    if (previewTimerRef.current !== null) clearTimeout(previewTimerRef.current);
    previewTimerRef.current = setTimeout(() => {
      const totalPreviewH = PREVIEW_H + 52; // image + info band
      let x = rect.right + 12;
      if (x + PREVIEW_W > window.innerWidth) x = rect.left - PREVIEW_W - 12;
      let y = rect.top + rect.height / 2 - totalPreviewH / 2;
      y = Math.max(8, Math.min(y, window.innerHeight - totalPreviewH - 8));
      setPreview({ tpl, x, y });
    }, 500);
  };

  const handleHoverEnd = () => {
    if (previewTimerRef.current !== null) { clearTimeout(previewTimerRef.current); previewTimerRef.current = null; }
    setPreview(null);
  };

  const totalCards = Object.values(counts).reduce((s, n) => s + n, 0);
  const isValid    = leaderId !== null && totalCards === 50;

  const leaderTpl = leaderId !== null
    ? (ALL_CARD_TEMPLATES.find(t => t.id === leaderId) ?? null)
    : null;

  // Colors allowed in the deck, derived from the selected leader
  const allowedColors = useMemo((): Set<string> | null => {
    if (leaderTpl === null) return null;
    return new Set(leaderTpl.color.split(' '));
  }, [leaderTpl]);

  // Filtered card list
  const filtered = useMemo(() => {
    return ALL_CARD_TEMPLATES.filter((t) => {
      if (filterColor !== null && t.color !== filterColor) return false;
      if (filterType !== null && t.type !== filterType) return false;
      if (filterCost !== null && t.cost !== filterCost) return false;
      if (search.length > 0) {
        const q = search.toLowerCase();
        if (!t.name.toLowerCase().includes(q) && !t.id.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [filterColor, filterType, filterCost, search]);

  // Sorted deck entries
  const deckEntries = useMemo(() => {
    return Object.entries(counts)
      .filter(([, n]) => n > 0)
      .map(([id, count]) => ({ id, count, tpl: ALL_CARD_TEMPLATES.find(t => t.id === id) }))
      .filter((e): e is { id: string; count: number; tpl: CardTemplate } => e.tpl !== undefined);
  }, [counts]);

  // Number of deck entries with a color that doesn't match the leader
  const mismatchCount = useMemo(() => {
    if (allowedColors === null) return 0;
    return deckEntries.filter(({ tpl }) => !allowedColors.has(tpl.color)).reduce((sum, e) => sum + e.count, 0);
  }, [deckEntries, allowedColors]);

  const addCard = (tpl: CardTemplate) => {
    if (tpl.type === 'Leader') {
      setLeaderId(tpl.id);
      return;
    }
    // Block cards whose color isn't in the leader's allowed colors
    if (allowedColors !== null && !allowedColors.has(tpl.color)) return;
    setCounts(prev => {
      const cur = prev[tpl.id] ?? 0;
      if (cur >= 4 || totalCards >= 50) return prev;
      return { ...prev, [tpl.id]: cur + 1 };
    });
  };

  const removeCard = (id: string) => {
    setCounts(prev => {
      const cur = prev[id] ?? 0;
      if (cur <= 0) return prev;
      const next = { ...prev, [id]: cur - 1 };
      if (next[id] === 0) delete next[id];
      return next;
    });
  };

  const handleImport = (text: string) => {
    // Support any set prefix: OP, ST, EB, P, C, etc.
    // Also supports optional card name after the ID: "4 OP01-005 Card Name"
    const re = /(\d+)[xX×]?\s+([A-Z]+\d{2}-\d{3})/g;
    const newCounts: Record<string, number> = {};
    let newLeader: string | null = null;
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      const count = parseInt(match[1] ?? '1', 10);
      const id    = match[2] ?? '';
      const tpl   = ALL_CARD_TEMPLATES.find(t => t.id === id);
      if (tpl === undefined) continue;
      if (tpl.type === 'Leader') { newLeader = id; continue; }
      newCounts[id] = Math.min((newCounts[id] ?? 0) + count, 4);
    }

    // Determine which colors are allowed based on the imported/existing leader
    const resolvedLeaderId = newLeader ?? leaderId;
    const resolvedLeaderTpl = resolvedLeaderId !== null
      ? (ALL_CARD_TEMPLATES.find(t => t.id === resolvedLeaderId) ?? null)
      : null;
    const importAllowedColors = resolvedLeaderTpl !== null
      ? new Set(resolvedLeaderTpl.color.split(' '))
      : null;

    // Filter out cards with incompatible colors
    if (importAllowedColors !== null) {
      for (const id of Object.keys(newCounts)) {
        const tpl = ALL_CARD_TEMPLATES.find(t => t.id === id);
        if (tpl !== undefined && !importAllowedColors.has(tpl.color)) {
          delete newCounts[id];
        }
      }
    }

    if (newLeader !== null) setLeaderId(newLeader);

    // Trim to 50
    let total = 0;
    const trimmed: Record<string, number> = {};
    for (const [id, n] of Object.entries(newCounts)) {
      const add = Math.min(n, 50 - total);
      if (add > 0) { trimmed[id] = add; total += add; }
    }
    setCounts(trimmed);
  };

  const handleSave = () => {
    if (!isValid || leaderId === null) return;
    const deck: SavedDeck = {
      name: deckName,
      leaderId,
      cards: Object.entries(counts).map(([id, count]) => ({ id, count })),
    };
    saveDeckToStorage(deck);
    onSave(deck);
  };

  const colors = [...new Set(ALL_CARD_TEMPLATES.map(t => t.color))].sort();
  const costs  = [...new Set(ALL_CARD_TEMPLATES.map(t => t.cost))].sort((a, b) => a - b);

  return (
    <div style={s.root}>
      {/* Top bar */}
      <div style={s.topBar}>
        <span style={{ fontSize: 13, color: '#6688aa', fontWeight: 'bold', marginRight: 4 }}>
          DECK BUILDER
        </span>
        <input
          style={s.nameInput}
          value={deckName}
          onChange={e => setDeckName(e.currentTarget.value)}
          placeholder="Nom du deck"
        />
        <button style={s.btn} onClick={() => setShowImport(true)}>Importer ↑</button>
        <span style={{ flex: 1 }} />
        <button style={s.btn} onClick={onCancel}>Annuler</button>
        <button
          style={{ ...s.saveBtn, opacity: isValid ? 1 : 0.4, cursor: isValid ? 'pointer' : 'not-allowed' }}
          onClick={handleSave}
          disabled={!isValid}
          title={!isValid ? (leaderId === null ? 'Sélectionnez un leader' : `${totalCards}/50 cartes`) : ''}
        >
          Sauvegarder {isValid ? '✓' : `(${totalCards}/50)`}
        </button>
      </div>

      <div style={s.body}>
        {/* Left: card grid */}
        <div style={s.left}>
          {/* Filters */}
          <div style={s.filterBar}>
            <input
              style={s.filterInput}
              value={search}
              onChange={e => setSearch(e.currentTarget.value)}
              placeholder="Rechercher…"
            />
            {colors.map(c => (
              <Pill key={c} label={c} active={filterColor === c}
                color={COLOR_HEX[c]} onClick={() => setFilterColor(filterColor === c ? null : c)} />
            ))}
            <span style={{ width: 1, height: 16, background: '#2a2a4a', margin: '0 2px' }} />
            {(['Leader', 'Character', 'Event'] as const).map(t => (
              <Pill key={t} label={t} active={filterType === t}
                onClick={() => setFilterType(filterType === t ? null : t)} />
            ))}
            <span style={{ width: 1, height: 16, background: '#2a2a4a', margin: '0 2px' }} />
            {costs.map(c => (
              <Pill key={c} label={`${c}`} active={filterCost === c}
                onClick={() => setFilterCost(filterCost === c ? null : c)} />
            ))}
            {(filterColor !== null || filterType !== null || filterCost !== null || search !== '') && (
              <button style={{ ...s.btn, fontSize: 10, padding: '3px 8px' }}
                onClick={() => { setFilterColor(null); setFilterType(null); setFilterCost(null); setSearch(''); }}>
                Tout effacer ✕
              </button>
            )}
          </div>

          {/* Color restriction hint */}
          {allowedColors !== null && (
            <div style={{
              padding: '5px 14px', background: '#0a0a1a',
              borderBottom: '1px solid #1a1a3a', flexShrink: 0,
              fontSize: 11, color: '#556677', display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <span>Couleurs autorisées :</span>
              {[...allowedColors].map(c => (
                <span key={c} style={{
                  padding: '1px 8px', borderRadius: 10, fontSize: 10,
                  background: `${COLOR_HEX[c] ?? '#666'}33`,
                  color: COLOR_HEX[c] ?? '#aaa',
                  border: `1px solid ${COLOR_HEX[c] ?? '#666'}`,
                  fontWeight: 'bold',
                }}>
                  {c}
                </span>
              ))}
              <span style={{ color: '#334455' }}>— les autres cartes sont grisées</span>
            </div>
          )}

          {/* Grid */}
          <div style={s.cardGrid}>
            {filtered.map((tpl, i) => {
              const colorMismatch = (allowedColors !== null && tpl.type !== 'Leader' && !allowedColors.has(tpl.color))
                || (leaderId !== null && tpl.type === 'Leader' && tpl.id !== leaderId);
              return (
                <GridCard
                  key={`${tpl.id}-${i}`}
                  tpl={tpl}
                  count={tpl.type === 'Leader' ? (leaderId === tpl.id ? 1 : 0) : (counts[tpl.id] ?? 0)}
                  onAdd={() => addCard(tpl)}
                  colorMismatch={colorMismatch}
                  onHoverStart={rect => handleHoverStart(tpl, rect)}
                  onHoverEnd={handleHoverEnd}
                />
              );
            })}
            {filtered.length === 0 && (
              <div style={{ color: '#334455', fontSize: 12, padding: 16 }}>Aucune carte trouvée.</div>
            )}
          </div>
        </div>

        {/* Right: deck summary */}
        <div style={s.right}>
          <div style={s.deckHeader}>
            {/* Leader */}
            <div style={{ fontSize: 10, color: '#6688aa', marginBottom: 6 }}>LEADER</div>
            {leaderTpl !== null ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <img
                  src={leaderTpl.isParallel ? `/card-images/${leaderTpl.id}_p1.png` : `/card-images/${leaderTpl.id}.png`}
                  alt={leaderTpl.name}
                  style={{ width: 48, height: 68, objectFit: 'cover', borderRadius: 2 }}
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                />
                <div>
                  <div style={{ fontSize: 12, color: '#ccddee' }}>{leaderTpl.name}</div>
                  <div style={{ fontSize: 10, color: '#445566' }}>{leaderTpl.id}</div>
                  <div style={{ display: 'flex', gap: 4, marginTop: 2, flexWrap: 'wrap' }}>
                    {leaderTpl.color.split(' ').map(c => (
                      <span key={c} style={{
                        fontSize: 9, padding: '1px 5px', borderRadius: 8,
                        background: `${COLOR_HEX[c] ?? '#666'}33`,
                        color: COLOR_HEX[c] ?? '#aaa',
                        border: `1px solid ${COLOR_HEX[c] ?? '#666'}`,
                      }}>
                        {c}
                      </span>
                    ))}
                    <span style={{ fontSize: 9, color: '#445566' }}>{leaderTpl.power}</span>
                  </div>
                  <button style={{ ...s.btn, fontSize: 9, padding: '2px 6px', marginTop: 4 }}
                    onClick={() => setLeaderId(null)}>
                    Changer ✕
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 11, color: '#445566' }}>
                Cliquez un leader dans la grille
              </div>
            )}

            {/* Counter + mismatch warning */}
            <div style={{
              marginTop: 12, fontSize: 12, fontWeight: 'bold',
              color: totalCards === 50 ? '#88ffaa' : totalCards > 50 ? '#ff6666' : '#ccddee',
            }}>
              {totalCards} / 50 cartes
            </div>
            {mismatchCount > 0 && (
              <div style={{
                marginTop: 6, fontSize: 10, color: '#cc6644',
                background: '#2a1008', border: '1px solid #6a2a08',
                borderRadius: 4, padding: '4px 8px',
              }}>
                ⚠ {mismatchCount} carte{mismatchCount > 1 ? 's' : ''} hors couleur du leader
              </div>
            )}
          </div>

          {/* Card list */}
          <div style={s.deckList}>
            {deckEntries.length === 0 && (
              <div style={{ fontSize: 11, color: '#334455', paddingTop: 8 }}>
                Cliquez des cartes pour les ajouter.
              </div>
            )}
            {deckEntries.map(({ id, count, tpl }) => {
              const isMismatch = allowedColors !== null && !allowedColors.has(tpl.color);
              return (
                <div key={id} style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '4px 0', borderBottom: '1px solid #0f0f20',
                  opacity: isMismatch ? 0.5 : 1,
                }}>
                  <span style={{ fontSize: 11, color: isMismatch ? '#cc6644' : '#88ffaa', width: 18 }}>
                    ×{count}
                  </span>
                  <span style={{ flex: 1, fontSize: 11, color: isMismatch ? '#cc6644' : '#aabbcc' }}>
                    {tpl.name}
                    {isMismatch && (
                      <span title={`Couleur ${tpl.color} incompatible avec le leader`}
                        style={{ marginLeft: 4, fontSize: 9, color: '#cc6644' }}>⚠</span>
                    )}
                  </span>
                  <span style={{ fontSize: 10, color: '#445566' }}>{id}</span>
                  <button
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#556677', fontSize: 14, padding: '0 2px' }}
                    onClick={() => removeCard(id)}
                  >
                    −
                  </button>
                  <button
                    style={{
                      background: 'none', border: 'none',
                      cursor: (count >= 4 || isMismatch) ? 'default' : 'pointer',
                      color: (count >= 4 || isMismatch) ? '#334455' : '#44aa66', fontSize: 14, padding: '0 2px',
                    }}
                    onClick={() => {
                      if (isMismatch) return;
                      const cur = counts[id] ?? 0;
                      if (cur < 4 && totalCards < 50) setCounts(prev => ({ ...prev, [id]: cur + 1 }));
                    }}
                  >
                    ＋
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {preview !== null && (
        <CardPreviewPopup tpl={preview.tpl} x={preview.x} y={preview.y} />
      )}

      {showImport && (
        <ImportPopup onImport={handleImport} onClose={() => setShowImport(false)} />
      )}
    </div>
  );
}
