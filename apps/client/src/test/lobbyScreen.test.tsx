/**
 * LobbyScreen tests — LS1–LS3
 *
 * Tests the observable UI from the player's perspective:
 * mode selection, deck slot display, and the start-game trigger.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LobbyScreen } from '../ui/LobbyScreen';

const noop = vi.fn();

// ─── LS1 : Lobby affiche les modes et le bouton principal ─────────────────────

describe('LS1: LobbyScreen — mode buttons and CTA visible on mount', () => {
  it('renders "vs IA (Bot)" mode button', () => {
    render(<LobbyScreen onStart={noop} onOpenDeckBuilder={noop} />);
    expect(screen.getByRole('button', { name: /vs IA/i })).toBeInTheDocument();
  });

  it('renders "Réseau (En ligne)" mode button', () => {
    render(<LobbyScreen onStart={noop} onOpenDeckBuilder={noop} />);
    expect(screen.getByRole('button', { name: /Réseau/i })).toBeInTheDocument();
  });

  it('renders the primary CTA button', () => {
    render(<LobbyScreen onStart={noop} onOpenDeckBuilder={noop} />);
    // vsBot is the default mode — button reads "Créer la partie" (reuses network create text)
    expect(screen.getByRole('button', { name: /Créer la partie/i })).toBeInTheDocument();
  });

  it('renders deck slot with "Mes decks" and "+ Nouveau" controls', () => {
    render(<LobbyScreen onStart={noop} onOpenDeckBuilder={noop} />);
    expect(screen.getByRole('button', { name: /Mes decks/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /\+ Nouveau/i })).toBeInTheDocument();
  });
});

// ─── LS2 : Mode vsBot (par défaut) — bouton start actif ────────────────────────

describe('LS2: vsBot default — start button immediately clickable', () => {
  it('"Créer la partie" button is enabled by default', () => {
    render(<LobbyScreen onStart={noop} onOpenDeckBuilder={noop} />);
    const btn = screen.getByRole('button', { name: /Créer la partie/i });
    expect(btn).not.toBeDisabled();
  });

  it('switching to "Réseau" mode shows network-specific room code UI', async () => {
    const user = userEvent.setup();
    render(<LobbyScreen onStart={noop} onOpenDeckBuilder={noop} />);
    await user.click(screen.getByRole('button', { name: /Réseau/i }));
    expect(screen.getByText(/Code de la partie/i)).toBeInTheDocument();
  });
});

// ─── LS3 : Clic Start → onStart appelé avec la bonne config ──────────────────

describe('LS3: clicking start triggers onStart callback', () => {
  it('vsBot mode — calls onStart with mode:"vsBot"', async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    render(<LobbyScreen onStart={onStart} onOpenDeckBuilder={noop} />);
    await user.click(screen.getByRole('button', { name: /Créer la partie/i }));
    expect(onStart).toHaveBeenCalledOnce();
    expect(onStart).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'vsBot' }),
    );
  });

  it('network create mode — calls onStart with mode:"network" and isCreating:true', async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    render(<LobbyScreen onStart={onStart} onOpenDeckBuilder={noop} />);
    await user.click(screen.getByRole('button', { name: /Réseau/i }));
    await user.click(screen.getByRole('button', { name: /Créer la partie/i }));
    expect(onStart).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'network', isCreating: true }),
    );
  });
});
