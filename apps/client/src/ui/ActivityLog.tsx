import { useState } from 'react';

export interface ActivityEntry {
  id: number;
  text: string;
}

const MAX_ENTRIES = 20;
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
  const visible = entries.slice(-MAX_ENTRIES);
  if (visible.length === 0) return null;

  const shown = expanded ? [...visible].reverse() : [...visible].slice(-COLLAPSED_ENTRIES).reverse();

  return (
    <div
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      style={{
        position: 'absolute',
        right,
        top,
        transform,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        zIndex,
        pointerEvents: 'auto',
        maxWidth: expanded ? 340 : 240,
        transition: 'max-width 0.15s ease',
      }}
    >
      {shown.map((entry, i) => {
        const opacity = i === 0 ? 1 : i < 2 ? 0.8 : i < 4 ? 0.5 : 0.3;
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
            }}
          >
            <span style={{ color: `rgba(184,134,11,${opacity})`, marginRight: 5 }}>●</span>
            {entry.text}
          </div>
        );
      })}
      {!expanded && visible.length > COLLAPSED_ENTRIES && (
        <div style={{
          fontFamily: 'monospace',
          fontSize: 10,
          color: 'rgba(100,120,140,0.6)',
          textAlign: 'right',
          paddingRight: 4,
          pointerEvents: 'none',
        }}>
          +{visible.length - COLLAPSED_ENTRIES} actions…
        </div>
      )}
    </div>
  );
}
