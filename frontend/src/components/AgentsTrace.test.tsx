import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Agent } from '../types';
import { AgentGraph } from './AgentsTrace';

describe('six-specialist orchestration graph', () => {
  it('keeps the backend supervisor separate from the six execution nodes', () => {
    const agents: Agent[] = [
      'execution',
      'demand',
      'supervisor',
      'logistics',
      'intake',
      'scenario',
      'inventory',
    ].map((id) => ({
      id,
      name: id === 'supervisor' ? 'Supply Chain Supervisor' : `${id} Agent`,
      role: id === 'supervisor' ? 'Orchestrator' : 'Specialist',
      owner: 'Test owner',
      version: '1.0',
      model: 'test-model',
      status: 'active',
      tools: [],
      description: 'Synthetic unit-test registry',
    }));
    render(<AgentGraph agents={agents} workflow={null} />);
    expect(screen.getAllByRole('article')).toHaveLength(6);
    expect(screen.getByText('7 agents · 6 spécialisés')).toBeVisible();
    expect(screen.getByText('Supply Chain Supervisor')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'intake' })).toBeVisible();
    expect(
      screen
        .getAllByRole('article')
        .map((article) => within(article).getByRole('heading').textContent),
    ).toEqual(['intake', 'demand', 'inventory', 'logistics', 'scenario', 'execution']);
  });
});
