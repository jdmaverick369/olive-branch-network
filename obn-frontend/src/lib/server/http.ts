/** Small, bounded HTTP primitives shared by server routes. Never return provider errors. */
export class ApiError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}

async function readBytes(body: ReadableStream<Uint8Array> | null, maxBytes: number, signal: AbortSignal) {
  if (!body) throw new ApiError(400, "Missing JSON body");
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let abort: () => void = () => {};
  const stopped = new Promise<never>((_, reject) => {
    abort = () => reject(new ApiError(504, "Request timed out"));
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  });
  try {
    while (true) {
      const { value, done } = await Promise.race([reader.read(), stopped]);
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new ApiError(413, "JSON body is too large");
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    void reader.cancel().catch(() => {});
    throw error;
  } finally {
    signal.removeEventListener("abort", abort);
    reader.releaseLock();
  }
}

function checkLength(headers: Headers, maxBytes: number) {
  const length = headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > maxBytes)) {
    throw new ApiError(413, "JSON body is too large");
  }
}

export async function readRequestJson(request: Request, maxBytes: number): Promise<unknown> {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") ?? "")) {
    throw new ApiError(415, "Content-Type must be application/json");
  }
  checkLength(request.headers, maxBytes);
  try {
    return JSON.parse(await readBytes(request.body, maxBytes, AbortSignal.timeout(5_000)));
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, "Invalid JSON body");
  }
}

export async function fetchJsonBounded(
  url: string,
  init: RequestInit = {},
  options: { maxBytes?: number; timeoutMs?: number; onStatus?: (status: number) => void; allowRedirect?: (url: URL) => boolean } = {},
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 8_000);
  const signal = init.signal ? AbortSignal.any([init.signal, controller.signal]) : controller.signal;
  try {
    let target = url;
    let response: Response;
    for (let redirects = 0; ; redirects++) {
      response = await fetch(target, { ...init, signal, redirect: options.allowRedirect ? "manual" : "error", cache: "no-store" });
      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      void response.body?.cancel().catch(() => {});
      const location = response.headers.get("location");
      if (redirects >= 2 || !location || !options.allowRedirect) throw new Error("Redirect rejected");
      const next = new URL(location, target);
      if (next.protocol !== "https:" || next.username || next.password || next.port || !options.allowRedirect(next)) throw new Error("Redirect rejected");
      target = next.toString();
    }
    if (!response.ok) {
      void response.body?.cancel().catch(() => {});
      throw new ApiError(502, "Upstream service unavailable");
    }
    options.onStatus?.(response.status);
    const maxBytes = options.maxBytes ?? 256 * 1024;
    try { checkLength(response.headers, maxBytes); }
    catch (error) { void response.body?.cancel().catch(() => {}); throw error; }
    return JSON.parse(await readBytes(response.body, maxBytes, signal));
  } catch {
    throw new ApiError(signal.aborted ? 504 : 502, "Upstream service unavailable");
  } finally {
    clearTimeout(timer);
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Per-instance defense in depth. Project-wide limits belong in the Vercel WAF. */
export function createResourceGuard(options: {
  requestsPerMinute: number; maxConcurrent: number; cacheMs?: number; maxEntries?: number; coalesce?: boolean;
}) {
  let windowStart = 0;
  let count = 0;
  let active = 0;
  const cache = new Map<string, { expires: number; value: unknown }>();
  const pending = new Map<string, Promise<unknown>>();
  return async function guarded<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const hit = cache.get(key);
    if (hit && hit.expires > now) return hit.value as T;
    cache.delete(key);
    const shared = options.coalesce === false ? undefined : pending.get(key);
    if (shared) return shared as Promise<T>;
    if (now - windowStart >= 60_000) { windowStart = now; count = 0; }
    if (count >= options.requestsPerMinute || active >= options.maxConcurrent) {
      throw new ApiError(429, "Service busy; please try again shortly");
    }
    count++; active++;
    const task = Promise.resolve().then(operation).then((value) => {
      if (options.cacheMs) {
        // Both entry count and individual response size are bounded by callers.
        while (cache.size >= (options.maxEntries ?? 128)) cache.delete(cache.keys().next().value!);
        cache.set(key, { value, expires: Date.now() + options.cacheMs });
      }
      return value;
    }).finally(() => { active--; if (options.coalesce !== false) pending.delete(key); });
    if (options.coalesce !== false) pending.set(key, task);
    return task;
  };
}
