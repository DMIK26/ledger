import type { ReactNode } from 'react';

const PATHS = {
  home: <path d="M3.5 10 12 3.5 20.5 10v9.5a1 1 0 0 1-1 1H15v-6H9v6H4.5a1 1 0 0 1-1-1Z" />,
  list: <path d="M8.5 6.5h12M8.5 12h12M8.5 17.5h12M3.5 6.5h1M3.5 12h1M3.5 17.5h1" />,
  wallet: (
    <>
      <path d="M3.5 7.5a2 2 0 0 1 2-2h12v3" />
      <path d="M3.5 7.5v10a2 2 0 0 0 2 2h14v-11h-14a2 2 0 0 1-2-1Z" />
      <path d="M16 14h1.5" />
    </>
  ),
  chart: <path d="M4 20.5h16M7 16.5v-5M12 16.5v-10M17 16.5v-7" />,
  repeat: (
    <>
      <path d="M17 3.5 20 6.5l-3 3" />
      <path d="M4 11.5v-1a4 4 0 0 1 4-4h12" />
      <path d="M7 20.5 4 17.5l3-3" />
      <path d="M20 12.5v1a4 4 0 0 1-4 4H4" />
    </>
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" />
    </>
  ),
  plus: <path d="M12 4.5v15M4.5 12h15" />,
  history: <path d="M4 12a8 8 0 1 0 2.4-5.7M4 4.5v3.8h3.8M12 8v4.5l3 2" />,
  mic: <path d="M9 6.5a3 3 0 0 1 6 0v5a3 3 0 0 1-6 0ZM5.5 11a6.5 6.5 0 0 0 13 0M12 17.5v3.5M9 21h6" />,
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  eyeOff: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
      <path d="M4 4l16 16" />
    </>
  ),
  trash: <path d="M4 6.5h16M9.5 6.5v-2h5v2M6 6.5l1 13h10l1-13M10 10.5v6M14 10.5v6" />,
  undo: (
    <>
      <path d="M8 4.5 4 8.5l4 4" />
      <path d="M4 8.5h10.5a5.5 5.5 0 0 1 0 11H9" />
    </>
  ),
  more: (
    <>
      <circle cx="5.5" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="18.5" cy="12" r="1" />
    </>
  ),
  check: <path d="M4.5 12.5 9.5 17.5 19.5 6.5" />,
  edit: <path d="M4 20h4L19 9l-4-4L4 16Zm9-13 4 4" />,
  receipt: (
    <>
      <path d="M6 3.5h12v17l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5-2 1.5Z" />
      <path d="M9 8h6M9 11.5h6M9 15h3" />
    </>
  ),
  filter: <path d="M4 5.5h16M7 12h10M10 18.5h4" />,
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="10" rx="2" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6 6 18" />,
  redo: (
    <>
      <path d="M16 4.5 20 8.5l-4 4" />
      <path d="M20 8.5H9.5a5.5 5.5 0 0 0 0 11H15" />
    </>
  ),
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
