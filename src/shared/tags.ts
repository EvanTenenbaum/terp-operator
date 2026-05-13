export function parseTagInput(value: unknown, fallback: string[] = []) {
  const raw = Array.isArray(value)
    ? value.map(String)
    : typeof value === 'string'
      ? value.split(/[|,]/)
      : fallback;

  return [...new Set(raw.map(normalizeTagSlug).filter(Boolean))];
}

export function normalizeTagSlug(value: unknown) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

