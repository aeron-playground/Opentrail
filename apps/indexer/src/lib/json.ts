// Parses JSON with every number kept as its original text. JSON.parse hands the reviver each
// number's source, so a price keeps every digit an outside API sent instead of becoming a float.
export function parseJsonKeepingNumbers(text: string): unknown {
  return JSON.parse(text, (_key, value: unknown, context?: { source?: string }) =>
    typeof value === "number" && context?.source !== undefined ? context.source : value,
  );
}
