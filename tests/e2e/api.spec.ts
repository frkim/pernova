import { expect, test, type APIRequestContext } from '@playwright/test';

interface Workflow {
  id: string;
  trace_id: string;
  status: string;
  recommended_scenario_id: string | null;
  scenarios: { id: string; eligible: boolean; score: number }[];
  spans: { span_id: string; parent_span_id: string | null }[];
  events: { trace_id: string; decision: string }[];
  transfer: { id: string; quantity: number } | null;
}

const weights = { service: 45, cost: 20, delay: 15, co2: 10, risk: 10 };

async function completedAnalysis(request: APIRequestContext, preset: string): Promise<Workflow> {
  const response = await request.post('/api/workflows', { data: { preset, weights } });
  expect(response.status()).toBe(202);
  const created = (await response.json()) as Workflow;
  await expect
    .poll(async () => {
      const response = await request.get(`/api/workflows/${created.id}`);
      return ((await response.json()) as Workflow).status;
    })
    .not.toBe('running');
  const result = await request.get(`/api/workflows/${created.id}`);
  return (await result.json()) as Workflow;
}

test('nominal HTTP workflow keeps trace evidence and executes approval exactly once', async ({ request }) => {
  const workflow = await completedAnalysis(request, 'nominal');
  expect(workflow.status).toBe('awaiting_approval');
  expect(workflow.trace_id).toMatch(/^[a-f0-9]{32}$/);
  expect(workflow.spans.length).toBeGreaterThan(5);
  expect(workflow.events.every((event) => event.trace_id === workflow.trace_id)).toBe(true);
  const scenario = workflow.scenarios.find((item) => item.id === workflow.recommended_scenario_id);
  expect(scenario?.eligible).toBe(true);

  const decision = {
    decision: 'approve',
    scenario_id: workflow.recommended_scenario_id,
    reason: 'Validation du scénario synthétique en démonstration',
  };
  const approved = await request.post(`/api/workflows/${workflow.id}/decision`, { data: decision });
  expect(approved.ok()).toBe(true);
  const execution = (await approved.json()) as Workflow;
  expect(execution.status).toBe('completed');
  expect(execution.transfer?.quantity).toBeGreaterThan(0);

  const repeated = await request.post(`/api/workflows/${workflow.id}/decision`, { data: decision });
  expect(repeated.ok()).toBe(true);
  const replay = (await repeated.json()) as Workflow;
  expect(replay.transfer?.id).toBe(execution.transfer?.id);
  const evidence = await request.get(`/api/workflows/${workflow.id}/export`);
  expect(evidence.ok()).toBe(true);
  expect(evidence.headers()['content-type']).toContain('json');
});

test('human rejection cannot subsequently execute an approved transfer', async ({ request }) => {
  const workflow = await completedAnalysis(request, 'nominal');
  const rejected = await request.post(`/api/workflows/${workflow.id}/decision`, {
    data: {
      decision: 'reject',
      scenario_id: workflow.recommended_scenario_id,
      reason: 'Décision humaine de ne pas exécuter ce scénario',
    },
  });
  expect(rejected.ok()).toBe(true);
  expect(((await rejected.json()) as Workflow).status).toBe('rejected');
  const illegal = await request.post(`/api/workflows/${workflow.id}/decision`, {
    data: { decision: 'approve', scenario_id: workflow.recommended_scenario_id, reason: 'Contradiction' },
  });
  expect(illegal.status()).toBe(409);
});

test('invalid weights and knowledge input fail at the HTTP boundary', async ({ request }) => {
  const invalid = await request.post('/api/workflows', {
    data: { preset: 'nominal', weights: { ...weights, service: 99 } },
  });
  expect(invalid.status()).toBe(422);
  const result = await request.post('/api/knowledge/search', { data: { query: 'stock' } });
  expect(result.ok()).toBe(true);
  const knowledge = (await result.json()) as { items: { source: string; classification: string }[] };
  expect(knowledge.items.length).toBeGreaterThan(0);
  expect(knowledge.items.every((item) => item.source && item.classification)).toBe(true);
});

test('MCP discovery cannot grant the local operator a write tool', async ({ request }) => {
  const discovery = await request.post('/mcp', {
    data: { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} },
  });
  expect(discovery.ok()).toBe(true);
  const catalog = (await discovery.json()) as {
    result: { tools: { name: string }[] };
  };
  expect(catalog.result.tools.some((tool) => tool.name === 'create_stock_transfer')).toBe(false);
  const forged = await request.post('/mcp', {
    data: {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'create_stock_transfer',
        arguments: { agent_id: 'execution', quantity: 4000 },
      },
    },
  });
  // MCP errors are transported as JSON-RPC responses or an HTTP access denial.
  if (forged.ok()) {
    const payload = (await forged.json()) as { error?: { code: number }; result?: { isError: boolean } };
    expect(Boolean(payload.error) || payload.result?.isError === true).toBe(true);
  } else {
    expect([403, 422]).toContain(forged.status());
  }
});

test('upstream W3C tracing survives the API-to-orchestrator boundary', async ({ request }) => {
  const traceId = '4bf92f3577b34da6a3ce929d0e0e4736';
  const response = await request.post('/api/workflows', {
    headers: { traceparent: `00-${traceId}-00f067aa0ba902b7-01` },
    data: { preset: 'nominal', weights },
  });
  expect(response.status()).toBe(202);
  const workflow = (await response.json()) as Workflow;
  expect(workflow.trace_id).toBe(traceId);
  expect(workflow.events.every((event) => event.trace_id === traceId)).toBe(true);
  await expect.poll(async () => {
    const snapshot = await request.get(`/api/workflows/${workflow.id}`);
    return ((await snapshot.json()) as Workflow).status;
  }).not.toBe('running');
});

test('runaway tool calls suspend the agent before any business write', async ({ request }) => {
  try {
    const workflow = await completedAnalysis(request, 'tool-loop');
    expect(['degraded', 'blocked']).toContain(workflow.status);
    expect(workflow.transfer).toBeNull();
    const state = await request.get('/api/bootstrap');
    const bootstrap = (await state.json()) as { agents: { id: string; status: string }[] };
    expect(bootstrap.agents.find((agent) => agent.id === 'logistics')?.status).toBe('suspended');
  } finally {
    const resumed = await request.post('/api/agents/logistics/status', {
      data: { status: 'active', reason: 'Fin du test synthétique de suspension, reprise contrôlée' },
    });
    expect(resumed.ok()).toBe(true);
  }
});
