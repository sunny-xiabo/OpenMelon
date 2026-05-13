import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { APIError, fetchJSON } from './client';

describe('api client', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('adds request id and parses JSON responses', async () => {
    fetch.mockResolvedValue(new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));

    await expect(fetchJSON('/api/demo', { requestId: 'req_test' })).resolves.toEqual({ ok: true });

    expect(fetch).toHaveBeenCalledWith('/api/demo', expect.objectContaining({
      method: 'GET',
      headers: expect.objectContaining({ 'X-Request-ID': 'req_test' }),
    }));
  });

  it('normalizes server errors and emits global API error event', async () => {
    const listener = vi.fn();
    window.addEventListener('openmelon:api-error', listener);
    fetch.mockResolvedValue(new Response(JSON.stringify({
      error: { code: 'BROKEN', message: '后端失败', details: 'boom' },
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'X-Request-ID': 'req_server' },
    }));

    await expect(fetchJSON('/api/fail', { requestId: 'req_client' })).rejects.toMatchObject({
      name: 'APIError',
      status: 500,
      code: 'BROKEN',
      requestId: 'req_server',
      message: '后端失败',
    });
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({
      detail: expect.any(APIError),
    }));
    window.removeEventListener('openmelon:api-error', listener);
  });

  it('converts network failures to APIError', async () => {
    fetch.mockRejectedValue(new Error('socket closed'));
    await expect(fetchJSON('/api/network', { requestId: 'req_net' })).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
      requestId: 'req_net',
    });
  });
});
