import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from './api';
import { DEFAULT_WEIGHTS } from './logic';
import type { Bootstrap, Preset, Weights, Workflow } from './types';
import { authConfig } from './auth';
import { streamSnapshots } from './sse';

type Connection = 'idle' | 'connecting' | 'live' | 'reconnecting' | 'complete';

function savedId(): string {
  try {
    return localStorage.getItem('pernova.workflow') ?? '';
  } catch {
    return '';
  }
}

export function useControlTower() {
  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null);
  const [history, setHistory] = useState<Workflow[]>([]);
  const [total, setTotal] = useState(0);
  const [selectedId, setSelectedId] = useState(savedId);
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [notice, setNotice] = useState('');
  const [connection, setConnection] = useState<Connection>('idle');
  const [retry, setRetry] = useState(0);
  const selectedRef = useRef(selectedId);
  const busyRef = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    selectedRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const reportError = useCallback((value: unknown) => {
    if (mounted.current)
      setError(
        value instanceof ApiError ? value : new ApiError('Une erreur inattendue est survenue.'),
      );
  }, []);

  const accept = useCallback((value: Workflow) => {
    if (!mounted.current) return;
    if (selectedRef.current === value.id) {
      setWorkflow((current) =>
        current?.id === value.id && current.updated_at > value.updated_at ? current : value,
      );
    }
    setHistory((items) => {
      const existing = items.find((item) => item.id === value.id);
      if (existing && existing.updated_at > value.updated_at) return items;
      return existing
        ? items.map((item) => (item.id === value.id ? value : item))
        : [value, ...items];
    });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      try {
        const [initial, list] = await Promise.all([
          api.bootstrap(controller.signal),
          api.history(0, controller.signal),
        ]);
        if (controller.signal.aborted) return;
        setBootstrap(initial);
        setHistory(list.items);
        setTotal(list.total);
        setSelectedId((current) => current || list.items[0]?.id || '');
        setError(null);
      } catch (value) {
        if (!controller.signal.aborted) reportError(value);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [retry, reportError]);

  useEffect(() => {
    try {
      if (selectedId) localStorage.setItem('pernova.workflow', selectedId);
      else localStorage.removeItem('pernova.workflow');
    } catch {
      /* Storage can be disabled by the browser's privacy settings. */
    }
    if (!selectedId) return;
    const controller = new AbortController();
    let source: EventSource | null = null;
    let streamController: AbortController | null = null;
    let pollTimer: number | undefined;
    let retryTimer: number | undefined;
    let stopped = false;
    let finished = false;
    let polling = false;
    const receive = (value: Workflow) => {
      if (stopped || finished || value.id !== selectedId) return;
      accept(value);
      if (['completed', 'rejected', 'blocked', 'degraded', 'failed'].includes(value.status)) {
        finished = true;
        source?.close();
        streamController?.abort();
        window.clearTimeout(pollTimer);
        window.clearTimeout(retryTimer);
        setConnection('complete');
        void api
          .bootstrap(controller.signal)
          .then((value) => {
            if (!stopped) setBootstrap(value);
          })
          .catch((error: unknown) => {
            if (!stopped) reportError(error);
          });
      }
    };
    async function poll() {
      if (stopped || finished || polling) return;
      window.clearTimeout(pollTimer);
      polling = true;
      try {
        receive(await api.workflow(selectedId, controller.signal));
      } catch (value) {
        if (!stopped) {
          reportError(value);
          if (value instanceof ApiError && value.status === 404) {
            setSelectedId('');
          }
        }
      } finally {
        polling = false;
        if (!stopped && !finished)
          pollTimer = window.setTimeout(() => {
            void poll();
          }, 3500);
      }
    }
    function connect() {
      if (stopped || finished) return;
      source?.close();
      streamController?.abort();
      if (authConfig.enabled) {
        const stream = new AbortController();
        streamController = stream;
        void streamSnapshots(
          selectedId,
          (value) => {
            if (!stopped) {
              receive(value);
              if (!finished) setConnection('live');
            }
          },
          stream.signal,
        )
          .then(() => {
            if (!stream.signal.aborted) fallback();
          })
          .catch(() => {
            if (!stopped && !stream.signal.aborted) fallback();
          });
        return;
      }
      if (typeof EventSource === 'undefined') {
        setConnection('reconnecting');
        return;
      }
      source = new EventSource(`/api/workflows/${encodeURIComponent(selectedId)}/events`);
      source.addEventListener('snapshot', (event: MessageEvent<string>) => {
        try {
          const value = JSON.parse(event.data) as Workflow;
          if (value.id !== selectedId || !value.updated_at) throw new Error('Invalid snapshot');
          receive(value);
          if (!finished) setConnection('live');
        } catch {
          fallback();
        }
      });
      source.onerror = fallback;
    }
    function fallback() {
      if (stopped || finished) return;
      source?.close();
      streamController?.abort();
      setConnection('reconnecting');
      window.clearTimeout(retryTimer);
      retryTimer = window.setTimeout(connect, 8000);
      void poll();
    }
    // Polling also detects a stalled stream; SSE snapshots remain the primary real-time channel.
    void poll();
    queueMicrotask(() => {
      if (!stopped && !finished) {
        setConnection('connecting');
        connect();
      }
    });
    return () => {
      stopped = true;
      source?.close();
      streamController?.abort();
      controller.abort();
      window.clearTimeout(pollTimer);
      window.clearTimeout(retryTimer);
    };
  }, [selectedId, accept, reportError, retry]);

  const act = useCallback(
    async (action: () => Promise<void>, message: string): Promise<boolean> => {
      if (busyRef.current) return false;
      busyRef.current = true;
      setPending(true);
      setError(null);
      setNotice('');
      try {
        await action();
        if (mounted.current) setNotice(message);
        return true;
      } catch (value) {
        reportError(value);
        return false;
      } finally {
        busyRef.current = false;
        if (mounted.current) setPending(false);
      }
    },
    [reportError],
  );

  const launch = (preset: Preset) =>
    act(async () => {
      const value = await api.launch(preset, workflow?.weights ?? DEFAULT_WEIGHTS);
      if (!mounted.current) return;
      selectedRef.current = value.id;
      setSelectedId(value.id);
      accept(value);
      setTotal((count) => count + 1);
      setBootstrap(await api.bootstrap());
    }, 'Analyse lancée. Les agents prennent le relais.');

  const rescore = (weights: Weights) =>
    act(async () => {
      if (!workflow || workflow.id !== selectedRef.current)
        throw new ApiError('Sélectionnez une analyse chargée.');
      accept(await api.rescore(workflow.id, weights));
    }, 'Comparaison recalculée par le moteur déterministe.');

  const decide = (decision: 'approve' | 'reject', scenarioId: string, reason: string) =>
    act(
      async () => {
        if (!workflow || workflow.id !== selectedRef.current)
          throw new ApiError('Sélectionnez une analyse chargée.');
        accept(await api.decision(workflow.id, decision, scenarioId, reason));
        setBootstrap(await api.bootstrap());
      },
      decision === 'approve'
        ? 'Décision enregistrée. Consultez la trace et le transfert.'
        : 'Plan refusé. Motif conservé dans la trace.',
    );

  const loadMore = async () => {
    if (historyLoading) return;
    setHistoryLoading(true);
    try {
      const list = await api.history(history.length);
      if (!mounted.current) return;
      setHistory((items) => [
        ...items,
        ...list.items.filter((item) => !items.some((existing) => existing.id === item.id)),
      ]);
      setTotal(list.total);
    } catch (value) {
      reportError(value);
    } finally {
      if (mounted.current) setHistoryLoading(false);
    }
  };

  const exportEvidence = () =>
    act(async () => {
      if (!workflow) return;
      const evidence = await api.export(workflow.id);
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(evidence, null, 2)], { type: 'application/json' }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = `pernova-audit-${workflow.id}.json`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, 'Export JSON de la preuve d’audit téléchargé.');

  const selectedWorkflow = workflow?.id === selectedId ? workflow : null;
  return {
    bootstrap,
    history,
    total,
    workflow: selectedWorkflow,
    selectedId,
    loading,
    selecting: Boolean(selectedId) && !selectedWorkflow,
    pending,
    error,
    notice,
    connection: selectedId ? connection : 'idle',
    historyLoading,
    select: setSelectedId,
    launch,
    rescore,
    decide,
    loadMore,
    exportEvidence,
    act,
    setBootstrap,
    reportError,
    clearError: () => setError(null),
    clearNotice: () => setNotice(''),
    reload: () => setRetry((value) => value + 1),
  };
}
