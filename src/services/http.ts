/**
 * 带超时 + 指数退避重试的 JSON 请求工具。
 *
 * 国内访问 jsDelivr / GitHub 常见的是「首包超时、再试就通」，
 * 所以默认策略是：单次 6 秒超时，失败后 400ms → 800ms → 1600ms 退避重试，
 * 但 4xx（除 429）不重试——那类错误重试只是白等。
 */

export interface FetchJsonOptions {
  /** 单次请求超时（毫秒），默认 6000 */
  timeoutMs?: number;
  /** **额外**重试次数，默认 2（即最多请求 3 次） */
  retries?: number;
  /** 首次退避时长（毫秒），默认 400，之后逐次翻倍 */
  backoffMs?: number;
  /** 额外请求头（会与 Accept: application/json 合并） */
  headers?: Record<string, string>;
}

export interface FetchJsonResult<T> {
  data: T;
  /** 响应的 Last-Modified 头（可能为空），用于数据日期兜底 */
  lastModified: string | null;
}

/** 带 HTTP 状态码的错误，便于判断是否值得重试 */
export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

/**
 * 请求超时（本地 AbortController 触发，不是服务端返回的 4xx/5xx）。
 * 单独一个类型是为了让界面能把「超时」和「断网」「状态码」区分开显示。
 */
export class HttpTimeoutError extends Error {
  readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super(`请求超时（${Math.round(timeoutMs / 1000)}s）`);
    this.name = 'HttpTimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function isRetryable(err: unknown): boolean {
  if (err instanceof HttpError) {
    // 限流与 5xx 值得再试；其余 4xx（404 / 403 鉴权等）重试无意义
    return err.status === 429 || err.status >= 500;
  }
  // 网络错误 / 超时 / JSON 截断 → 都当作可重试
  return true;
}

function timeoutError(timeoutMs: number): Error {
  return new HttpTimeoutError(timeoutMs);
}

async function fetchOnce<T>(
  url: string,
  timeoutMs: number,
  headers: Record<string, string> | undefined,
): Promise<FetchJsonResult<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      cache: 'no-store',
      headers: { Accept: 'application/json', ...headers },
    });
    if (!res.ok) throw new HttpError(res.status, `HTTP ${res.status}`);
    const data = (await res.json()) as T;
    return { data, lastModified: res.headers.get('last-modified') };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') throw timeoutError(timeoutMs);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 拉取 JSON（含超时与重试）。全部尝试都失败时抛出最后一次的错误。
 */
export async function fetchJsonWithRetry<T = unknown>(
  url: string,
  opts: FetchJsonOptions = {},
): Promise<FetchJsonResult<T>> {
  const timeoutMs = opts.timeoutMs ?? 6000;
  const retries = Math.max(0, opts.retries ?? 2);
  const backoffMs = opts.backoffMs ?? 400;

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fetchOnce<T>(url, timeoutMs, opts.headers);
    } catch (err) {
      lastError = err;
      if (attempt === retries || !isRetryable(err)) break;
      await sleep(backoffMs * 2 ** attempt);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
