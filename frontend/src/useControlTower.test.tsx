import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';
import { bootstrapFixture, workflowFixture } from './test-fixtures';
import { useControlTower } from './useControlTower';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('workflow lifecycle and real-time transport', () => {
  it('loads history, accepts snapshots and explicitly falls back to polling on SSE failure', async () => {
    const close = vi.fn();
    let receive: ((event: { data: string }) => void) | undefined;
    const sources: TestEventSource[] = [];
    class TestEventSource {
      onerror?: () => void;
      close = close;
      constructor() {
        sources.push(this);
      }
      addEventListener(_type: string, callback: (event: { data: string }) => void) {
        receive = callback;
      }
    }
    vi.stubGlobal('EventSource', TestEventSource);
    vi.spyOn(api, 'bootstrap').mockResolvedValue(bootstrapFixture);
    vi.spyOn(api, 'history').mockResolvedValue({ items: [workflowFixture], total: 1 });
    const getWorkflow = vi.spyOn(api, 'workflow').mockResolvedValue(workflowFixture);
    const { result, unmount } = renderHook(useControlTower);
    await waitFor(() => expect(result.current.workflow?.id).toBe(workflowFixture.id));
    expect(localStorage.getItem('pernova.workflow')).toBe(workflowFixture.id);
    act(() => receive?.({ data: JSON.stringify(workflowFixture) }));
    expect(result.current.connection).toBe('live');
    act(() => sources.at(-1)?.onerror?.());
    expect(result.current.connection).toBe('reconnecting');
    expect(getWorkflow).toHaveBeenCalled();
    act(() => receive?.({ data: JSON.stringify({ ...workflowFixture, status: 'completed' }) }));
    expect(result.current.connection).toBe('complete');
    act(() => sources.at(-1)?.onerror?.());
    expect(result.current.connection).toBe('complete');
    unmount();
    expect(close).toHaveBeenCalled();
  });

  it('does not expose the prior workflow while another selection loads', async () => {
    vi.spyOn(api, 'bootstrap').mockResolvedValue(bootstrapFixture);
    vi.spyOn(api, 'history').mockResolvedValue({ items: [workflowFixture], total: 1 });
    vi.spyOn(api, 'workflow')
      .mockResolvedValueOnce(workflowFixture)
      .mockImplementation(() => new Promise(() => {}));
    const { result } = renderHook(useControlTower);
    await waitFor(() => expect(result.current.workflow?.id).toBe(workflowFixture.id));
    act(() => result.current.select('new-workflow'));
    expect(result.current.workflow).toBeNull();
    expect(result.current.selecting).toBe(true);
  });
});
