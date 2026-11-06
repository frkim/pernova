export type Weights = {
  service: number;
  cost: number;
  delay: number;
  co2: number;
  risk: number;
};

export type Preset = 'nominal' | 'tool-loop' | 'prompt-injection' | 'unapproved-model' | 'pii';

export type Policy = {
  revision: number;
  max_tool_calls: number;
  max_tokens: number;
  max_cost_eur: number;
  approval_quantity: number;
  approval_cost_eur: number;
  allowed_models: string[];
  blocked_tools: string[];
};

export type Agent = {
  id: string;
  name: string;
  role: string;
  owner: string;
  version: string;
  model: string;
  status: 'active' | 'suspended';
  tools: string[];
  description: string;
};

export type Integration = {
  id: string;
  name: string;
  status: 'local' | 'configured' | 'not_connected';
  description: string;
};

export type KnowledgeDocument = {
  id: string;
  title: string;
  content: string;
  classification: string;
  source: string;
  version: string;
  owner: string;
  updated_at: string;
};

export type Bootstrap = {
  mode: 'demo' | 'connected';
  agents: Agent[];
  policy: Policy;
  integrations: Integration[];
  knowledge: KnowledgeDocument[];
  presets: { id: string; name: string; description: string }[];
  metrics: {
    workflows: number;
    total_cost_eur: number;
    total_tokens: number;
    blocked_calls: number;
  };
};

export type Scenario = {
  id: string;
  name: string;
  description: string;
  service_pct: number;
  cost_eur: number;
  delay_days: number;
  co2_kg: number;
  risk: number;
  score: number;
  quantity: number;
  source_country: string;
  eligible: boolean;
  constraint: string;
};

export type Span = {
  span_id: string;
  parent_span_id: string | null;
  name: string;
  agent_id: string | null;
  started_at: string;
  duration_ms: number;
  status: string;
  attributes: Record<string, string | number | boolean>;
};

export type AuditEvent = {
  id: string;
  timestamp: string;
  kind: string;
  agent_id: string | null;
  message: string;
  decision: string;
  trace_id: string;
};

export type Workflow = {
  id: string;
  trace_id: string;
  preset: Preset;
  status:
    'running' | 'awaiting_approval' | 'completed' | 'rejected' | 'blocked' | 'degraded' | 'failed';
  created_at: string;
  updated_at: string;
  policy_revision: number;
  incident: {
    shipment_id: string;
    product: string;
    quantity: number;
    market: string;
    delay_days: number;
    reason: string;
  };
  agents: {
    agent_id: string;
    status: 'pending' | 'running' | 'completed' | 'suspended' | 'blocked' | 'failed';
    summary: string;
    tokens: number;
    cost_eur: number;
    tool_calls: number;
    duration_ms: number;
  }[];
  scenarios: Scenario[];
  recommended_scenario_id: string | null;
  weights: Weights;
  citations: string[];
  spans: Span[];
  events: AuditEvent[];
  approval: {
    status: 'pending' | 'approved' | 'rejected';
    scenario_id: string;
    reason: string;
    decided_at: string | null;
  } | null;
  transfer: {
    id: string;
    quantity: number;
    source_country: string;
    destination_country: string;
    idempotency_key: string;
  } | null;
  metrics: {
    tokens: number;
    cost_eur: number;
    tool_calls: number;
    blocked_calls: number;
    duration_ms: number;
  };
};
