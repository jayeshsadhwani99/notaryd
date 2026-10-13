export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const response = await fetch(`/api/engine${path}`, { ...init, headers, cache: 'no-store' });
  const data = parseJson(await response.text());
  if (!response.ok) {
    const error = new Error(errorMessage(data, response.statusText));
    if (response.status === 401) error.name = 'Unauthorized';
    throw error;
  }
  return data as T;
}

function parseJson(text: string): unknown {
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

function errorMessage(data: unknown, fallback: string) {
  if (!data || typeof data !== 'object') return fallback;
  const body = data as { error?: unknown; message?: unknown };
  if (typeof body.error === 'string' && body.error) return body.error;
  if (typeof body.message === 'string' && body.message) return body.message;
  if (Array.isArray(body.message) && body.message.length) return body.message.map(String).join(' ');
  return fallback;
}
