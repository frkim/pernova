import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { api } from './api';
import { bootstrapFixture } from './test-fixtures';
import './components/Governance';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('executive empty-state rendering', () => {
  it('offers accessible navigation and actual launch without fabricating workflows', async () => {
    vi.spyOn(api, 'bootstrap').mockResolvedValue(bootstrapFixture);
    vi.spyOn(api, 'history').mockResolvedValue({ items: [], total: 0 });
    render(<App />);
    expect(
      await screen.findByRole('heading', { name: /Anticiper. Décider. Garder le contrôle./ }),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Lancer l’analyse' })).toBeEnabled();
    expect(screen.getByRole('navigation', { name: 'Navigation principale' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Approuver le plan' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Gouvernance' }));
    expect(await screen.findByText('À connecter au tenant')).toBeVisible();
    expect(screen.getByText(/Cocher une case ne vérifie ni ne connecte un service/)).toBeVisible();
  });
});
