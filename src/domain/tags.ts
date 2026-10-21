/** Tags are lowercase words joined by hyphens, without a leading #. */
export function normalizeTag(raw: string): string {
  return raw
    .trim()
    .replace(/^#+/, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** "Work, #Trip  goa" becomes ["work", "trip-goa"]: commas separate tags. */
export function parseTags(input: string): string[] {
  const out: string[] = [];
  for (const part of input.split(',')) {
    const tag = normalizeTag(part);
    if (tag && !out.includes(tag)) out.push(tag);
  }
  return out;
}
