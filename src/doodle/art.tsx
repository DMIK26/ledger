import { useState } from 'react';
import { motionReduced } from '../kit/spring';
import type { StampKind } from '../domain/notes';

/**
 * Hand-drawn line art: one 2px round-capped ink stroke, one clay accent, an optional flat sand fill.
 * Every drawing is on a 64 by 64 grid.
 */
export interface Art {
  /** Flat sand fill, drawn first. */
  fill?: string;
  ink: string;
  /** The single clay accent. */
  accent?: string;
}

export const CATEGORY_ART: Record<string, Art> = {
  food: {
    fill: 'M10 30h44a22 20 0 0 1-44 0Z',
    ink: 'M10 30h44a22 20 0 0 1-44 0ZM24 22c-3-4 3-6 0-10M32 22c-3-4 3-6 0-10',
    accent: 'M38 26 56 8M44 28 60 14',
  },
  groceries: {
    fill: 'M10 28h44l-6 24H16Z',
    ink: 'M10 28h44l-6 24H16ZM20 28c0-14 24-14 24 0M24 34v12M32 34v12M40 34v12',
    accent: 'M30 22c2-6 8-8 12-6-2 5-7 8-12 6Z',
  },
  transport: {
    ink: 'M14 48a6 6 0 1 0 12 0 6 6 0 1 0-12 0M42 48a6 6 0 1 0 12 0 6 6 0 1 0-12 0M26 48h16l6-14h-8M40 34l-4-16h-6',
    accent: 'M18 38h14',
  },
  housing: {
    fill: 'M16 26v26h32V26L32 14Z',
    ink: 'M10 30 32 12l22 18M16 26v26h32V26M20 34h6v6h-6Z',
    accent: 'M28 52V40h8v12',
  },
  shopping: {
    fill: 'M14 22h36l-4 30H18Z',
    ink: 'M14 22h36l-4 30H18ZM24 22v-4a8 8 0 0 1 16 0v4',
    accent: 'M38 32l6 6',
  },
  health: {
    ink: 'M32 52C14 40 10 30 14 22c4-8 14-8 18 0 4-8 14-8 18 0 4 8 0 18-18 30Z',
    accent: 'M18 34h8l3-6 4 12 3-6h10',
  },
  entertainment: {
    fill: 'M12 26h40v26H12Z',
    ink: 'M12 26h40v26H12ZM12 26l38-10 2 8',
    accent: 'M20 24l6-8M30 21l6-8M40 18l6-8',
  },
  education: {
    ink: 'M32 18c-6-4-14-4-20-2v32c6-2 14-2 20 2 6-4 14-4 20-2V16c-6-2-14-2-20 2ZM32 18v32',
    accent: 'M42 16v12l3-3 3 3V16',
  },
  business: {
    fill: 'M10 24h44v26H10Z',
    ink: 'M10 24h44v26H10ZM24 24v-6h16v6M10 34h44',
    accent: 'M30 32h4v5h-4Z',
  },
  other: {
    ink: 'M32 14v36M17 23l30 18M47 23 17 41',
    accent: 'M28 32a4 4 0 1 0 8 0 4 4 0 1 0-8 0',
  },
};

export const artForCategory = (id: string): Art => CATEGORY_ART[id] ?? CATEGORY_ART.other!;

export const EMPTY_ART: Record<string, Art> = {
  notebook: {
    fill: 'M16 10h32v44H16Z',
    ink: 'M16 10h32v44H16ZM22 20h20M22 28h20M22 36h12M12 16h6M12 26h6M12 36h6M12 46h6',
    accent: 'M44 52 58 30l4 3-14 22-5 1Z',
  },
  receipt: {
    ink: 'M18 8h28v48l-4-3-4 3-4-3-4 3-4-3-4 3-4-3Z',
    accent: 'M24 20h16M24 28h16M24 36h10',
  },
  jar: {
    fill: 'M18 20h28v32a4 4 0 0 1-4 4H22a4 4 0 0 1-4-4Z',
    ink: 'M18 20h28v32a4 4 0 0 1-4 4H22a4 4 0 0 1-4-4ZM20 12h24v8H20Z',
    accent: 'M28 40a4 4 0 1 0 8 0 4 4 0 1 0-8 0',
  },
  chart: {
    ink: 'M10 54h44M16 48V36M26 48V28M36 48V40M28 22a10 10 0 1 0 20 0 10 10 0 1 0-20 0',
    accent: 'M45 29l10 10',
  },
  calendar: {
    fill: 'M10 16h44v38H10Z',
    ink: 'M10 16h44v38H10ZM10 26h44M22 10v10M42 10v10',
    accent: 'M24 40l6 6 12-12',
  },
  pin: {
    ink: 'M24 10h16l-2 14 8 8H18l8-8ZM32 32v22',
    accent: 'M28 14h8',
  },
};

export const STAMP_ART: Record<StampKind, Art> = {
  star: {
    accent: 'M32 8l7 15 16 2-12 11 3 16-14-8-14 8 3-16L9 25l16-2Z',
    ink: '',
  },
  check: { ink: '', accent: 'M12 34l14 14 26-30' },
  question: {
    ink: '',
    accent: 'M22 22a10 10 0 1 1 14 9c-3 2-4 4-4 8M32 50v1',
  },
  heart: {
    ink: '',
    accent: 'M32 52C14 40 10 30 14 22c4-8 14-8 18 0 4-8 14-8 18 0 4 8 0 18-18 30Z',
  },
};

/** A drawing that can draw itself in (with a slight wobble while it moves). */
export function Doodle({
  art,
  size = 64,
  draw = false,
  className = '',
  title,
}: {
  art: Art;
  size?: number;
  draw?: boolean;
  className?: string;
  title?: string;
}) {
  // Drawing in is an animation; with reduced motion the art simply appears.
  const [drawing, setDrawing] = useState(() => draw && !motionReduced());
  return (
    <svg
      className={`doodle${drawing ? ' doodle-draw' : ''} ${className}`}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      onAnimationEnd={(e) => {
        if ((e.target as Element).classList.contains('doodle-last')) setDrawing(false);
      }}
    >
      {art.fill && <path className="doodle-fill" d={art.fill} />}
      {art.ink && <path className="doodle-ink" d={art.ink} pathLength={1} />}
      {art.accent && <path className="doodle-accent doodle-last" d={art.accent} pathLength={1} />}
    </svg>
  );
}

/** SVG filters: the wobble used only while drawings animate, and the rough edge for sketch style. */
export function DoodleDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
      <defs>
        <filter id="ledger-wobble">
          <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="2" seed="3">
            <animate attributeName="seed" values="3;7;11;3" dur="0.6s" repeatCount="2" />
          </feTurbulence>
          <feDisplacementMap in="SourceGraphic" scale="1.5" />
        </filter>
        <filter id="ledger-rough">
          <feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves="2" seed="5" />
          <feDisplacementMap in="SourceGraphic" scale="1.5" />
        </filter>
      </defs>
    </svg>
  );
}
