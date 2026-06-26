"use client";

/** POST JSON to an API route; throws Error(message) on non-2xx. */
export async function api<T = { ok?: boolean; [k: string]: unknown }>(
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  let data: Record<string, unknown> = {};
  try {
    data = await res.json();
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    throw new Error((data.error as string) || "エラーが発生しました");
  }
  return data as T;
}
