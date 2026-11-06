import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, request } from './api';
import { DEFAULT_WEIGHTS } from './logic';

afterEach(() => vi.unstubAllGlobals());

describe('exact API binding', () => {
  it('launches with contract snake_case data and no frontend credential', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ id: 'w' }), { status: 202 }));
    vi.stubGlobal('fetch', fetch);
    await api.launch('prompt-injection', DEFAULT_WEIGHTS);
    expect(fetch).toHaveBeenCalledWith(
      '/api/workflows',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ preset: 'prompt-injection', weights: DEFAULT_WEIGHTS }),
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });

  it('binds human decisions to scenario_id and reason', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{}'));
    vi.stubGlobal('fetch', fetch);
    await api.decision('workflow/one', 'approve', 'belgium', 'Approved for test');
    expect(fetch).toHaveBeenCalledWith(
      '/api/workflows/workflow%2Fone/decision',
      expect.objectContaining({
        body: JSON.stringify({
          decision: 'approve',
          scenario_id: 'belgium',
          reason: 'Approved for test',
        }),
      }),
    );
  });

  it('preserves server correlation identifiers on policy conflicts', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ detail: 'Revision conflict', correlation_id: 'trace-123' }),
            { status: 409 },
          ),
        ),
    );
    await expect(request('/api/policy')).rejects.toMatchObject({
      message: 'Revision conflict',
      correlationId: 'trace-123',
      status: 409,
    });
  });

  it('gives an honest connection error instead of supplying mock data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Network error')));
    await expect(api.bootstrap()).rejects.toBeInstanceOf(ApiError);
    await expect(api.bootstrap()).rejects.toThrow('Connexion API indisponible');
  });
});
