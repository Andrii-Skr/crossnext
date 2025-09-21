export async function fetcher<T>(
  input: RequestInfo,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(input, {
    credentials: "same-origin",
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw Object.assign(new Error(text || `HTTP ${res.status}`), {
      status: res.status,
    });
  }
  return res.json() as Promise<T>;
}
