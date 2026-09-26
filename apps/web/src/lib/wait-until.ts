// Resolves once `ready()` is true, checking every `intervalMs`; rejects after `timeoutMs`.
export async function waitUntil(
  ready: () => boolean,
  { timeoutMs, intervalMs = 100 }: { timeoutMs: number; intervalMs?: number },
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!ready()) {
    if (Date.now() >= deadline) {
      throw new Error(`Not ready after ${timeoutMs} ms.`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
