import { useState, useRef } from 'react';
import { io } from 'socket.io-client';
import type { CSSProperties } from 'react';
import type { SavedDeck } from '../data/deckBuilder';
import { loadDecksFromStorage } from '../data/deckBuilder';
import type { RoomInfo } from '../network/socketClient';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GameConfig {
  mode: 'local' | 'network';
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
              padding: '6px 8px', marginBottom: 4,
              background: '#111128', border: '1px solid #2a2a4a', borderRadius: 4,
              fontSize: 12,
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
  const [mode, setMode]               = useState<'local' | 'network'>('local');
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
                    flex: 1, background: '#0a1a2a', border: '1px solid #2255aa',
                    borderRadius: 4, padding: '10px 12px',
                    letterSpacing: 8, fontSize: 22, fontWeight: 'bold',
                    color: '#88ccff', textAlign: 'center', fontFamily: 'monospace',
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
