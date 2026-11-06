import type { Bootstrap, Workflow } from './types';
import { DEFAULT_WEIGHTS } from './logic';

export const bootstrapFixture: Bootstrap = {
  mode: 'demo',
  agents: [],
  policy: {
    revision: 1,
    max_tool_calls: 10,
    max_tokens: 25000,
    max_cost_eur: 15,
    approval_quantity: 2500,
    approval_cost_eur: 15000,
    allowed_models: ['test-model'],
    blocked_tools: [],
  },
  integrations: [
    {
      id: 'agent365',
      name: 'Agent 365',
      status: 'not_connected',
      description: 'Connexion tenant requise.',
    },
  ],
  knowledge: [],
  presets: [],
  metrics: { workflows: 0, total_cost_eur: 0, total_tokens: 0, blocked_calls: 0 },
};

export const workflowFixture: Workflow = {
  id: 'test-workflow',
  trace_id: 'test-trace',
  preset: 'nominal',
  status: 'awaiting_approval',
  created_at: '2026-11-06T09:00:00Z',
  updated_at: '2026-11-06T09:00:00Z',
  policy_revision: 1,
  incident: {
    shipment_id: 'TEST-SHIPMENT',
    product: 'Test product',
    quantity: 12000,
    market: 'France',
    delay_days: 7,
    reason: 'Congestion',
  },
  agents: [],
  scenarios: [
    {
      id: 'belgium',
      name: 'Transfert Belgique',
      description: 'Plan synthétique de test',
      service_pct: 94,
      cost_eur: 18500,
      delay_days: 2,
      co2_kg: 700,
      risk: 15,
      score: 85,
      quantity: 4000,
      source_country: 'Belgique',
      eligible: true,
      constraint: '',
    },
  ],
  recommended_scenario_id: 'belgium',
  weights: DEFAULT_WEIGHTS,
  citations: [],
  spans: [],
  events: [],
  approval: { status: 'pending', scenario_id: 'belgium', reason: '', decided_at: null },
  transfer: null,
  metrics: { tokens: 0, cost_eur: 0, tool_calls: 0, blocked_calls: 0, duration_ms: 0 },
};
