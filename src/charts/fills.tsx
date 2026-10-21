import type { Category } from '../domain/types';

/** Past the tenth category the palette repeats, so those categories get a diagonal hatch as well. */
export const needsHatch = (c: Category | undefined): boolean => (c?.order ?? 0) >= 10;

export const hatchId = (c: Category): string => `hatch-${c.id.replace(/[^a-z0-9-]/gi, '')}`;

export function fillFor(c: Category | undefined): string {
  if (!c) return 'var(--faint)';
  return needsHatch(c) ? `url(#${hatchId(c)})` : c.color;
}

/** SVG <defs> with one hatch pattern per category that needs it. */
export function HatchDefs({ categories }: { categories: readonly Category[] }) {
  const hatched = categories.filter(needsHatch);
  if (hatched.length === 0) return null;
  return (
    <defs>
      {hatched.map((c) => (
        <pattern
          key={c.id}
          id={hatchId(c)}
          width="6"
          height="6"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <rect width="6" height="6" fill={c.color} />
          <line x1="0" y1="0" x2="0" y2="6" stroke="var(--card)" strokeWidth="2" />
        </pattern>
      ))}
    </defs>
  );
}
