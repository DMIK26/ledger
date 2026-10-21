import type { ReactNode } from 'react';
import type { BudgetStatus } from '../domain/budgets';
import type { Mood } from '../domain/companion';

export const MOOD_OF: Record<BudgetStatus['kind'], Mood> = {
  under: 'relaxed',
  near: 'worried',
  over: 'dizzy',
};

function FaceParts({ mood }: { mood: Mood }) {
  const mouth: Record<Mood, ReactNode> = {
    relaxed: <path d="M7 13c2 2 4 2 6 0" />,
    worried: <path d="M7 14c2-1.5 4-1.5 6 0" />,
    dizzy: <path d="M7 14h6" />,
    asleep: <path d="M8 13.5h4" />,
  };
  const eyes =
    mood === 'dizzy' ? (
      <path d="M6 7l2 2M8 7 6 9M12 7l2 2M14 7l-2 2" />
    ) : mood === 'asleep' ? (
      <path d="M6 8.5h2.5M11.5 8.5H14" />
    ) : (
      <>
        <circle cx="7.5" cy="8.5" r="0.9" className="dot" />
        <circle cx="12.5" cy="8.5" r="0.9" className="dot" />
      </>
    );
  return (
    <>
      <circle cx="10" cy="10" r="8.5" />
      {eyes}
      {mouth[mood]}
    </>
  );
}

/** Small faces for budget states: relaxed (under), worried (near), dizzy (over). */
export function MoodFace({ mood, size = 20 }: { mood: Mood; size?: number }) {
  return (
    <svg
      className={`mood-face mood-face-${mood} doodle-ui`}
      width={size}
      height={size}
      viewBox="0 0 20 20"
      aria-hidden="true"
      data-mood={mood}
    >
      <FaceParts mood={mood} />
    </svg>
  );
}

/** The same face inside a chart's SVG, centred on (x, y). */
export function MoodFaceG({ mood, x, y }: { mood: Mood; x: number; y: number }) {
  return (
    <g
      className={`mood-face mood-face-${mood} doodle-ui`}
      transform={`translate(${x - 8} ${y - 8}) scale(0.8)`}
      aria-hidden="true"
      data-mood={mood}
    >
      <FaceParts mood={mood} />
    </g>
  );
}
