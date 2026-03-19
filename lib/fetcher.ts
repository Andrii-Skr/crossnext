export async function fetcher<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    credentials: "same-origin",
    ...init,
  });
  if (!res.ok) {
    let text = "";
    let payload: unknown;
    try {
      text = await res.text();
      payload = text ? (JSON.parse(text) as unknown) : undefined;
    } catch {
      payload = undefined;
    }
    const payloadObj = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : undefined;
    const messageFromPayload =
      typeof payloadObj?.message === "string" && payloadObj.message.trim().length > 0 ? payloadObj.message : null;
    const codeFromPayload =
      typeof payloadObj?.errorCode === "string" && payloadObj.errorCode.trim().length > 0 ? payloadObj.errorCode : null;
    throw Object.assign(new Error(messageFromPayload ?? (text || `HTTP ${res.status}`)), {
      status: res.status,
      code: codeFromPayload,
      payload,
    });
  }
  return res.json() as Promise<T>;
}
