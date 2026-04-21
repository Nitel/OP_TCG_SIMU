import { useState } from 'react';
import type { CSSProperties } from 'react';
import type { SavedDeck } from '../data/deckBuilder';
import { loadDecksFromStorage } from '../data/deckBuilder';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GameConfig {
  mode: 'local' | 'network';
  roomId: string;
  myPlayerId: 'P1' | 'P2';
  p1Deck: SavedDeck | null;
  p2Deck: SavedDeck | null;
}

interface Props {
  onStart: (config: GameConfig) => void;
  onOpenDeckBuilder: (slot: 'p1' | 'p2', onSave: (deck: SavedDeck) => void) => void;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const container: CSSProperties = {
  minHeight: '100vh',
  background: '#07071a',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  fontFamily: 'monospace',
  gap: 32,
  padding: '40px 24px',
};

const card: CSSProperties = {
  background: '#0d0d24',
  border: '1px solid #2a2a5a',
  borderRadius: 8,
  padding: '24px 32px',
  width: 560,
  display: 'flex',
  flexDirection: 'column',
  gap: 20,
};

const label: CSSProperties = {
  fontSize: 11,
  color: '#6688aa',
  textTransform: 'uppercase',
  letterSpacing: 1,
  marginBottom: 6,
};

const inputStyle: CSSProperties = {
  background: '#111128',
  border: '1px solid #2a2a4a',
  borderRadius: 4,
  color: '#ccddee',
  fontFamily: 'monospace',
  fontSize: 13,
  padding: '6px 10px',
  width: '100%',
  boxSizing: 'border-box',
};

const modeBtn = (active: boolean): CSSProperties => ({
  flex: 1,
  padding: '8px 0',
  fontFamily: 'monospace',
  fontSize: 13,
  borderRadius: 4,
  cursor: 'pointer',
  border: active ? '1px solid #44aaff' : '1px solid #2a2a4a',
  background: active ? '#0a2a4a' : '#111128',
  color: active ? '#88ccff' : '#667788',
  fontWeight: active ? 'bold' : 'normal',
});

const playerBtn = (active: boolean): CSSProperties => ({
  flex: 1,
  padding: '6px 0',
  fontFamily: 'monospace',
  fontSize: 12,
  borderRadius: 4,
  cursor: 'pointer',
  border: active ? '1px solid #44aa66' : '1px solid #2a2a4a',
  background: active ? '#0a2a1a' : '#111128',
  color: active ? '#88ffaa' : '#667788',
  fontWeight: active ? 'bold' : 'normal',
});

const deckBox: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  background: '#111128',
  border: '1px solid #2a2a4a',
  borderRadius: 4,
  padding: '8px 10px',
};

const smallBtn: CSSProperties = {
  padding: '4px 10px',
  fontFamily: 'monospace',
  fontSize: 11,
  border: '1px solid #445566',
  borderRadius: 4,
  cursor: 'pointer',
  background: '#1a2a3a',
  color: '#aabbcc',
  whiteSpace: 'nowrap',
};

const primaryBtn: CSSProperties = {
  padding: '10px 0',
  fontFamily: 'monospace',
  fontSize: 15,
  fontWeight: 'bold',
  border: '1px solid #44aa66',
  borderRadius: 6,
  cursor: 'pointer',
  background: '#0a3a1a',
  color: '#88ffaa',
  letterSpacing: 1,
};

// ─── DeckSlot sub-component ───────────────────────────────────────────────────

function DeckSlot({
  slot,
  deck,
  onSelect,
  onNew,
  onClear,
}: {
  slot: string;
  deck: SavedDeck | null;
  onSelect: (d: SavedDeck) => void;
  onNew: () => void;
  onClear: () => void;
}) {
  const saved = loadDecksFromStorage();
  const [open, setOpen] = useState(false);

  const leaderImgUrl = deck !== null
    ? `/card-images/${deck.leaderId}.png`
    : null;

  return (
    <div>
      <div style={label}>{slot}</div>
      <div style={deckBox}>
        {leaderImgUrl !== null && (
          <img
            src={leaderImgUrl}
            alt="leader"
            style={{ width: 40, height: 56, objectFit: 'cover', borderRadius: 2, flexShrink: 0 }}
          />
        )}
        <span style={{ flex: 1, fontSize: 12, color: deck !== null ? '#ccddee' : '#445566' }}>
          {deck !== null ? `${deck.name} (${deck.leaderId})` : 'Deck aléatoire'}
        </span>
        {deck !== null && (
          <button style={smallBtn} onClick={onClear}>✕</button>
        )}
        <div style={{ position: 'relative' }}>
          <button style={smallBtn} onClick={() => setOpen(v => !v)}>
            Mes decks ▾
          </button>
          {open && (
            <div style={{
              position: 'absolute', right: 0, bottom: '110%',
              background: '#0d0d24', border: '1px solid #2a2a4a',
              borderRadius: 4, minWidth: 220, zIndex: 10,
              boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
            }}>
              {saved.length === 0 && (
                <div style={{ padding: '8px 12px', fontSize: 11, color: '#445566' }}>
                  Aucun deck sauvegardé
                </div>
              )}
              {saved.map((d) => (
                <div
                  key={d.name}
                  style={{
                    padding: '8px 12px', fontSize: 12, color: '#aabbcc',
                    cursor: 'pointer', borderBottom: '1px solid #1a1a3a',
                  }}
                  onClick={() => { onSelect(d); setOpen(false); }}
                >
                  {d.name}
                  <span style={{ color: '#445566', marginLeft: 8 }}>{d.leaderId}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <button style={{ ...smallBtn, color: '#88ccff', borderColor: '#2a4a6a' }} onClick={onNew}>
          + Nouveau
        </button>
      </div>
    </div>
  );
}

// ─── LobbyScreen ─────────────────────────────────────────────────────────────

export function LobbyScreen({ onStart, onOpenDeckBuilder }: Props) {
  const [mode, setMode]         = useState<'local' | 'network'>('local');
  const [roomId, setRoomId]     = useState('partie-1');
  const [myPlayer, setMyPlayer] = useState<'P1' | 'P2'>('P1');
  const [p1Deck, setP1Deck]     = useState<SavedDeck | null>(null);
  const [p2Deck, setP2Deck]     = useState<SavedDeck | null>(null);

  const handleStart = () => {
    onStart({
      mode,
      roomId,
      myPlayerId: myPlayer,
      p1Deck,
      p2Deck: mode === 'local' ? p2Deck : null,
    });
  };

  return (
    <div style={container}>
      {/* Title */}
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 28, fontWeight: 'bold', color: '#ccddee', letterSpacing: 4 }}>
          ONE PIECE TCG
        </div>
        <div style={{ fontSize: 13, color: '#445566', letterSpacing: 2, marginTop: 4 }}>
          SIMULATOR
        </div>
      </div>

      <div style={card}>
        {/* Mode selector */}
        <div>
          <div style={label}>Mode de jeu</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={modeBtn(mode === 'local')} onClick={() => setMode('local')}>
              Local (Hotseat)
            </button>
            <button style={modeBtn(mode === 'network')} onClick={() => setMode('network')}>
              Réseau (En ligne)
            </button>
          </div>
        </div>

        {/* Network options */}
        {mode === 'network' && (
          <>
            <div>
              <div style={label}>Nom de la salle</div>
              <input
                style={inputStyle}
                value={roomId}
                onChange={e => setRoomId(e.currentTarget.value)}
                placeholder="partie-1"
              />
            </div>
            <div>
              <div style={label}>Vous jouez en tant que</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={playerBtn(myPlayer === 'P1')} onClick={() => setMyPlayer('P1')}>
                  Joueur 1 (P1)
                </button>
                <button style={playerBtn(myPlayer === 'P2')} onClick={() => setMyPlayer('P2')}>
                  Joueur 2 (P2)
                </button>
              </div>
            </div>
          </>
        )}

        {/* Deck P1 */}
        <DeckSlot
          slot={mode === 'local' ? 'Deck — Joueur 1 (P1)' : 'Votre deck'}
          deck={mode === 'local' ? p1Deck : (myPlayer === 'P1' ? p1Deck : p2Deck)}
          onSelect={d => mode === 'local' || myPlayer === 'P1' ? setP1Deck(d) : setP2Deck(d)}
          onNew={() => onOpenDeckBuilder(
            mode === 'local' || myPlayer === 'P1' ? 'p1' : 'p2',
            mode === 'local' || myPlayer === 'P1' ? setP1Deck : setP2Deck,
          )}
          onClear={() => mode === 'local' || myPlayer === 'P1' ? setP1Deck(null) : setP2Deck(null)}
        />

        {/* Deck P2 — local only */}
        {mode === 'local' && (
          <DeckSlot
            slot="Deck — Joueur 2 (P2)"
            deck={p2Deck}
            onSelect={setP2Deck}
            onNew={() => onOpenDeckBuilder('p2', setP2Deck)}
            onClear={() => setP2Deck(null)}
          />
        )}

        {/* CTA */}
        <button style={primaryBtn} onClick={handleStart}>
          {mode === 'network' ? `Rejoindre la salle "${roomId}"` : 'Jouer !'}
        </button>

        {mode === 'local' && (
          <div style={{ fontSize: 10, color: '#334455', textAlign: 'center' }}>
            Deck aléatoire utilisé si aucun deck n'est sélectionné.
          </div>
        )}
      </div>
    </div>
  );
}
