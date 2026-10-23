import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useLedger } from '../data/store';
import { todayISO } from '../domain/dates';
import { merchantMatches, rankItems, type PaletteItem } from '../domain/palette';
import { lastMonth, lastWeek } from '../domain/recap';
import { useUi } from '../kit/ui';
import { Icon } from './icons';
import { addPath, navigate } from './router';

interface Command extends PaletteItem {
  run: () => void;
}

const GO: Array<[string, string, string?]> = [
  ['Dashboard', '/', 'home overview'],
  ['Transactions', '/transactions', 'entries list'],
  ['Calendar', '/transactions?view=calendar', 'month days bills'],
  ['Review unsure entries', '/transactions?view=review', 'check categories'],
  ['Trash', '/transactions?view=trash', 'deleted restore'],
  ['Warranties', '/transactions?view=warranties', 'guarantee receipt repair'],
  ['Money', '/money', 'accounts income cash flow net worth'],
  ['Udhaar', '/money?view=udhaar', 'lent borrowed owe people splits'],
  ['Loans', '/money?view=loans', 'emi'],
  ['Budgets', '/budgets', 'plan limits'],
  ['Goals and funds', '/budgets?view=goals', 'save saving sinking'],
  ['Wishlist', '/budgets?view=wishlist', 'want wait buy'],
  ['Trips and projects', '/budgets?view=trips', 'trip project festival holiday travel'],
  ['Reports', '/reports', 'charts treemap flow compare'],
  ['Recurring', '/recurring', 'bills subscriptions'],
  ['Settings', '/settings', 'preferences backup'],
  ['Activity', '/settings?view=activity', 'history log'],
  ['Rules', '/settings?view=rules', 'automatic categorise merchant'],
];

/**
 * The command palette (Drop 11): Ctrl+K or Cmd+K, or the search button. Type to narrow, arrow keys to
 * move, Enter to run, Escape to close. Typing a merchant offers its page; anything typed can be
 * searched for in Transactions (Drop 12).
 */
export function Palette() {
  const open = useUi((s) => s.paletteOpen);
  const setPalette = useUi((s) => s.setPalette);
  const openRecap = useUi((s) => s.openRecap);
  const setCustomising = useUi((s) => s.setCustomising);
  const transactions = useLedger((s) => s.transactions);
  const canUndo = useLedger((s) => s.canUndo);
  const canRedo = useLedger((s) => s.canRedo);
  const undoLabel = useLedger((s) => s.undoLabel);
  const redoLabel = useLedger((s) => s.redoLabel);
  const privacy = useLedger((s) => s.settings.privacy);
  const theme = useLedger((s) => s.settings.theme);
  const undo = useLedger((s) => s.undo);
  const redo = useLedger((s) => s.redo);
  const setSetting = useLedger((s) => s.setSetting);
  const ref = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setQuery('');
      setActive(0);
      if (typeof d.showModal === 'function') d.showModal();
      else d.setAttribute('open', '');
      input.current?.focus();
    } else if (!open && d.open) {
      if (typeof d.close === 'function') d.close();
      else d.removeAttribute('open');
    }
  }, [open]);

  const commands = useMemo<Command[]>(() => {
    const today = todayISO();
    const list: Command[] = GO.map(([label, to, keywords]) => ({
      id: `go:${to}`,
      label,
      group: 'Go to',
      keywords,
      run: () => navigate(to),
    }));
    list.push(
      {
        id: 'add',
        label: 'Add expense',
        group: 'Do',
        keywords: 'new entry spend log',
        run: () => navigate(addPath()),
      },
      {
        id: 'privacy',
        label: privacy ? 'Show amounts' : 'Hide amounts',
        group: 'Do',
        keywords: 'privacy mode mask',
        run: () => void setSetting('privacy', !privacy),
      },
      ...(['light', 'dark', 'system'] as const)
        .filter((t) => t !== theme)
        .map((t) => ({
          id: `theme:${t}`,
          label:
            t === 'system' ? 'Match the system theme' : `${t === 'light' ? 'Light' : 'Dark'} theme`,
          group: 'Do',
          keywords: 'theme appearance colour',
          run: () => void setSetting('theme', t),
        })),
      {
        id: 'recap:month',
        label: "Open last month's recap",
        group: 'Do',
        keywords: 'story recap wrapped summary',
        run: () => openRecap(lastMonth(today)),
      },
      {
        id: 'recap:week',
        label: "Open last week's recap",
        group: 'Do',
        keywords: 'story recap summary',
        run: () => openRecap(lastWeek(today)),
      },
      {
        id: 'customise',
        label: 'Customise the Dashboard',
        group: 'Do',
        keywords: 'layout cards reorder hide',
        run: () => {
          navigate('/');
          setCustomising(true);
        },
      },
    );
    if (canUndo)
      list.push({
        id: 'undo',
        label: `Undo: ${undoLabel ?? 'last step'}`,
        group: 'Do',
        keywords: 'undo back',
        run: () => void undo(),
      });
    if (canRedo)
      list.push({
        id: 'redo',
        label: `Redo: ${redoLabel ?? 'last step'}`,
        group: 'Do',
        keywords: 'redo again',
        run: () => void redo(),
      });
    return list;
  }, [
    privacy,
    theme,
    canUndo,
    canRedo,
    undoLabel,
    redoLabel,
    setSetting,
    undo,
    redo,
    openRecap,
    setCustomising,
  ]);

  const results = useMemo<Command[]>(() => {
    const ranked = rankItems(commands, query);
    const merchants = merchantMatches(transactions, query, 5).map((m) => ({
      id: `m:${m.key}`,
      label: `${m.name}, ${m.count === 1 ? '1 entry' : `${m.count} entries`}`,
      group: 'Merchant',
      run: () => navigate(`/merchant?key=${encodeURIComponent(m.key)}`),
    }));
    const text = query.trim();
    const search: Command[] = text
      ? [
          {
            id: 'search',
            label: `Search entries for “${text}”`,
            group: 'Search',
            run: () => navigate(`/transactions?q=${encodeURIComponent(text)}`),
          },
        ]
      : [];
    return [...ranked.slice(0, 12), ...merchants, ...search];
  }, [commands, query, transactions]);

  const pick = (c: Command | undefined) => {
    if (!c) return;
    setPalette(false);
    c.run();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const n = results.length;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => (n ? (a + 1) % n : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => (n ? (a - 1 + n) % n : 0));
    } else if (e.key === 'Home') {
      e.preventDefault();
      setActive(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setActive(Math.max(0, n - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      pick(results[Math.min(active, n - 1)]);
    }
  };

  const current = results[Math.min(active, results.length - 1)];
  return (
    <dialog
      ref={ref}
      className="palette"
      aria-label="Go to or do"
      onClose={() => setPalette(false)}
      onCancel={(e) => {
        e.preventDefault();
        setPalette(false);
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) setPalette(false);
      }}
    >
      <div className="palette-body">
        <div className="palette-input">
          <Icon name="search" />
          <input
            ref={input}
            className="input"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-autocomplete="list"
            aria-activedescendant={current ? `pal-${current.id}` : undefined}
            aria-label="Search pages, actions and merchants"
            placeholder="Go to, do, find a merchant or search"
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
          />
        </div>
        <ul id="palette-list" className="palette-list" role="listbox" aria-label="Results">
          {results.length === 0 && (
            <li className="muted small palette-empty" role="presentation">
              Nothing matches. Try a page name, “add”, “undo” or a merchant.
            </li>
          )}
          {results.map((c, i) => (
            <li
              key={c.id}
              id={`pal-${c.id}`}
              role="option"
              aria-selected={c === current}
              className="palette-item"
              onMouseMove={() => setActive(i)}
              onClick={() => pick(c)}
            >
              <span>{c.label}</span>
              <span className="muted small">{c.group}</span>
            </li>
          ))}
        </ul>
        <p className="muted small palette-hint">
          Arrow keys to move, Enter to choose, Escape to close.
        </p>
      </div>
    </dialog>
  );
}
