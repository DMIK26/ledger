import { replaceRoute, useBackClose } from '../pwa/back';
import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { useLedger } from '../data/store';
import { AddSheet } from './AddSheet';
import { useAppBadge } from './appBadge';
import { Icon, type IconName } from './icons';
import { FolderBackupCheck, LockScreen, NotesPanel, SketchToolbar } from './deferred';
import { usePrivacy } from './Money';
import { addPath, closeAddPath, href, navigate, type RoutePath } from './router';
import { Toast } from './Toast';
import { getHighlight } from '../kit/entityBus';
import { HoverCard } from '../kit/HoverCard';
import { LiveRegion, MonthSwitcher, PinBar, UndoControls, useNavInfo } from '../kit/Shell';
import { useView } from '../kit/view';
import { useUi } from '../kit/ui';
import { useSheetSnap } from '../kit/sheet';
import { SpaceSwitcher } from './spaces/SpaceSwitcher';
import { Companion } from '../doodle/Companion';
import { DoodleLayer } from '../doodle/DoodleLayer';
import { DoodleDefs } from '../doodle/art';
import { useIsDesktop } from '../doodle/anchors';
import { DoodleBurst, useDoodleKeys } from '../doodle/bits';
import { useDoodle } from '../doodle/state';
import { tl } from '../domain/i18n';

// Opened on first use, so they cost nothing at start-up.
const Palette = lazy(() => import('./Palette').then((m) => ({ default: m.Palette })));
const RecapViewer = lazy(() =>
  import('./recap/RecapViewer').then((m) => ({ default: m.RecapViewer })),
);

interface NavItem {
  path: RoutePath;
  label: string;
  icon: IconName;
}

export const NAV: NavItem[] = [
  {
    path: '/',
    get label() {
      return tl('Dashboard');
    },
    icon: 'home',
  },
  {
    path: '/transactions',
    get label() {
      return tl('Transactions');
    },
    icon: 'list',
  },
  {
    path: '/money',
    get label() {
      return tl('Money');
    },
    icon: 'coins',
  },
  {
    path: '/budgets',
    get label() {
      return tl('Budgets');
    },
    icon: 'wallet',
  },
  {
    path: '/reports',
    get label() {
      return tl('Reports');
    },
    icon: 'chart',
  },
  {
    path: '/recurring',
    get label() {
      return tl('Recurring');
    },
    icon: 'repeat',
  },
  {
    path: '/settings',
    get label() {
      return tl('Settings');
    },
    icon: 'gear',
  },
];

const MORE: RoutePath[] = ['/money', '/budgets', '/recurring', '/settings'];

export const titleFor = (path: RoutePath): string =>
  path === '/merchant' ? tl('Merchant') : (NAV.find((n) => n.path === path)?.label ?? tl('Ledger'));

export const AUTO_LOCK_MS = 30_000;

const isTyping = (el: Element | null): boolean =>
  el instanceof HTMLElement &&
  (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));

/** Ctrl/Cmd+Z undoes, Shift+Ctrl/Cmd+Z (or Ctrl+Y) redoes, unless a field has focus. */
function useUndoShortcuts(): void {
  const undo = useLedger((s) => s.undo);
  const redo = useLedger((s) => s.redo);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || isTyping(document.activeElement)) return;
      const key = e.key.toLowerCase();
      if (key === 'z') {
        e.preventDefault();
        void (e.shiftKey ? redo() : undo());
      } else if (key === 'y' && e.ctrlKey) {
        e.preventDefault();
        void redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);
}

/**
 * With a PIN set: hides the app behind a plain cover whenever the page is hidden (so the app switcher
 * shows nothing), and locks after 30 seconds in the background.
 */
function useAutoLock(): void {
  const hasLock = useLedger((s) => s.lock !== null);
  const lockNow = useLedger((s) => s.lockNow);
  const applyPinResetIfDue = useLedger((s) => s.applyPinResetIfDue);
  useEffect(() => {
    if (!hasLock) return;
    let hiddenAt: number | null = null;
    const root = document.documentElement;
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
        root.classList.add('ledger-covered');
      } else {
        if (hiddenAt !== null && Date.now() - hiddenAt >= AUTO_LOCK_MS) lockNow();
        void applyPinResetIfDue();
        hiddenAt = null;
        root.classList.remove('ledger-covered');
      }
    };
    const onPageHide = () => root.classList.add('ledger-covered');
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      root.classList.remove('ledger-covered');
    };
  }, [hasLock, lockNow, applyPinResetIfDue]);
}

/** Ctrl+K or Cmd+K opens and closes the command palette, even from a field. */
function usePaletteShortcut(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== 'k')
        return;
      e.preventDefault();
      const ui = useUi.getState();
      ui.setPalette(!ui.paletteOpen);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

/** Escape removes the last pin, unless something else (a dialog, a popover, a field) has it. */
function usePinEscape(): void {
  const popPin = useView((s) => s.popPin);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (isTyping(document.activeElement) || document.querySelector('dialog[open]')) return;
      if (getHighlight()) return;
      popPin();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [popPin]);
}

function TopBar({ title, path }: { title: string; path: RoutePath }) {
  const setSetting = useLedger((s) => s.setSetting);
  const doodles = useLedger((s) => s.settings.doodles);
  const privacy = usePrivacy();
  const desktop = useIsDesktop();
  const sketchOn = useDoodle((s) => s.sketchOn);
  const toggleSketch = useDoodle((s) => s.toggleSketch);
  const setPalette = useUi((s) => s.setPalette);

  return (
    <header className="topbar">
      <h1>{title}</h1>
      {!desktop && doodles && <Companion path={path} placement="header" />}
      <button
        type="button"
        className="btn btn-ghost btn-icon"
        aria-label={tl('Search and commands')}
        aria-keyshortcuts="Control+K Meta+K"
        title={tl('Search and commands (Ctrl+K)')}
        onClick={() => setPalette(true)}
      >
        <Icon name="search" />
      </button>
      <UndoControls />
      {desktop && (
        <button
          type="button"
          className="btn btn-ghost sketch-toggle"
          aria-pressed={sketchOn}
          aria-keyshortcuts="D"
          title={tl('Sketch on this page (D)')}
          onClick={toggleSketch}
        >
          <Icon name="edit" />
          {tl('Sketch')}
        </button>
      )}
      <button
        type="button"
        className="btn btn-ghost btn-icon"
        aria-pressed={privacy}
        aria-label={tl('Privacy mode')}
        title={privacy ? tl('Show amounts') : tl('Hide amounts')}
        onClick={() => void setSetting('privacy', !privacy)}
      >
        <Icon name={privacy ? 'eyeOff' : 'eye'} />
      </button>
      <button
        type="button"
        className="btn btn-primary topbar-add"
        onClick={() => navigate(addPath())}
      >
        <Icon name="plus" />
        {tl('Add')}
      </button>
    </header>
  );
}

function TabBar({ path }: { path: RoutePath }) {
  const sheet = useRef<HTMLDialogElement>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreActive = MORE.includes(path);
  useBackClose(moreOpen, () => sheet.current?.close());
  const snap = useSheetSnap(moreOpen, () => sheet.current?.close());

  const go = (to: RoutePath) => {
    // Replace the sheet's history entry, so back returns to the page the sheet was opened on.
    replaceRoute(to);
    sheet.current?.close();
  };

  return (
    <>
      <nav className="tabbar" aria-label={tl('Main')}>
        <a className="tab" href={href('/')} aria-current={path === '/' ? 'page' : undefined}>
          <Icon name="home" />
          {tl('Dashboard')}
        </a>
        <a
          className="tab"
          href={href('/transactions')}
          aria-current={path === '/transactions' ? 'page' : undefined}
        >
          <Icon name="list" />
          {tl('Transactions')}
        </a>
        <button
          type="button"
          className="tab-add"
          aria-label={tl('Add expense')}
          onClick={() => navigate(addPath())}
        >
          <Icon name="plus" size={24} />
        </button>
        <a
          className="tab"
          href={href('/reports')}
          aria-current={path === '/reports' ? 'page' : undefined}
        >
          <Icon name="chart" />
          {tl('Reports')}
        </a>
        <button
          type="button"
          className="tab"
          aria-haspopup="dialog"
          aria-current={moreActive ? 'page' : undefined}
          onClick={() => {
            sheet.current?.showModal();
            setMoreOpen(true);
          }}
        >
          <Icon name="more" />
          {tl('More')}
        </button>
      </nav>
      <dialog
        ref={sheet}
        className="sheet"
        aria-labelledby="more-title"
        data-snap={snap.snap}
        style={snap.style}
        onClose={() => setMoreOpen(false)}
        onClick={(e) => {
          if (e.target === e.currentTarget) sheet.current?.close();
        }}
      >
        <div className="sheet-body">
          <div {...snap.handleProps} />
          <h2 id="more-title">{tl('More')}</h2>
          <ul className="sheet-list">
            {NAV.filter((n) => MORE.includes(n.path)).map((n) => (
              <li key={n.path}>
                <button
                  type="button"
                  className="nav-link btn-ghost"
                  style={{ width: '100%', border: 0, background: 'none', cursor: 'pointer' }}
                  aria-current={path === n.path ? 'page' : undefined}
                  onClick={() => go(n.path)}
                >
                  <Icon name={n.icon} />
                  {n.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </dialog>
    </>
  );
}

export function Layout({
  path,
  adding,
  addDate,
  children,
}: {
  path: RoutePath;
  adding: boolean;
  /** `&on=YYYY-MM-DD`: the day the Add sheet starts on. */
  addDate?: string;
  children: ReactNode;
}) {
  const ready = useLedger((s) => s.ready);
  const error = useLedger((s) => s.error);
  const locked = useLedger((s) => s.locked);
  const title = titleFor(path);
  useUndoShortcuts();
  usePaletteShortcut();
  usePinEscape();
  useDoodleKeys();
  const nav = useNavInfo();
  const desktop = useIsDesktop();
  const doodles = useLedger((s) => s.settings.doodles);
  // Mounted from the first opening on, so the palette reopens fast.
  const paletteUsed = useUi((s) => s.paletteUsed);
  const recap = useUi((s) => s.recap);
  const folderBackup = useLedger((s) => s.settings.folderBackupName !== '');
  // The sketch tools and the notes list load the first time they open.
  const sketchOn = useDoodle((s) => s.sketchOn);
  const notesOpen = useDoodle((s) => s.notesOpen);
  useAutoLock();
  useAppBadge();

  useEffect(() => {
    document.title = path === '/' ? tl('Ledger') : tl('{0} · Ledger', title);
  }, [path, title]);

  if (error) {
    return (
      <main className="state" id="main">
        <div>
          <h1>{tl('Ledger cannot open its storage')}</h1>
          <p className="muted">
            {tl(
              'This browser blocked local storage, which usually means a private window. Open Ledger in a normal window to keep your entries.',
            )}
          </p>
          <p className="small muted">{error}</p>
        </div>
      </main>
    );
  }

  if (!ready) {
    return (
      <main className="state" id="main" aria-busy="true">
        <div>
          <h1>{tl('Ledger')}</h1>
          <p className="muted">{tl('Opening your ledger…')}</p>
        </div>
      </main>
    );
  }

  if (locked)
    return (
      <Suspense fallback={<main className="state" id="main" aria-busy="true" />}>
        <LockScreen />
      </Suspense>
    );

  return (
    <div className="app">
      <a
        className="skip-link"
        href="#main"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById('main')?.focus();
        }}
      >
        {tl('Skip to content')}
      </a>
      <aside className="sidebar">
        <p className="wordmark">{tl('Ledger')}</p>
        <nav aria-label={tl('Sections')}>
          <ul className="nav-list">
            {NAV.map((n) => {
              const badge = nav.badges[n.path];
              return (
                <li key={n.path} className="nav-item">
                  <a
                    className="nav-link"
                    href={href(n.path)}
                    aria-current={path === n.path ? 'page' : undefined}
                    aria-describedby={`peek-${n.label.toLowerCase()}`}
                  >
                    <Icon name={n.icon} />
                    <span className="nav-label">{n.label}</span>
                    {badge && (
                      <span className="nav-badge" data-testid={`badge-${n.label.toLowerCase()}`}>
                        {badge.count}
                        <span className="visually-hidden">, {badge.text}</span>
                      </span>
                    )}
                  </a>
                  <span className="peek" role="tooltip" id={`peek-${n.label.toLowerCase()}`}>
                    {nav.peeks[n.path]}
                  </span>
                </li>
              );
            })}
          </ul>
        </nav>
        {desktop && doodles && <Companion path={path} placement="sidebar" />}
      </aside>
      <div className="main">
        <TopBar title={title} path={path} />
        <div className="context-bar">
          <SpaceSwitcher />
          {(path === '/' || path === '/budgets' || path === '/money') && <MonthSwitcher />}
          <PinBar />
        </div>
        <main id="main" tabIndex={-1} className="content">
          {folderBackup && (
            <Suspense fallback={null}>
              <FolderBackupCheck />
            </Suspense>
          )}
          {children}
          <DoodleLayer path={path} />
        </main>
      </div>
      <TabBar path={path} />
      <AddSheet open={adding} date={addDate} onClose={() => navigate(closeAddPath())} />
      <Suspense fallback={null}>
        {sketchOn && <SketchToolbar path={path} />}
        {notesOpen && <NotesPanel />}
      </Suspense>
      <DoodleBurst />
      <DoodleDefs />
      <HoverCard />
      <LiveRegion />
      <Toast />
      <Suspense fallback={null}>
        {paletteUsed && <Palette />}
        {recap && <RecapViewer key={recap.id} period={recap} />}
      </Suspense>
    </div>
  );
}
