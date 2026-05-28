import { useState, useRef, useEffect } from 'react';

export interface ActivityEntry {
  id: number;
  text: string;
}

const MAX_ENTRIES = 60;
const COLLAPSED_ENTRIES = 4;

interface Props {
  entries: ActivityEntry[];
  right?: number;
  top?: string | number;
  transform?: string;
  zIndex?: number;
}

export function ActivityLog({ entries, right = 16, top = '50%', transform = 'translateY(-50%)', zIndex = 200 }: Props) {
  const [expanded, setExpanded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const visible = entries.slice(-MAX_ENTRIES);

  // Scroll to bottom whenever new entries arrive or panel expands
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries.length, expanded]);

  if (visible.length === 0) return null;

  // Chronological order (oldest → newest at bottom) so auto-scroll shows latest
  const shown = expanded ? visible : visible.slice(-COLLAPSED_ENTRIES);

  return (
    <div
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      style={{
        position: 'absolute',
        right,
        top,
        transform,
        zIndex,
        pointerEvents: 'auto',
        maxWidth: expanded ? 400 : 240,
        transition: 'max-width 0.15s ease',
      }}
    >
      {/* Scroll container — capped height, always scrollable when expanded */}
      <div
        ref={scrollRef}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          maxHeight: expanded ? 480 : 140,
          overflowY: expanded ? 'auto' : 'hidden',
          paddingRight: expanded ? 2 : 0,
        }}
      >
        {shown.map((entry, i) => {
          // Newest entry (last in array) = full opacity; older entries fade
          const fromEnd = shown.length - 1 - i;
          const opacity = fromEnd === 0 ? 1 : fromEnd === 1 ? 0.8 : fromEnd < 4 ? 0.5 : 0.7;
          return (
            <div
              key={entry.id}
              style={{
                background: 'rgba(4,8,24,0.88)',
                border: '1px solid rgba(184,134,11,0.3)',
                borderRadius: 6,
                padding: '4px 10px',
                fontFamily: 'monospace',
                fontSize: 11,
                color: `rgba(170,187,204,${opacity})`,
                backdropFilter: 'blur(4px)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
                lineHeight: 1.4,
                whiteSpace: expanded ? 'normal' : 'nowrap',
                overflow: 'hidden',
                textOverflow: expanded ? 'unset' : 'ellipsis',
                cursor: 'default',
                flexShrink: 0,
              }}
            >
              <span style={{ color: `rgba(184,134,11,${opacity})`, marginRight: 5 }}>●</span>
              {entry.text}
            </div>
          );
        })}
      </div>

      {!expanded && visible.length > COLLAPSED_ENTRIES && (
        <div style={{
          fontFamily: 'monospace',
          fontSize: 10,
          color: 'rgba(100,120,140,0.6)',
          textAlign: 'right',
          paddingRight: 4,
          marginTop: 2,
          pointerEvents: 'none',
        }}>
          +{visible.length - COLLAPSED_ENTRIES} actions…
        </div>
      )}
    </div>
  );
}
