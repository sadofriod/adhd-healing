export function parsePathList(rawValue: string): string[] {
  const trimmed = rawValue.trim();
  if (!trimmed) return [];

  const parsed = tryParseJsonArray(trimmed);
  if (parsed) return parsed;

  return trimmed
    .split(/[\n,]+/)
    .map(entry => entry.trim())
    .filter(Boolean);
}

function tryParseJsonArray(rawValue: string): string[] | undefined {
  try {
    const parsed = JSON.parse(rawValue);
    if (Array.isArray(parsed)) {
      return parsed.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
    }
  } catch {
    return undefined;
  }

  return undefined;
}