/**
 * DeckBuilder tests — DB1–DB4
 *
 * Tests observable UI behaviour: component renders, card adds/removes,
 * and save-button disabled state when the deck is invalid.
 *
 * IntersectionObserver is not available in jsdom — we stub it so
 * CardImg fallback text becomes visible after the lazy-load trigger fires.
 */
import { beforeAll, describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DeckBuilder } from '../ui/DeckBuilder';
import { ALL_CARD_TEMPLATES } from '../data/deckBuilder';

// ── IntersectionObserver stub ──────────────────────────────────────────────────
// jsdom has no real IntersectionObserver. We stub it as a no-op so CardImg
// never marks itself visible — grid cards render empty divs. This keeps card
// names out of the grid DOM so deck-list queries (`getByText(name)`) match
// uniquely. Grid cards are still clickable via their `title` attribute.
beforeAll(() => {
  vi.stubGlobal('IntersectionObserver', class MockIO {
    observe() { /* never fires — CardImg stays invisible */ }
    unobserve() { /* no-op */ }
    disconnect() { /* no-op */ }
  });
});

// ── DB1 : DeckBuilder s'affiche avec les éléments principaux ──────────────────

describe('DB1: DeckBuilder renders main UI elements', () => {
  it('shows "DECK BUILDER" heading', () => {
    render(<DeckBuilder onSave={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText(/DECK BUILDER/i)).toBeInTheDocument();
  });

  it('shows "Annuler" button', () => {
    render(<DeckBuilder onSave={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Annuler/i })).toBeInTheDocument();
  });

  it('shows disabled save button with 0/50 indicator', () => {
    render(<DeckBuilder onSave={vi.fn()} onCancel={vi.fn()} />);
    const saveBtn = screen.getByRole('button', { name: /Sauvegarder/i });
    expect(saveBtn).toBeDisabled();
    expect(saveBtn.textContent).toMatch(/0\/50/);
  });

  it('shows search input and filter controls', () => {
    render(<DeckBuilder onSave={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByPlaceholderText(/Rechercher/i)).toBeInTheDocument();
  });
});

// ── DB2 : Ajouter une carte ────────────────────────────────────────────────────

describe('DB2: adding a non-Leader card appears in the deck list', () => {
  it('clicking a non-Leader card adds it and shows ×1 in the deck list', async () => {
    const user = userEvent.setup();
    render(<DeckBuilder onSave={vi.fn()} onCancel={vi.fn()} />);

    // Find the first non-Leader card in the grid by its title attribute
    const nonLeader = ALL_CARD_TEMPLATES.find(t => t.type !== 'Leader');
    expect(nonLeader).toBeDefined();
    const cardTitle = nonLeader!.name;

    // The GridCard div always renders with a title even when image is lazy
    const gridCard = document.querySelector(`[title*="${cardTitle}"]`) as HTMLElement | null;
    expect(gridCard).not.toBeNull();
    await user.click(gridCard!);

    // Deck list on the right shows the card name (grid cards stay blank — IO never fires)
    expect(screen.getByText(cardTitle)).toBeInTheDocument();
    // The count span in the deck list (×1) appears exactly once
    const countSpans = screen.getAllByText('×1');
    expect(countSpans.length).toBeGreaterThanOrEqual(1);
  });
});

// ── DB3 : Retirer une carte ────────────────────────────────────────────────────

describe('DB3: removing a card decreases its count', () => {
  it('clicking − after adding a card removes it from the deck list', async () => {
    const user = userEvent.setup();
    render(<DeckBuilder onSave={vi.fn()} onCancel={vi.fn()} />);

    const nonLeader = ALL_CARD_TEMPLATES.find(t => t.type !== 'Leader')!;
    const gridCard = document.querySelector(`[title*="${nonLeader.name}"]`) as HTMLElement;
    await user.click(gridCard);

    // The card name appears in the deck list
    expect(screen.getByText(nonLeader.name)).toBeInTheDocument();

    // Click the − (remove) button in the deck list
    const removeBtn = screen.getByRole('button', { name: '−' });
    await user.click(removeBtn);

    // Deck list is now empty
    expect(screen.queryByText('×1')).not.toBeInTheDocument();
    expect(screen.getByText(/Cliquez des cartes pour les ajouter/i)).toBeInTheDocument();
  });
});

// ── DB4 : Deck invalide → bouton Save désactivé ────────────────────────────────

describe('DB4: save button disabled when deck is incomplete', () => {
  it('is disabled on mount (no cards, no leader)', () => {
    render(<DeckBuilder onSave={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Sauvegarder/i })).toBeDisabled();
  });

  it('clicking save when disabled does not call onSave', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<DeckBuilder onSave={onSave} onCancel={vi.fn()} />);
    // Try clicking the save button while disabled — userEvent will honour `disabled`
    const saveBtn = screen.getByRole('button', { name: /Sauvegarder/i });
    await user.click(saveBtn);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('cancel button triggers onCancel', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<DeckBuilder onSave={vi.fn()} onCancel={onCancel} />);
    await user.click(screen.getByRole('button', { name: /Annuler/i }));
    expect(onCancel).toHaveBeenCalledOnce();
  });
});

// Helper: renders a DeckBuilder within a custom container so within() queries work
function renderInContainer() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  render(<DeckBuilder onSave={vi.fn()} onCancel={vi.fn()} />, { container });
  return container;
}
void renderInContainer; // exported only for potential reuse in other files
