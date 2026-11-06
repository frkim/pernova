import type { Bootstrap, KnowledgeDocument, Policy, Preset, Weights, Workflow } from './types';
import { authHeaders } from './auth';

export class ApiError extends Error {
  constructor(
    message: string,
    public correlationId?: string,
    public status?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  init.signal?.addEventListener('abort', onAbort, { once: true });
  if (init.signal?.aborted) controller.abort();
  const timeout = window.setTimeout(() => controller.abort(), 20_000);
  try {
    const authorization = await authHeaders().catch((error: unknown) => {
      throw new ApiError(
        error instanceof Error ? error.message : 'Authentification Entra requise.',
      );
    });
    const response = await fetch(path, {
      ...init,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...init.headers, ...authorization },
    });
    if (!response.ok) {
      const error = (await response.json().catch(() => ({}))) as {
        detail?: unknown;
        correlation_id?: string;
      };
      throw new ApiError(
        typeof error.detail === 'string' ? error.detail : `Erreur API (${response.status}).`,
        error.correlation_id,
        response.status,
      );
    }
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (init.signal?.aborted) throw error;
    throw new ApiError(
      controller.signal.aborted
        ? 'Le serveur ne répond pas dans le délai prévu. Réessayez.'
        : 'Connexion API indisponible. Vérifiez le backend local ou le service déployé.',
    );
  } finally {
    window.clearTimeout(timeout);
    init.signal?.removeEventListener('abort', onAbort);
  }
}

const path = (id: string) => `/api/workflows/${encodeURIComponent(id)}`;
export const api = {
  bootstrap: (signal?: AbortSignal) => request<Bootstrap>('/api/bootstrap', { signal }),
  history: (offset = 0, signal?: AbortSignal) =>
    request<{ items: Workflow[]; total: number }>(`/api/workflows?limit=20&offset=${offset}`, {
      signal,
    }),
  workflow: (id: string, signal?: AbortSignal) => request<Workflow>(path(id), { signal }),
  launch: (preset: Preset, weights: Weights) =>
    request<Workflow>('/api/workflows', {
      method: 'POST',
      body: JSON.stringify({ preset, weights }),
    }),
  rescore: (id: string, weights: Weights) =>
    request<Workflow>(`${path(id)}/rescore`, { method: 'POST', body: JSON.stringify({ weights }) }),
  decision: (id: string, decision: 'approve' | 'reject', scenario_id: string, reason: string) =>
    request<Workflow>(`${path(id)}/decision`, {
      method: 'POST',
      body: JSON.stringify({ decision, scenario_id, reason }),
    }),
  agentStatus: (id: string, status: 'active' | 'suspended', reason: string) =>
    request<Bootstrap>(`/api/agents/${encodeURIComponent(id)}/status`, {
      method: 'POST',
      body: JSON.stringify({ status, reason }),
    }),
  policy: (policy: Policy) =>
    request<Bootstrap>('/api/policy', { method: 'PUT', body: JSON.stringify(policy) }),
  search: (query: string, signal?: AbortSignal) =>
    request<{ items: KnowledgeDocument[] }>('/api/knowledge/search', {
      method: 'POST',
      body: JSON.stringify({ query }),
      signal,
    }),
  export: (id: string) => request<unknown>(`${path(id)}/export`),
};
