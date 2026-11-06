import { authHeaders } from './auth';
import type { Workflow } from './types';

export async function streamSnapshots(
  id: string,
  onSnapshot: (workflow: Workflow) => void,
  signal: AbortSignal,
): Promise<void> {
  const response = await fetch(`/api/workflows/${encodeURIComponent(id)}/events`, {
    headers: { Accept: 'text/event-stream', ...(await authHeaders()) },
    signal,
  });
  if (!response.ok || !response.body)
    throw new Error(`Flux SSE indisponible (${response.status}).`);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (!signal.aborted) {
      const { value, done } = await reader.read();
      if (done) return;
      buffer = (buffer + decoder.decode(value, { stream: true })).replace(/\r\n/g, '\n');
      let boundary: number;
      while ((boundary = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const lines = frame.split('\n');
        const event = lines
          .find((line) => line.startsWith('event:'))
          ?.slice(6)
          .trim();
        const data = lines
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart())
          .join('\n');
        if (event === 'snapshot' && data) {
          const workflow = JSON.parse(data) as Workflow;
          if (workflow.id !== id || !workflow.updated_at) throw new Error('Snapshot SSE invalide.');
          onSnapshot(workflow);
        }
      }
      if (buffer.length > 2_000_000) throw new Error('Flux SSE hors limites.');
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
