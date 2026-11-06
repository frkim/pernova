import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DomainTable } from './DomainTable';
import type { DomainColumn } from './DomainTable';
import ThemeController from '../ThemeController';

const rows = [
  { id: 'a', name: 'Équipe Alpha', cost: 10 },
  { id: 'b', name: 'Beta', cost: 2 },
  { id: 'c', name: 'Gamma', cost: 30 },
  { id: 'd', name: 'Delta', cost: 4 },
  { id: 'e', name: 'Epsilon', cost: 5 },
  { id: 'f', name: 'Zeta', cost: 6 },
];
const columns: DomainColumn<(typeof rows)[number]>[] = [
  { id: 'name', label: 'Agent', value: (row) => row.name },
  { id: 'cost', label: 'Coût', value: (row) => row.cost },
];

function renderTable(props: { loading?: boolean; error?: string; rows?: typeof rows } = {}) {
  return render(
    <ThemeController>
      <DomainTable
        label="Agents"
        columns={columns}
        rows={rows}
        rowId={(row) => row.id}
        {...props}
      />
    </ThemeController>,
  );
}

function rowNames() {
  const table = screen.getByRole('grid', { name: 'Agents' });
  return within(table)
    .getAllByRole('gridcell')
    .filter((cell) => cell.dataset.field === 'name')
    .map((cell) => cell.textContent);
}

afterEach(() => vi.useRealTimers());

describe('bounded domain table controls', () => {
  it('sorts each column in both directions, including numeric values', () => {
    renderTable();
    fireEvent.click(screen.getByRole('columnheader', { name: /Coût/ }));
    expect(rowNames().slice(0, 2)).toEqual(['Beta', 'Delta']);
    fireEvent.click(screen.getByRole('columnheader', { name: /Coût/ }));
    expect(rowNames().slice(0, 2)).toEqual(['Gamma', 'Équipe Alpha']);
    fireEvent.click(screen.getByRole('columnheader', { name: /Agent/ }));
    expect(rowNames()[0]).toBe('Beta');
    fireEvent.click(screen.getByRole('columnheader', { name: /Agent/ }));
    expect(rowNames()[0]).toBe('Zeta');
    expect(screen.getByRole('columnheader', { name: /Agent/ })).toHaveAttribute(
      'aria-sort',
      'descending',
    );
  });

  it('combines column filters and exposes a recoverable empty result', () => {
    renderTable();
    fireEvent.change(screen.getByLabelText('Filtrer Agent'), { target: { value: 'equipe' } });
    expect(rowNames()).toEqual(['Équipe Alpha']);
    fireEvent.change(screen.getByLabelText('Filtrer Coût'), { target: { value: '2' } });
    expect(screen.getByText('Aucun résultat pour ces filtres.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Effacer les filtres' }));
    expect(rowNames()).toHaveLength(5);
  });

  it('debounces global search across columns and cancels superseded queries', () => {
    vi.useFakeTimers();
    renderTable();
    fireEvent.change(screen.getByLabelText('Rechercher dans Agents'), {
      target: { value: 'Gamma' },
    });
    act(() => vi.advanceTimersByTime(299));
    expect(rowNames()).toHaveLength(5);
    fireEvent.change(screen.getByLabelText('Rechercher dans Agents'), { target: { value: '2' } });
    act(() => vi.advanceTimersByTime(300));
    expect(rowNames()).toEqual(['Beta']);
  });

  it('paginates, changes page size and resets to the first page when filtered', () => {
    renderTable();
    expect(rowNames()).toHaveLength(5);
    fireEvent.click(screen.getByRole('button', { name: 'Page suivante' }));
    expect(rowNames()).toEqual(['Zeta']);
    fireEvent.change(screen.getByLabelText('Filtrer Agent'), { target: { value: 'Beta' } });
    expect(rowNames()).toEqual(['Beta']);
    expect(screen.getByRole('button', { name: 'Page précédente' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Effacer les filtres' }));
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Lignes par page' }));
    fireEvent.click(screen.getByRole('option', { name: '10' }));
    expect(rowNames()).toHaveLength(6);
  });

  it('clamps the current page when updated API data contains fewer rows', () => {
    const { rerender } = renderTable();
    fireEvent.click(screen.getByRole('button', { name: 'Page suivante' }));
    rerender(
      <ThemeController>
        <DomainTable
          label="Agents"
          columns={columns}
          rows={rows.slice(0, 1)}
          rowId={(row) => row.id}
        />
      </ThemeController>,
    );
    expect(rowNames()).toEqual(['Équipe Alpha']);
  });

  it('supports keyboard sorting and grid cell navigation', () => {
    renderTable();
    const sorter = screen.getByRole('columnheader', { name: /Coût/ });
    sorter.focus();
    expect(sorter).toHaveFocus();
    fireEvent.keyDown(sorter, { key: 'Enter' });
    expect(rowNames()[0]).toBe('Beta');
    fireEvent.keyDown(sorter, { key: 'ArrowDown' });
    expect(screen.getByRole('gridcell', { name: '2' })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole('gridcell', { name: '2' }), { key: 'ArrowDown' });
    expect(screen.getByRole('gridcell', { name: '4' })).toHaveFocus();
  });

  it.each([
    [{ rows: [] }, 'Aucune donnée disponible.'],
    [{ rows: [], loading: true }, 'Actualisation des données…'],
    [{ rows: [], error: 'Lecture impossible' }, 'Données indisponibles.'],
  ] as const)('shows an explicit state for %o', (props, message) => {
    renderTable({ ...props, rows: [] });
    expect(screen.getByText(message)).toBeVisible();
    if ('error' in props) expect(screen.getByRole('alert')).toHaveTextContent(props.error);
  });
});
