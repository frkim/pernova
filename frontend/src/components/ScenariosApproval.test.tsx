import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { workflowFixture } from '../test-fixtures';
import { ApprovalPanel, ScenarioComparison } from './ScenariosApproval';
import type { Workflow } from '../types';

describe('accessible human approval', () => {
  it('requires a reason and binds the decision to the selected scenario', () => {
    const decide = vi.fn().mockResolvedValue(true);
    render(
      <ApprovalPanel
        workflow={workflowFixture}
        scenario={workflowFixture.scenarios[0]}
        pending={false}
        onDecide={decide}
      />,
    );
    expect(screen.getByRole('complementary', { name: 'Validation humaine' })).toBeVisible();
    const approve = screen.getByRole('button', { name: 'Approuver le plan' });
    expect(approve).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Motif de la décision'), {
      target: { value: 'Priorité promotion confirmée' },
    });
    expect(approve).toBeEnabled();
    fireEvent.click(approve);
    expect(decide).toHaveBeenCalledWith('approve', 'belgium', 'Priorité promotion confirmée');
    fireEvent.click(screen.getByRole('button', { name: 'Refuser le plan' }));
    expect(decide).toHaveBeenCalledWith('reject', 'belgium', 'Priorité promotion confirmée');
    expect(screen.getByLabelText('Motif de la décision')).toHaveAttribute('maxlength', '500');
  });

  it('disables sensitive actions while pending', () => {
    render(
      <ApprovalPanel
        workflow={workflowFixture}
        scenario={workflowFixture.scenarios[0]}
        pending={true}
        onDecide={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('Motif de la décision')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Approuver le plan' })).toBeDisabled();
  });

  it.each(['completed', 'rejected', 'blocked', 'degraded', 'failed'] as Workflow['status'][])(
    'disables rescore and selection for terminal %s',
    (status) => {
      render(
        <ScenarioComparison
          workflow={{ ...workflowFixture, status }}
          selectedId="belgium"
          pending={false}
          onSelect={vi.fn()}
          onRescore={vi.fn()}
        />,
      );
      expect(screen.getByRole('radio', { name: 'Sélectionner Transfert Belgique' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Recalculer les scénarios' })).toBeDisabled();
      expect(screen.getAllByRole('slider')).toHaveLength(5);
      screen.getAllByRole('slider').forEach((slider) => expect(slider).toBeDisabled());
    },
  );

  it('prevents numeric weights totalling less than 100 from reaching the API', () => {
    const rescore = vi.fn();
    render(
      <ScenarioComparison
        workflow={workflowFixture}
        selectedId="belgium"
        pending={false}
        onSelect={vi.fn()}
        onRescore={rescore}
      />,
    );
    fireEvent.change(screen.getByLabelText('Poids Service client'), { target: { value: '44' } });
    expect(screen.getByRole('button', { name: 'Recalculer les scénarios' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Normaliser à 100 %' }));
    expect(screen.getByRole('button', { name: 'Recalculer les scénarios' })).toBeEnabled();
    expect(rescore).not.toHaveBeenCalled();
  });

  it('filters scenario options without changing the selected approval target', () => {
    const select = vi.fn();
    render(
      <ScenarioComparison
        workflow={{
          ...workflowFixture,
          scenarios: [
            ...workflowFixture.scenarios,
            {
              ...workflowFixture.scenarios[0],
              id: 'alternative',
              name: 'Plan alternatif',
              score: 70,
            },
          ],
        }}
        selectedId="belgium"
        pending={false}
        onSelect={select}
        onRescore={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText('Filtrer Plan de mitigation'), {
      target: { value: 'alternatif' },
    });
    expect(screen.queryByRole('radio', { name: 'Sélectionner Transfert Belgique' })).toBeNull();
    expect(select).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('radio', { name: 'Sélectionner Plan alternatif' }));
    expect(select).toHaveBeenCalledWith('alternative');
    fireEvent.click(screen.getByRole('button', { name: 'Effacer les filtres' }));
    expect(screen.getByRole('radio', { name: 'Sélectionner Transfert Belgique' })).toBeChecked();
  });
});
