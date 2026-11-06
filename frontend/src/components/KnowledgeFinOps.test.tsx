import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { bootstrapFixture, workflowFixture } from '../test-fixtures';
import { FinOps } from './KnowledgeFinOps';

describe('synthetic FinOps table', () => {
  it('sorts raw numeric metrics and filters without changing API costs', () => {
    render(
      <FinOps
        bootstrap={bootstrapFixture}
        workflow={{
          ...workflowFixture,
          agents: [
            {
              agent_id: 'alpha',
              status: 'completed',
              summary: '',
              tokens: 10,
              cost_eur: 0.1,
              tool_calls: 1,
              duration_ms: 10,
            },
            {
              agent_id: 'beta',
              status: 'completed',
              summary: '',
              tokens: 2,
              cost_eur: 0.02,
              tool_calls: 2,
              duration_ms: 10,
            },
          ],
        }}
      />,
    );
    const table = screen.getByRole('grid', { name: 'Coûts détaillés des agents' });
    fireEvent.click(within(table).getByRole('columnheader', { name: /Tokens/ }));
    expect(
      within(table)
        .getAllByRole('gridcell')
        .filter((cell) => cell.dataset.field === 'agent')
        .map((cell) => cell.textContent),
    ).toEqual(['beta', 'alpha']);
    fireEvent.change(screen.getByLabelText('Filtrer Agent'), { target: { value: 'alpha' } });
    expect(
      within(table)
        .getAllByRole('gridcell')
        .filter((cell) => cell.dataset.field === 'agent'),
    ).toHaveLength(1);
    expect(within(table).getByRole('gridcell', { name: /0,10\s*€/ })).toBeVisible();
    expect(screen.getByText(/Tous les montants IA sont synthétiques/)).toBeVisible();
  });
});
