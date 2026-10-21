import { useEffect, useRef, type ReactNode } from 'react';
import { useLedger } from '../data/store';
import { AddSheet } from './AddSheet';
import { Icon, type IconName } from './icons';
import { LockScreen } from './LockScreen';
import { usePrivacy } from './Money';
import { href, navigate, parseHash, type RoutePath } from './router';
import { Toast } from './Toast';

interface NavItem {
  path: RoutePath;
  label: string;
  icon: IconName;
}

export const NAV: NavItem[] = [
  { path: '/', label: 'Dashboard', icon: 'home' },
  { path: '/transactions', label: 'Transactions', icon: 'list' },
  { path: '/budgets', label: 'Budgets', icon: 'wallet' },
  { path: '/reports', label: 'Reports', icon: 'chart' },
  { path: '/recurring', label: 'Recurring', icon: 'repeat' },
  { path: '/settings', label: 'Settings', icon: 'gear' },
];

const MORE: RoutePath[] = ['/budgets', '/recurring', '/settings'];

export const titleFor = (path: RoutePath): string =>
  NAV.find((n) => n.path === path)?.label ?? 'Ledger';

const currentPath = (): RoutePath => parseHash(window.location.hash).path;

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
  }, [hasLock, lockNow]);
}

function TopBar({ title }: { title: string }) {
  const canUndo = useLedger((s) => s.canUndo);
  const undoLabel = useLedger((s) => s.undoLabel);
  const undo = useLedger((s) => s.undo);
  const setSetting = useLedger((s) => s.setSetting);
  const privacy = usePrivacy();

  return (
    <header className="topbar">
      <h1>{title}</h1>
      {canUndo && (
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => void undo()}
          title={undoLabel ? `Undo: ${undoLabel}` : 'Undo'}
        >
          <Icon name="undo" />
          <span>Undo</span>
        </button>
      )}
      <button
        type="button"
        className="btn btn-ghost btn-icon"
        aria-pressed={privacy}
        aria-label="Privacy mode"
        title={privacy ? 'Show amounts' : 'Hide amounts'}
        onClick={() => void setSetting('privacy', !privacy)}
      >
        <Icon name={privacy ? 'eyeOff' : 'eye'} />
      </button>
      <button
        type="button"
        className="btn btn-primary topbar-add"
        onClick={() => navigate(`${currentPath()}?action=add`)}
      >
        <Icon name="plus" />
        Add
      </button>
    </header>
  );
}

function TabBar({ path }: { path: RoutePath }) {
  const sheet = useRef<HTMLDialogElement>(null);
  const moreActive = MORE.includes(path);

  const go = (to: RoutePath) => {
    sheet.current?.close();
    navigate(to);
  };

  return (
    <>
      <nav className="tabbar" aria-label="Main">
        <a className="tab" href={href('/')} aria-current={path === '/' ? 'page' : undefined}>
          <Icon name="home" />
          Dashboard
        </a>
        <a
          className="tab"
          href={href('/transactions')}
          aria-current={path === '/transactions' ? 'page' : undefined}
        >
          <Icon name="list" />
          Transactions
        </a>
        <button
          type="button"
          className="tab-add"
          aria-label="Add expense"
          onClick={() => navigate(`${path}?action=add`)}
        >
          <Icon name="plus" size={24} />
        </button>
        <a
          className="tab"
          href={href('/reports')}
          aria-current={path === '/reports' ? 'page' : undefined}
        >
          <Icon name="chart" />
          Reports
        </a>
        <button
          type="button"
          className="tab"
          aria-haspopup="dialog"
          aria-current={moreActive ? 'page' : undefined}
          onClick={() => sheet.current?.showModal()}
        >
          <Icon name="more" />
          More
        </button>
      </nav>
      <dialog
        ref={sheet}
        className="sheet"
        aria-labelledby="more-title"
        onClick={(e) => {
          if (e.target === e.currentTarget) sheet.current?.close();
        }}
      >
        <div className="sheet-body">
          <h2 id="more-title">More</h2>
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
  children,
}: {
  path: RoutePath;
  adding: boolean;
  children: ReactNode;
}) {
  const ready = useLedger((s) => s.ready);
  const error = useLedger((s) => s.error);
  const locked = useLedger((s) => s.locked);
  const title = titleFor(path);
  useUndoShortcuts();
  useAutoLock();

  useEffect(() => {
    document.title = path === '/' ? 'Ledger' : `${title} · Ledger`;
  }, [path, title]);

  if (error) {
    return (
      <main className="state" id="main">
        <div>
          <h1>Ledger cannot open its storage</h1>
          <p className="muted">
            This browser blocked local storage, which usually means a private window. Open Ledger in
            a normal window to keep your entries.
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
          <h1>Ledger</h1>
          <p className="muted">Opening your ledger…</p>
        </div>
      </main>
    );
  }

  if (locked) return <LockScreen />;

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
        Skip to content
      </a>
      <aside className="sidebar">
        <p className="wordmark">Ledger</p>
        <nav aria-label="Sections">
          <ul className="nav-list">
            {NAV.map((n) => (
              <li key={n.path}>
                <a
                  className="nav-link"
                  href={href(n.path)}
                  aria-current={path === n.path ? 'page' : undefined}
                >
                  <Icon name={n.icon} />
                  {n.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </aside>
      <div className="main">
        <TopBar title={title} />
        <main id="main" tabIndex={-1} className="content">
          {children}
        </main>
      </div>
      <TabBar path={path} />
      <AddSheet open={adding} onClose={() => navigate(path)} />
      <Toast />
    </div>
  );
}
