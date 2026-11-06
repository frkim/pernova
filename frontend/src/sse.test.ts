import { afterEach, describe, expect, it, vi } from 'vitest';
import { streamSnapshots } from './sse';
import { workflowFixture } from './test-fixtures';

afterEach(() => vi.unstubAllGlobals());

describe('authenticated-compatible snapshot stream', () => {
  it('decodes snapshot events across CRLF and chunk boundaries without URL tokens', async () => {
    const text = `: heartbeat\r\n\r\nevent: snapshot\r\ndata: ${JSON.stringify(workflowFixture)}\r\n\r\n`;
    const encoded = new TextEncoder().encode(text);
    const chunks = [
      encoded.slice(0, 13),
      encoded.slice(13, 30),
      encoded.slice(30, -1),
      encoded.slice(-1),
    ];
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        chunks.forEach((chunk) => controller.enqueue(chunk));
        controller.close();
      },
    });
    const fetch = vi.fn().mockResolvedValue(
      new Response(body, {
        headers: { 'Content-Type': 'text/event-stream' },
      }),
    );
    vi.stubGlobal('fetch', fetch);
    const snapshot = vi.fn();
    await streamSnapshots(workflowFixture.id, snapshot, new AbortController().signal);
    expect(snapshot).toHaveBeenCalledWith(workflowFixture);
    expect(fetch).toHaveBeenCalledWith(
      '/api/workflows/test-workflow/events',
      expect.objectContaining({
        headers: { Accept: 'text/event-stream' },
      }),
    );
  });

  it('rejects events for a different workflow', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(`event: snapshot\ndata: ${JSON.stringify(workflowFixture)}\n\n`),
        ),
    );
    await expect(
      streamSnapshots('other-id', vi.fn(), new AbortController().signal),
    ).rejects.toThrow('Snapshot SSE invalide');
  });
});
