import { useState, useRef } from 'react';
import { io } from 'socket.io-client';
import type { CSSProperties } from 'react';
import type { SavedDeck } from '../data/deckBuilder';
import { loadDecksFromStorage } from '../data/deckBuilder';
import type { RoomInfo } from '../network/socketClient';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GameConfig {
  mode: 'local' | 'network' | 'vsBot';
  roomId: string;
  myPlayerId: 'P1' | 'P2';
  isCreating: boolean;
  p1Deck: SavedDeck | null;
  p2Deck: SavedDeck | null;
}

interface Props {
  onStart: (config: GameConfig) => void;
  onOpenDeckBuilder: (slot: 'p1' | 'p2', onSave: (deck: SavedDeck) => void) => void;
  serverUrl?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Generates a random 6-character room code (unambiguous chars, no 0/O/1/I). */
function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}


// ─── Styles ───────────────────────────────────────────────────────────────────

const container: CSSProperties = {
  minHeight: '100vh',
  backgroundImage: "url('/backgrounds/bg-ocean.jpg')",
  backgroundSize: 'cover',
  backgroundPosition: 'center',
  backgroundRepeat: 'no-repeat',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  fontFamily: "'Cinzel', serif",
  gap: 28,
  padding: '40px 24px',
  position: 'relative',
};

const overlay: CSSProperties = {
  position: 'absolute',
  inset: 0,
  background: 'linear-gradient(180deg, rgba(2,4,16,0.78) 0%, rgba(4,10,24,0.65) 50%, rgba(2,6,18,0.80) 100%)',
  pointerEvents: 'none',
};

const card: CSSProperties = {
  background: 'rgba(5,10,28,0.88)',
  border: '1px solid rgba(184,134,11,0.45)',
  borderRadius: 12,
  padding: '28px 36px',
  width: 580,
  display: 'flex',
  flexDirection: 'column',
  gap: 20,
  backdropFilter: 'blur(8px)',
  boxShadow: '0 8px 40px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.03) inset',
  position: 'relative',
  zIndex: 1,
};

const label: CSSProperties = {
  fontSize: 10,
  color: '#b8860b',
  textTransform: 'uppercase',
  letterSpacing: 2,
  marginBottom: 6,
  fontFamily: "'Cinzel', serif",
};

const inputStyle: CSSProperties = {
  background: 'rgba(2,6,18,0.8)',
  border: '1px solid rgba(60,80,110,0.6)',
  borderRadius: 6,
  color: '#d0e8f8',
  fontFamily: "'Cinzel', serif",
  fontSize: 12,
  padding: '7px 12px',
  width: '100%',
  boxSizing: 'border-box',
  outline: 'none',
  transition: 'border-color 0.2s',
};

const modeBtn = (active: boolean): CSSProperties => ({
  flex: 1,
  padding: '9px 0',
  fontFamily: "'Cinzel', serif",
  fontSize: 11,
  borderRadius: 8,
  cursor: 'pointer',
  border: active ? '1px solid rgba(184,134,11,0.8)' : '1px solid rgba(40,60,80,0.6)',
  background: active
    ? 'linear-gradient(160deg, rgba(40,28,4,0.95) 0%, rgba(28,18,2,0.95) 100%)'
    : 'linear-gradient(160deg, rgba(6,12,26,0.9) 0%, rgba(4,8,18,0.9) 100%)',
  color: active ? '#ffd700' : '#3a5a70',
  fontWeight: active ? 'bold' : 'normal',
  letterSpacing: 1,
  transition: 'all 0.15s ease',
  boxShadow: active ? '0 0 12px rgba(184,134,11,0.25)' : 'none',
});

const deckBox: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  background: 'rgba(2,6,18,0.7)',
  border: '1px solid rgba(184,134,11,0.25)',
  borderRadius: 8,
  padding: '8px 12px',
};

const smallBtn: CSSProperties = {
  padding: '5px 12px',
  fontFamily: "'Cinzel', serif",
  fontSize: 10,
  border: '1px solid rgba(60,90,120,0.6)',
  borderRadius: 6,
  cursor: 'pointer',
  background: 'rgba(4,12,26,0.8)',
  color: '#5a9ab8',
  whiteSpace: 'nowrap',
  transition: 'all 0.12s ease',
  letterSpacing: 0.5,
};

const primaryBtn: CSSProperties = {
  padding: '12px 0',
  fontFamily: "'Cinzel', serif",
  fontSize: 14,
  fontWeight: 'bold',
  border: '1px solid rgba(184,134,11,0.7)',
  borderRadius: 10,
  cursor: 'pointer',
  background: 'linear-gradient(160deg, rgba(40,28,4,0.95) 0%, rgba(20,12,2,0.98) 100%)',
  color: '#ffd700',
  letterSpacing: 2,
  boxShadow: '0 4px 20px rgba(184,134,11,0.25), inset 0 1px 0 rgba(255,255,255,0.05)',
  transition: 'transform 0.12s ease, box-shadow 0.12s ease',
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
              background: 'rgba(6,10,24,0.96)', border: '1px solid rgba(184,134,11,0.4)',
              borderRadius: 8, minWidth: 240, zIndex: 10,
              boxShadow: '0 8px 30px rgba(0,0,0,0.8)',
              backdropFilter: 'blur(8px)',
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
                    padding: '9px 14px', fontSize: 11, color: '#c8b880',
                    cursor: 'pointer', borderBottom: '1px solid rgba(184,134,11,0.15)',
                    fontFamily: "'Cinzel', serif", letterSpacing: 0.5,
                    transition: 'background 0.1s',
                  }}
                  onClick={() => { onSelect(d); setOpen(false); }}
                >
                  {d.name}
                  <span style={{ color: '#5a6a7a', marginLeft: 8, fontSize: 9 }}>{d.leaderId}</span>
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

// ─── RoomList sub-component ───────────────────────────────────────────────────

function RoomList({
  serverUrl,
  onJoin,
}: {
  serverUrl: string;
  onJoin: (roomId: string) => void;
}) {
  const [rooms, setRooms] = useState<RoomInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);
  const socketRef = useRef<ReturnType<typeof io> | null>(null);

  const refresh = () => {
    setLoading(true);
    if (socketRef.current !== null) {
      socketRef.current.disconnect();
    }
    const s = io(serverUrl, { autoConnect: true });
    socketRef.current = s;
    s.once('connect', () => {
      s.emit('ListRooms');
    });
    s.once('RoomList', ({ rooms: r }: { rooms: RoomInfo[] }) => {
      setRooms(r);
      setLoading(false);
      setFetched(true);
      s.disconnect();
      socketRef.current = null;
    });
    s.once('connect_error', () => {
      setLoading(false);
      setFetched(true);
      socketRef.current = null;
    });
  };

  // Show all rooms with at least one free slot (both taken = can't join)
  const joinableRooms = rooms.filter(r => !r.slots.P1 || !r.slots.P2);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={label}>Salles</div>
        <button
          style={{ ...smallBtn, fontSize: 10 }}
          onClick={refresh}
          disabled={loading}
        >
          {loading ? 'Chargement…' : 'Actualiser'}
        </button>
      </div>

      {fetched && joinableRooms.length === 0 && (
        <div style={{ fontSize: 11, color: '#445566', padding: '6px 0' }}>
          Aucune salle disponible.
        </div>
      )}

      {joinableRooms.map((r) => {
        const isReconnect = r.inProgress;
        const freeSlot = !r.slots.P1 ? 'P1' : 'P2';
        const statusLabel = isReconnect
          ? `En cours — ${freeSlot} déconnecté`
          : 'En attente de P2';
        const statusColor = isReconnect ? '#ffcc44' : '#44aa66';
        return (
          <div
            key={r.roomId}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '7px 10px', marginBottom: 4,
              background: 'rgba(6,10,24,0.85)', border: '1px solid rgba(184,134,11,0.25)', borderRadius: 8,
              fontSize: 11,
            }}
          >
            <span style={{ flex: 1, color: '#ccddee', letterSpacing: 2, fontWeight: 'bold' }}>
              {r.roomId}
            </span>
            <span style={{ color: statusColor, fontSize: 10 }}>{statusLabel}</span>
            <button
              style={{ ...smallBtn, fontSize: 10, color: isReconnect ? '#ffee88' : '#88ffaa', borderColor: isReconnect ? '#886622' : '#44aa66' }}
              onClick={() => onJoin(r.roomId)}
            >
              {isReconnect ? 'Reconnecter' : 'Rejoindre'}
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ─── LobbyScreen ─────────────────────────────────────────────────────────────

export function LobbyScreen({ onStart, onOpenDeckBuilder, serverUrl }: Props) {
  const [mode, setMode]               = useState<'local' | 'network' | 'vsBot'>('vsBot');
  const [networkMode, setNetworkMode] = useState<'create' | 'join'>('create');
  const [roomId, setRoomId]           = useState(generateRoomCode);
  const [p1Deck, setP1Deck]           = useState<SavedDeck | null>(null);
  const [p2Deck, setP2Deck]           = useState<SavedDeck | null>(null);

  const handleStart = () => {
    onStart({
      mode,
      roomId,
      myPlayerId: 'P1', // Server auto-assigns for network JOIN; local is always P1 (hotseat)
      isCreating: mode === 'network' ? networkMode === 'create' : true,
      p1Deck,
      p2Deck,
    });
  };

  const switchToCreate = () => {
    setNetworkMode('create');
    setRoomId(generateRoomCode());
  };

  const switchToJoin = () => {
    setNetworkMode('join');
    setRoomId('');
  };

  return (
    <div style={container}>
      <div style={overlay} />

      {/* Title */}
      <div style={{ textAlign: 'center', position: 'relative', zIndex: 1 }}>
        <div style={{
          fontFamily: "'Cinzel Decorative', serif",
          fontSize: 38,
          fontWeight: '700',
          color: '#ffd700',
          letterSpacing: 5,
          textShadow: '0 0 30px rgba(255,215,0,0.5), 0 2px 8px rgba(0,0,0,0.8)',
          lineHeight: 1.1,
        }}>
          ONE PIECE
        </div>
        <div style={{
          fontFamily: "'Cinzel', serif",
          fontSize: 16,
          color: '#c8a860',
          letterSpacing: 8,
          marginTop: 4,
          textShadow: '0 0 12px rgba(200,168,96,0.4)',
        }}>
          TCG SIMULATOR
        </div>
        <div style={{
          width: 200,
          height: 1,
          background: 'linear-gradient(to right, transparent, rgba(184,134,11,0.7), transparent)',
          margin: '10px auto 0',
        }} />
      </div>

      <div style={card}>
        {/* Mode selector */}
        <div>
          <div style={label}>Mode de jeu</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {false && (
              <button style={modeBtn(mode === 'local')} onClick={() => setMode('local')}>
                Local (Hotseat)
              </button>
            )}
            <button style={modeBtn(mode === 'vsBot')} onClick={() => setMode('vsBot')}>
              vs IA (Bot)
            </button>
            <button style={modeBtn(mode === 'network')} onClick={() => setMode('network')}>
              Réseau (En ligne)
            </button>
          </div>
        </div>

        {/* Network options */}
        {mode === 'network' && (
          <>
            {/* Create vs Join */}
            <div>
              <div style={label}>Vous souhaitez</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={modeBtn(networkMode === 'create')} onClick={switchToCreate}>
                  Créer une partie
                </button>
                <button style={modeBtn(networkMode === 'join')} onClick={switchToJoin}>
                  Rejoindre une partie
                </button>
              </div>
            </div>

            {/* Create: show room code */}
            {networkMode === 'create' && (
              <div>
                <div style={label}>Code de la partie</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <div style={{
                    flex: 1, background: 'rgba(2,6,18,0.85)', border: '1px solid rgba(184,134,11,0.7)',
                    borderRadius: 8, padding: '10px 12px',
                    letterSpacing: 10, fontSize: 24, fontWeight: 'bold',
                    color: '#ffd700', textAlign: 'center', fontFamily: "'Cinzel', serif",
                    textShadow: '0 0 16px rgba(255,215,0,0.6)',
                    boxShadow: '0 2px 12px rgba(184,134,11,0.2)',
                  }}>
                    {roomId}
                  </div>
                  <button
                    style={{ ...smallBtn, fontSize: 12 }}
                    onClick={() => { void navigator.clipboard.writeText(roomId); }}
                  >
                    Copier
                  </button>
                  <button
                    style={{ ...smallBtn, fontSize: 14 }}
                    onClick={() => setRoomId(generateRoomCode())}
                    title="Générer un nouveau code"
                  >
                    ↺
                  </button>
                </div>
                <div style={{ fontSize: 10, color: '#445566', marginTop: 6 }}>
                  Partagez ce code avec votre adversaire — lui doit choisir "Rejoindre"
                </div>
              </div>
            )}

            {/* Join: room list + code input */}
            {networkMode === 'join' && (
              <>
                {serverUrl !== undefined && (
                  <RoomList serverUrl={serverUrl} onJoin={setRoomId} />
                )}
                <div>
                  <div style={label}>Code de la partie</div>
                  <input
                    style={{
                      ...inputStyle,
                      letterSpacing: 6,
                      textTransform: 'uppercase',
                      textAlign: 'center',
                      fontSize: 18,
                      padding: '10px',
                    }}
                    value={roomId}
                    onChange={e => setRoomId(e.currentTarget.value.toUpperCase())}
                    placeholder="XXXXXX"
                    maxLength={6}
                  />
                </div>
              </>
            )}
          </>
        )}

        {/* Deck P1 — local and network create */}
        {(mode === 'local' || networkMode === 'create') && (
          <DeckSlot
            slot={mode === 'local' ? 'Deck — Joueur 1 (P1)' : 'Votre deck'}
            deck={p1Deck}
            onSelect={setP1Deck}
            onNew={() => onOpenDeckBuilder('p1', setP1Deck)}
            onClear={() => setP1Deck(null)}
          />
        )}

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
          {mode === 'local'
            ? 'Jouer !'
            : networkMode === 'create'
              ? 'Créer la partie'
              : roomId.length > 0 ? `Rejoindre "${roomId}"` : 'Rejoindre'}
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
