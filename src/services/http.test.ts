import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchJsonWithRetry, HttpError } from './http';

/** 最小 Response 替身：只提供本项目用到的 ok / status / headers / json */
function fakeResponse(
  body: unknown,
  init: { ok?: boolean; status?: number; lastModified?: string | null } = {},
) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    headers: {
      get: (key: string) =>
        key.toLowerCase() === 'last-modified' ? (init.lastModified ?? null) : null,
    },
    json: async () => body,
  } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchJsonWithRetry', () => {
  it('首次失败后自动重试并成功', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(fakeResponse({ ok: 1 }, { lastModified: 'Sun, 22 Nov 2026 04:59:57 GMT' }));

    vi.stubGlobal('fetch', fetchMock);

    const res = await fetchJsonWithRetry<{ ok: number }>('https://example.com/a.json', {
      retries: 2,
      backoffMs: 1,
    });

    expect(res.data).toEqual({ ok: 1 });
    expect(res.lastModified).toBe('Sun, 22 Nov 2026 04:59:57 GMT');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('重试次数用尽后抛出最后一次错误', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('boom'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      fetchJsonWithRetry('https://example.com/a.json', { retries: 2, backoffMs: 1 }),
    ).rejects.toThrow('boom');
    // 1 次首发 + 2 次重试
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('5xx 会重试，4xx 直接失败（重试无意义）', async () => {
    const server = vi
      .fn()
      .mockResolvedValueOnce(fakeResponse(null, { ok: false, status: 503 }))
      .mockResolvedValueOnce(fakeResponse({ ok: true }));
    vi.stubGlobal('fetch', server);
    await expect(
      fetchJsonWithRetry('https://example.com/a.json', { retries: 2, backoffMs: 1 }),
    ).resolves.toMatchObject({ data: { ok: true } });
    expect(server).toHaveBeenCalledTimes(2);

    const notFound = vi.fn().mockResolvedValue(fakeResponse(null, { ok: false, status: 404 }));
    vi.stubGlobal('fetch', notFound);
    await expect(
      fetchJsonWithRetry('https://example.com/a.json', { retries: 2, backoffMs: 1 }),
    ).rejects.toBeInstanceOf(HttpError);
    expect(notFound).toHaveBeenCalledTimes(1);
  });
});
