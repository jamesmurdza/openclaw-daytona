// Merge two objects recursively
export function deepMerge<T>(target: T, source: Record<string, unknown>): T {
  const out = { ...target } as Record<string, unknown>;
  for (const key of Object.keys(source)) {
    const a = (out as Record<string, unknown>)[key];
    const b = source[key];
    if (
      a != null &&
      b != null &&
      typeof a === "object" &&
      typeof b === "object" &&
      !Array.isArray(a) &&
      !Array.isArray(b)
    ) {
      (out as Record<string, unknown>)[key] = deepMerge(
        a as Record<string, unknown>,
        b as Record<string, unknown>,
      );
    } else {
      (out as Record<string, unknown>)[key] = b;
    }
  }
  return out as T;
}
