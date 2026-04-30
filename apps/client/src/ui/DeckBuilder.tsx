import { useState, useMemo, useRef, useEffect } from 'react';
import type { CSSProperties } from 'react';
import type { CardTemplate, SavedDeck } from '../data/deckBuilder';
import {
  ALL_CARD_TEMPLATES, saveDeckToStorage,
  loadDecksFromStorage, deleteDeckFromStorage, cardSetFromId,
} from '../data/deckBuilder';

// ─── CDN image URL ────────────────────────────────────────────────────────────

const CDN_BASE: string = (import.meta.env.VITE_CDN_BASE_URL as string | undefined) ?? '';
function cdnCardUrl(id: string): string {
  const filename = `${id}.png`;
  return CDN_BASE !== '' ? `${CDN_BASE}/card-images/${filename}` : `/card-images/${filename}`;
}

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

const SELECT_STYLE: CSSProperties = {
  background: 'rgba(4,6,18,0.9)', border: '1px solid rgba(50,70,100,0.6)', borderRadius: 6,
  color: '#c0d8f0', fontFamily: 'monospace', fontSize: 12, padding: '4px 8px',
  outline: 'none', cursor: 'pointer',
};

const s: Record<string, CSSProperties> = {
  root: {
    minHeight: '100vh',
    background: 'linear-gradient(160deg, #060810 0%, #080a18 50%, #060810 100%)',
    fontFamily: "'Cinzel', serif",
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
  },
  topBar: {
    display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
    padding: '10px 20px',
    background: 'linear-gradient(to right, rgba(8,10,22,0.98), rgba(12,14,28,0.98))',
    borderBottom: '2px solid rgba(184,134,11,0.5)', flexShrink: 0,
  },
  nameInput: {
    background: 'rgba(4,6,18,0.9)', border: '1px solid rgba(60,80,110,0.6)', borderRadius: 6,
    color: '#d0e0f0', fontFamily: "'Cinzel', serif", fontSize: 13,
    padding: '5px 12px', width: 'clamp(120px, 30%, 220px)',
    outline: 'none',
  },
  btn: {
    padding: '5px 14px', fontFamily: "'Cinzel', serif", fontSize: 10,
    border: '1px solid rgba(60,90,120,0.6)', borderRadius: 6, cursor: 'pointer',
    background: 'rgba(8,16,30,0.9)', color: '#7aaabb', letterSpacing: 0.5,
    transition: 'all 0.12s ease',
  },
  saveBtn: {
    padding: '5px 14px', fontFamily: "'Cinzel', serif", fontSize: 10, fontWeight: 'bold',
    border: '1px solid rgba(184,134,11,0.7)', borderRadius: 6, cursor: 'pointer',
    background: 'linear-gradient(160deg, rgba(30,20,4,0.95) 0%, rgba(18,12,2,0.95) 100%)',
    color: '#ffd700', letterSpacing: 1,
    boxShadow: '0 2px 10px rgba(184,134,11,0.2)',
    transition: 'all 0.12s ease',
  },
  body: {
    display: 'flex', flex: 1, overflow: 'hidden',
  },
  left: {
    flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden',
    borderRight: '1px solid rgba(184,134,11,0.2)',
  },
  filterBar: {
    display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap',
    padding: '8px 14px',
    background: 'rgba(4,6,16,0.95)',
    borderBottom: '1px solid rgba(184,134,11,0.15)', flexShrink: 0,
  },
  filterInput: {
    background: 'rgba(4,6,18,0.9)', border: '1px solid rgba(50,70,100,0.6)', borderRadius: 6,
    color: '#c0d8f0', fontFamily: 'monospace', fontSize: 12, padding: '4px 10px',
    width: 'clamp(100px, 25%, 160px)', outline: 'none',
  },
  cardGrid: {
    display: 'flex', flexWrap: 'wrap', gap: 8,
    padding: 14, overflowY: 'auto', flex: 1, alignContent: 'flex-start',
  },
  right: {
    width: 'clamp(200px, 22%, 280px)', display: 'flex', flexDirection: 'column', overflow: 'hidden',
    background: 'rgba(4,6,16,0.97)',
    borderLeft: '1px solid rgba(184,134,11,0.25)',
  },
  deckHeader: {
    padding: '12px 14px', borderBottom: '1px solid rgba(184,134,11,0.2)', flexShrink: 0,
  },
  deckList: {
    flex: 1, overflowY: 'auto', padding: '8px 12px',
  },
  savedSection: {
    borderTop: '1px solid rgba(184,134,11,0.2)', flexShrink: 0,
    maxHeight: 180, overflowY: 'auto', padding: '8px 12px',
  },
};

// ─── Filter pill ──────────────────────────────────────────────────────────────

function Pill({ label, active, color, onClick }: {
  label: string; active: boolean; color?: string | undefined; onClick: () => void;
}) {
  return (
    <button
      style={{
        padding: '3px 10px', borderRadius: 10, cursor: 'pointer', fontSize: 10,
        fontFamily: "'Cinzel', serif",
        border: active ? `1px solid ${color ?? '#b8860b'}` : '1px solid rgba(40,50,70,0.6)',
        background: active ? (color ? `${color}28` : 'rgba(30,20,4,0.8)') : 'rgba(4,6,18,0.7)',
        color: active ? (color ?? '#ffd700') : '#3a5a70',
        fontWeight: active ? 'bold' : 'normal',
        boxShadow: active ? `0 0 8px ${color ?? '#b8860b'}44` : 'none',
        transition: 'all 0.12s ease',
        letterSpacing: 0.5,
      }}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

// ─── Card image with lazy loading (IntersectionObserver) ─────────────────────
// Images are only fetched once the element enters the viewport (+ 200px margin).
// This prevents hundreds of simultaneous requests (409 rate-limit) on open.

function CardImg({ id, alt, style, fallbackStyle }: {
  id: string; alt: string;
  style: CSSProperties; fallbackStyle: CSSProperties;
}) {
  const [visible, setVisible] = useState(false);
  const [failed,  setFailed]  = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (el === null) return;
    const io = new IntersectionObserver(
      ([entry]) => { if (entry?.isIntersecting) { setVisible(true); io.disconnect(); } },
      { rootMargin: '200px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  if (failed) return <div ref={wrapRef} style={fallbackStyle}>{alt}</div>;
  if (!visible) return <div ref={wrapRef} style={{ ...fallbackStyle, color: 'transparent' }} />;
  return <img src={cdnCardUrl(id)} alt={alt} style={style} onError={() => setFailed(true)} />;
}

// ─── Large card preview popup (position: fixed, pointer-events: none) ────────

const PREVIEW_W = 200;
const PREVIEW_H = 280;

function CardPreviewPopup({ tpl, x, y }: { tpl: CardTemplate; x: number; y: number }) {
  return (
    <div style={{
      position: 'fixed', left: x, top: y,
      width: PREVIEW_W, zIndex: 100,
      background: 'rgba(6,8,22,0.97)', border: '2px solid rgba(184,134,11,0.7)',
      borderRadius: 8, overflow: 'hidden',
      boxShadow: '0 10px 40px rgba(0,0,0,0.9), 0 0 20px rgba(184,134,11,0.15)',
      pointerEvents: 'none',
    }}>
      <CardImg
        id={tpl.id} alt={tpl.name}
        style={{ width: '100%', height: PREVIEW_H, objectFit: 'cover', display: 'block' }}
        fallbackStyle={{
          width: '100%', height: PREVIEW_H, display: 'flex', alignItems: 'center',
          justifyContent: 'center', padding: 12, boxSizing: 'border-box',
          background: COLOR_HEX[tpl.color] ? `${COLOR_HEX[tpl.color]}33` : '#1a2a3a',
          fontSize: 13, color: '#aabbcc', textAlign: 'center',
        }}
      />
      <div style={{ padding: '6px 10px', background: 'rgba(4,6,18,0.98)' }}>
        <div style={{ fontSize: 11, color: '#f0e0c0', fontWeight: 'bold', fontFamily: "'Cinzel', serif" }}>{tpl.name}</div>
        <div style={{ fontSize: 10, color: '#6a7a8a', marginTop: 2, fontFamily: 'monospace' }}>
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
  const [hovered, setHovered] = useState(false);
  const atMax = count >= 4 || (tpl.type === 'Leader' && count >= 1);
  const disabled = atMax || colorMismatch;
  const title = colorMismatch
    ? `${tpl.name} — couleur incompatible avec le leader`
    : `${tpl.name} · ${tpl.type} · Coût ${tpl.cost}${tpl.power > 0 ? ` · ${tpl.power}` : ''}${tpl.counter !== null ? ` · +${tpl.counter}` : ''}`;

  return (
    <div
      style={{
        position: 'relative', width: 68, height: 96,
        cursor: disabled ? 'default' : 'pointer',
        opacity: colorMismatch ? 0.12 : atMax ? 0.45 : 1,
        borderRadius: 5, overflow: 'hidden',
        border: count > 0 ? '2px solid rgba(100,220,130,0.8)' : hovered && !disabled ? '1px solid rgba(184,134,11,0.7)' : '1px solid rgba(40,55,75,0.6)',
        flexShrink: 0,
        transform: hovered && !disabled ? 'translateY(-5px) scale(1.06)' : 'none',
        transition: 'transform 0.15s ease, border 0.15s ease, box-shadow 0.15s ease',
        boxShadow: hovered && !disabled ? '0 6px 20px rgba(0,0,0,0.6)' : count > 0 ? '0 2px 8px rgba(80,200,100,0.2)' : '0 2px 6px rgba(0,0,0,0.4)',
      }}
      title={title}
      onClick={() => { if (!disabled) onAdd(); }}
      onMouseEnter={e => { setHovered(true); onHoverStart(e.currentTarget.getBoundingClientRect()); }}
      onMouseLeave={() => { setHovered(false); onHoverEnd(); }}
    >
      <CardImg
        id={tpl.id} alt={tpl.name}
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        fallbackStyle={{
          width: '100%', height: '100%', display: 'flex', alignItems: 'center',
          justifyContent: 'center', fontSize: 9, color: '#aabbcc', textAlign: 'center',
          padding: 4, boxSizing: 'border-box', wordBreak: 'break-word',
          background: COLOR_HEX[tpl.color] ? `${COLOR_HEX[tpl.color]}33` : '#1a2a3a',
        }}
      />
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
        background: 'rgba(5,8,22,0.97)', border: '1px solid rgba(184,134,11,0.5)', borderRadius: 10,
        padding: 24, width: '90vw', maxWidth: 480, display: 'flex', flexDirection: 'column', gap: 12,
        boxShadow: '0 8px 40px rgba(0,0,0,0.8)',
        backdropFilter: 'blur(8px)',
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

// ─── Cost curve mini-chart ────────────────────────────────────────────────────

function CostCurve({ deckEntries }: { deckEntries: { count: number; tpl: CardTemplate }[] }) {
  const curve: Record<number, number> = {};
  for (const { tpl, count } of deckEntries) {
    curve[tpl.cost] = (curve[tpl.cost] ?? 0) + count;
  }
  const maxVal = Math.max(...Object.values(curve), 1);
  const costs = Array.from({ length: 11 }, (_, i) => i); // 0–10

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 9, color: '#334455', marginBottom: 4 }}>COURBE DE COÛT</div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 28 }}>
        {costs.map(c => {
          const n = curve[c] ?? 0;
          const h = n === 0 ? 2 : Math.max(4, Math.round((n / maxVal) * 28));
          return (
            <div key={c} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
              <div style={{
                width: '100%', height: h, borderRadius: 2,
                background: n === 0 ? 'rgba(40,50,70,0.3)' : 'rgba(100,180,255,0.5)',
                transition: 'height 0.2s ease',
              }} title={`Coût ${c}: ${n} carte${n !== 1 ? 's' : ''}`} />
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 2, marginTop: 2 }}>
        {costs.map(c => (
          <div key={c} style={{ flex: 1, fontSize: 7, color: '#334455', textAlign: 'center' }}>{c}</div>
        ))}
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
  const [filterSet, setFilterSet]     = useState<string | null>(null);
  const [sortBy, setSortBy]           = useState<'cost-asc' | 'cost-desc' | 'name' | 'power-desc'>('cost-asc');
  const [search, setSearch]           = useState('');
  const [showImport, setShowImport]   = useState(false);
  const [copyLabel, setCopyLabel]     = useState<'copy' | 'copied'>('copy');
  const [savedDecks, setSavedDecks]   = useState<ReturnType<typeof loadDecksFromStorage>>(() => loadDecksFromStorage());

  // Hover preview
  const [preview, setPreview] = useState<{ tpl: CardTemplate; x: number; y: number } | null>(null);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleHoverStart = (tpl: CardTemplate, rect: DOMRect) => {
    if (previewTimerRef.current !== null) clearTimeout(previewTimerRef.current);
    previewTimerRef.current = setTimeout(() => {
      const totalPreviewH = PREVIEW_H + 52;
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

  const allowedColors = useMemo((): Set<string> | null => {
    if (leaderTpl === null) return null;
    return new Set(leaderTpl.color.split(' '));
  }, [leaderTpl]);

  // All unique sets, sorted
  const allSets = useMemo(() =>
    [...new Set(ALL_CARD_TEMPLATES.map(t => cardSetFromId(t.id)))].sort(),
  []);

  // Filtered + sorted card list
  const filtered = useMemo(() => {
    const list = ALL_CARD_TEMPLATES.filter((t) => {
      if (filterColor !== null && t.color !== filterColor) return false;
      if (filterType !== null && t.type !== filterType) return false;
      if (filterCost !== null && t.cost !== filterCost) return false;
      if (filterSet !== null && cardSetFromId(t.id) !== filterSet) return false;
      if (search.length > 0) {
        const q = search.toLowerCase();
        if (!t.name.toLowerCase().includes(q) && !t.id.toLowerCase().includes(q)) return false;
      }
      return true;
    });
    return [...list].sort((a, b) => {
      switch (sortBy) {
        case 'cost-asc':   return a.cost - b.cost || a.name.localeCompare(b.name);
        case 'cost-desc':  return b.cost - a.cost || a.name.localeCompare(b.name);
        case 'name':       return a.name.localeCompare(b.name);
        case 'power-desc': return b.power - a.power || a.name.localeCompare(b.name);
      }
    });
  }, [filterColor, filterType, filterCost, filterSet, search, sortBy]);

  const deckEntries = useMemo(() => {
    return Object.entries(counts)
      .filter(([, n]) => n > 0)
      .map(([id, count]) => ({ id, count, tpl: ALL_CARD_TEMPLATES.find(t => t.id === id) }))
      .filter((e): e is { id: string; count: number; tpl: CardTemplate } => e.tpl !== undefined)
      .sort((a, b) => a.tpl.cost - b.tpl.cost || a.tpl.name.localeCompare(b.tpl.name));
  }, [counts]);

  const mismatchCount = useMemo(() => {
    if (allowedColors === null) return 0;
    return deckEntries.filter(({ tpl }) => !allowedColors.has(tpl.color)).reduce((sum, e) => sum + e.count, 0);
  }, [deckEntries, allowedColors]);

  const addCard = (tpl: CardTemplate) => {
    if (tpl.type === 'Leader') { setLeaderId(tpl.id); return; }
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
    const resolvedLeaderId = newLeader ?? leaderId;
    const resolvedLeaderTpl = resolvedLeaderId !== null
      ? (ALL_CARD_TEMPLATES.find(t => t.id === resolvedLeaderId) ?? null)
      : null;
    const importAllowedColors = resolvedLeaderTpl !== null
      ? new Set(resolvedLeaderTpl.color.split(' '))
      : null;
    if (importAllowedColors !== null) {
      for (const id of Object.keys(newCounts)) {
        const tpl = ALL_CARD_TEMPLATES.find(t => t.id === id);
        if (tpl !== undefined && !importAllowedColors.has(tpl.color)) delete newCounts[id];
      }
    }
    if (newLeader !== null) setLeaderId(newLeader);
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
    setSavedDecks(loadDecksFromStorage());
    onSave(deck);
  };

  const handleCopyDeck = () => {
    if (leaderId === null) return;
    const lines: string[] = [`1 ${leaderId}`];
    for (const { id, count } of deckEntries) lines.push(`${count} ${id}`);
    void navigator.clipboard.writeText(lines.join('\n')).then(() => {
      setCopyLabel('copied');
      setTimeout(() => setCopyLabel('copy'), 2000);
    });
  };

  const handleLoadDeck = (deck: typeof savedDecks[number]) => {
    setDeckName(deck.name);
    setLeaderId(deck.leaderId);
    const m: Record<string, number> = {};
    deck.cards.forEach(({ id, count }) => { m[id] = count; });
    setCounts(m);
  };

  const handleDeleteDeck = (name: string) => {
    deleteDeckFromStorage(name);
    setSavedDecks(loadDecksFromStorage());
  };

  const colors = [...new Set(ALL_CARD_TEMPLATES.map(t => t.color))].sort();
  const costs  = [...new Set(ALL_CARD_TEMPLATES.map(t => t.cost))].sort((a, b) => a - b);
  const hasActiveFilter = filterColor !== null || filterType !== null || filterCost !== null || filterSet !== null || search !== '';

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
            {/* Set filter */}
            <select
              style={SELECT_STYLE}
              value={filterSet ?? ''}
              onChange={e => setFilterSet(e.currentTarget.value === '' ? null : e.currentTarget.value)}
            >
              <option value="">Tous les sets</option>
              {allSets.map(set => (
                <option key={set} value={set}>{set}</option>
              ))}
            </select>
            {/* Sort */}
            <select
              style={SELECT_STYLE}
              value={sortBy}
              onChange={e => setSortBy(e.currentTarget.value as typeof sortBy)}
            >
              <option value="cost-asc">Coût ↑</option>
              <option value="cost-desc">Coût ↓</option>
              <option value="name">Nom A→Z</option>
              <option value="power-desc">Puissance ↓</option>
            </select>
            <span style={{ width: 1, height: 16, background: '#2a2a4a', margin: '0 2px' }} />
            {colors.map(c => (
              <Pill key={c} label={c} active={filterColor === c}
                color={COLOR_HEX[c]} onClick={() => setFilterColor(filterColor === c ? null : c)} />
            ))}
            <span style={{ width: 1, height: 16, background: '#2a2a4a', margin: '0 2px' }} />
            {(['Leader', 'Character', 'Event', 'Stage'] as const).map(t => (
              <Pill key={t} label={t} active={filterType === t}
                onClick={() => setFilterType(filterType === t ? null : t)} />
            ))}
            <span style={{ width: 1, height: 16, background: '#2a2a4a', margin: '0 2px' }} />
            {costs.map(c => (
              <Pill key={c} label={`${c}`} active={filterCost === c}
                onClick={() => setFilterCost(filterCost === c ? null : c)} />
            ))}
            {hasActiveFilter && (
              <button style={{ ...s.btn, fontSize: 10, padding: '3px 8px' }}
                onClick={() => { setFilterColor(null); setFilterType(null); setFilterCost(null); setFilterSet(null); setSearch(''); }}>
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
                <CardImg
                  id={leaderTpl.id} alt={leaderTpl.name}
                  style={{ width: 48, height: 68, objectFit: 'cover', borderRadius: 2 }}
                  fallbackStyle={{ width: 48, height: 68, borderRadius: 2, background: '#1a2a3a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, color: '#aabbcc', textAlign: 'center' }}
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

            {/* Counter + copy */}
            <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{
                fontSize: 12, fontWeight: 'bold',
                color: totalCards === 50 ? '#88ffaa' : totalCards > 50 ? '#ff6666' : '#ccddee',
              }}>
                {totalCards} / 50 cartes
              </span>
              {deckEntries.length > 0 && (
                <button
                  style={{
                    ...s.btn, fontSize: 9, padding: '2px 8px',
                    color: copyLabel === 'copied' ? '#88ffaa' : '#7aaabb',
                    borderColor: copyLabel === 'copied' ? 'rgba(100,220,130,0.5)' : undefined,
                  }}
                  onClick={handleCopyDeck}
                  title="Copier la decklist en texte"
                >
                  {copyLabel === 'copied' ? 'Copié ✓' : 'Copier ↗'}
                </button>
              )}
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

            {/* Cost curve */}
            {deckEntries.length > 0 && <CostCurve deckEntries={deckEntries} />}
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
                  <span style={{ flex: 1, fontSize: 11, color: isMismatch ? '#cc6644' : '#aabbcc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {tpl.name}
                    {isMismatch && (
                      <span title={`Couleur ${tpl.color} incompatible avec le leader`}
                        style={{ marginLeft: 4, fontSize: 9, color: '#cc6644' }}>⚠</span>
                    )}
                  </span>
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

          {/* Saved decks */}
          {savedDecks.length > 0 && (
            <div style={s.savedSection}>
              <div style={{ fontSize: 9, color: '#445566', marginBottom: 6, letterSpacing: 1 }}>MES DECKS SAUVEGARDÉS</div>
              {savedDecks.map(deck => (
                <div key={deck.name} style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  padding: '4px 0', borderBottom: '1px solid #0a0a1a',
                }}>
                  <span style={{ flex: 1, fontSize: 10, color: '#8899aa', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    title={deck.name}>
                    {deck.name}
                  </span>
                  <button
                    style={{ ...s.btn, fontSize: 9, padding: '1px 6px' }}
                    onClick={() => handleLoadDeck(deck)}
                    title="Charger ce deck"
                  >
                    Charger
                  </button>
                  <button
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: '#664433', fontSize: 13, padding: '0 2px', lineHeight: 1,
                    }}
                    onClick={() => handleDeleteDeck(deck.name)}
                    title={`Supprimer "${deck.name}"`}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
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
