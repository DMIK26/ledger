import { createPortal } from 'react-dom';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useLedger } from '../data/store';
import { inMonth } from '../domain/aggregates';
import { budgetsForMonth } from '../domain/budgets';
import {
  answer,
  companionMood,
  IDLE_MS,
  insightSentence,
  MOOD_LABEL,
  PAGE_PROP,
  PAGE_QUESTIONS,
  QUESTION_LABEL,
  type Mood,
  type Prop,
  type Question,
} from '../domain/companion';
import { monthKey, todayISO } from '../domain/dates';
import { buildInsights } from '../domain/insights';
import { wryLine, wryLines } from '../domain/wry';
import { usePrivacy } from '../app/Money';
import { createSpring2D, motionReduced } from '../kit/spring';
import { useScopedTransactions, useView, useViewMonth } from '../kit/view';
import { findAnchor, useDoodle } from './state';

const PROP_PATH: Record<Prop, string> = {
  cup: 'M2 46h9v8a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3ZM11 48h2a2 2 0 0 1 0 4h-2M5 42c-1-2 1-3 0-5',
  magnifier: 'M4 46a5 5 0 1 0 10 0 5 5 0 1 0-10 0M5 50l-4 6',
  coin: 'M2 50a6 6 0 1 0 12 0 6 6 0 1 0-12 0M8 47v6',
  ruler: 'M1 58l12-16 3 2-12 16ZM5 54l2 1.5M8 50l2 1.5M11 46l2 1.5',
  calendar: 'M1 44h13v13H1ZM1 48h13M4 42v4M11 42v4',
  wrench: 'M3 58l7-9M10 49a4 4 0 1 0 4-6l-2 2-2-1-1-2 2-2a4 4 0 0 0-1 9',
};

function Mouth({ mood }: { mood: Mood }) {
  switch (mood) {
    case 'relaxed':
      return <path d="M20 33c2.5 2.5 5.5 2.5 8 0" />;
    case 'worried':
      return <path d="M20 35c1.5-1.5 2.5-1.5 4 0s2.5 1.5 4 0M18 22l4 1M30 22l-4 1" />;
    case 'dizzy':
      return <path d="M21 34a3 2 0 1 0 6 0 3 2 0 1 0-6 0" />;
    case 'asleep':
      return <path d="M21 34h6M37 4h4l-4 4h4" />;
  }
}

/** The pencil itself. Pupils move by transform only, set directly by the pointer listener. */
function Pencil({
  mood,
  prop,
  waving,
  pupils,
}: {
  mood: Mood;
  prop: Prop;
  waving: number;
  pupils: React.RefObject<SVGGElement | null>;
}) {
  const sleeping = mood === 'asleep';
  return (
    <svg className="pencil" viewBox="0 0 48 64" aria-hidden="true" data-mood={mood}>
      <path className="doodle-ink pencil-prop" d={PROP_PATH[prop]} />
      <path className="doodle-fill" d="M14 12h20v34H14Z" />
      <path className="doodle-ink" d="M14 12h20v34H14ZM14 12V6h20v6M14 16h20M14 46l10 14 10-14" />
      <path className="doodle-accent" d="M21 56l3 4 3-4Z" />
      {sleeping || mood === 'dizzy' ? (
        <path
          className="doodle-ink"
          d={sleeping ? 'M18 27h4M26 27h4' : 'M18 25l4 4M22 25l-4 4M26 25l4 4M30 25l-4 4'}
        />
      ) : (
        <g ref={pupils} className="pupils">
          <circle cx="20" cy="27" r="1.8" />
          <circle cx="28" cy="27" r="1.8" />
        </g>
      )}
      <g className="doodle-ink">
        <Mouth mood={mood} />
      </g>
      <path
        key={waving}
        className={`doodle-ink pencil-arm${waving > 0 ? ' pencil-wave' : ''}`}
        d="M34 30c5 0 8-3 9-7"
      />
    </svg>
  );
}

const visited = new Set<string>();
const RING_RADIUS = 130;

/** Wakes up on any activity; falls asleep after a minute of nothing. */
function useIdle(): boolean {
  const [idle, setIdle] = useState(false);
  const idleRef = useRef(false);
  useEffect(() => {
    let timer = window.setTimeout(() => {
      idleRef.current = true;
      setIdle(true);
    }, IDLE_MS);
    const wake = () => {
      window.clearTimeout(timer);
      if (idleRef.current) {
        idleRef.current = false;
        setIdle(false);
      }
      timer = window.setTimeout(() => {
        idleRef.current = true;
        setIdle(true);
      }, IDLE_MS);
    };
    const events = ['pointerdown', 'pointermove', 'keydown', 'scroll', 'touchstart'] as const;
    for (const e of events) window.addEventListener(e, wake, { passive: true });
    return () => {
      window.clearTimeout(timer);
      for (const e of events) window.removeEventListener(e, wake);
    };
  }, []);
  return idle;
}

/**
 * The companion: a small pencil with a two-dot face. Its eyes follow the pointer, its mood follows the
 * month's budget, it waves on the first visit to a page and can be dragged like a toy (it springs home).
 * Click it for the top insight; "Ask" opens a ring of questions about the page.
 */
export function Companion({ path, placement }: { path: string; placement: 'sidebar' | 'header' }) {
  const all = useLedger((s) => s.transactions);
  const scoped = useScopedTransactions();
  const budgets = useLedger((s) => s.budgets);
  const recurring = useLedger((s) => s.recurring);
  const categories = useLedger((s) => s.categories);
  const currency = useLedger((s) => s.settings.currency);
  const wryOn = useLedger((s) => s.settings.wryLines);
  const noSpendDays = useLedger((s) => s.noSpendDays);
  const told = useRef(0);
  const month = useViewMonth();
  const announce = useView((s) => s.announce);
  const showCaption = useDoodle((s) => s.showCaption);
  const setSketch = useDoodle((s) => s.setSketch);
  const setNotesOpen = useDoodle((s) => s.setNotesOpen);
  usePrivacy();
  const idle = useIdle();
  const [today] = useState(todayISO);
  const thisMonth = monthKey(today);
  const overall = budgetsForMonth(budgets, thisMonth).overall;
  const spent = inMonth(all, thisMonth).reduce((s, t) => s + t.amountMinor, 0);
  const mood = companionMood(spent, overall, idle);
  const prop = PAGE_PROP[path] ?? 'cup';

  const [waving, setWaving] = useState(0);
  const [bubble, setBubble] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; rx: number; list: boolean } | null>(
    null,
  );
  const root = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLButtonElement>(null);
  const pupils = useRef<SVGGElement>(null);
  const askButton = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; moved: boolean; id: number } | null>(null);
  const spring = useRef<ReturnType<typeof createSpring2D> | null>(null);
  const bubbleTimer = useRef(0);
  const menuId = useId();

  // Wave on the first visit to each page in this session.
  useEffect(() => {
    if (visited.has(path)) return;
    visited.add(path);
    if (motionReduced()) return;
    const frame = requestAnimationFrame(() => setWaving((n) => n + 1));
    return () => cancelAnimationFrame(frame);
  }, [path]);

  // Eyes follow the pointer or the last touch, unless motion is reduced.
  useEffect(() => {
    let frame = 0;
    let px = 0;
    let py = 0;
    const draw = () => {
      frame = 0;
      const g = pupils.current;
      const el = body.current;
      if (!g || !el) return;
      if (motionReduced()) {
        g.removeAttribute('transform');
        return;
      }
      const r = el.getBoundingClientRect();
      const dx = px - (r.left + r.width / 2);
      const dy = py - (r.top + r.height * 0.4);
      const len = Math.hypot(dx, dy) || 1;
      const k = Math.min(1.6, len / 60);
      const r2 = (n: number) => Math.round(n * 100) / 100;
      g.setAttribute('transform', `translate(${r2((dx / len) * k)} ${r2((dy / len) * k)})`);
    };
    const onMove = (e: PointerEvent) => {
      px = e.clientX;
      py = e.clientY;
      if (!frame) frame = requestAnimationFrame(draw);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', onMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onMove);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  // The drag spring moves the whole pencil by transform.
  useEffect(() => {
    const s = createSpring2D((x, y) => {
      if (root.current) root.current.style.setProperty('--drag', `translate(${x}px, ${y}px)`);
    });
    spring.current = s;
    return () => s.stop();
  }, []);

  useEffect(() => () => window.clearTimeout(bubbleTimer.current), []);

  // Close the ring on Escape or a click elsewhere.
  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setMenu(null);
        (placement === 'header' ? body : askButton).current?.focus();
      }
    };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (
        !menuRef.current?.contains(t) &&
        !askButton.current?.contains(t) &&
        !body.current?.contains(t)
      )
        setMenu(null);
    };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onDown);
    menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [menu, placement]);

  const say = (text: string) => {
    window.clearTimeout(bubbleTimer.current);
    setBubble(text);
    announce(text);
    bubbleTimer.current = window.setTimeout(() => setBubble(null), 7000);
  };

  const onClick = () => {
    if (drag.current?.moved) return;
    if (!motionReduced() && typeof body.current?.animate === 'function')
      body.current.animate(
        [
          { transform: 'translateY(0)' },
          { transform: 'translateY(-6px)' },
          { transform: 'translateY(0)' },
        ],
        { duration: 320, easing: 'ease-out' },
      );
    // In the header there is no room for Ask, so the pencil itself opens the questions.
    if (placement === 'header') openMenu();
    else tellInsight();
  };

  const tellInsight = () => {
    told.current += 1;
    // With wry one-liners on, every other time the pencil says one instead of a plain fact.
    if (wryOn && told.current % 2 === 1) {
      const line = wryLine(
        wryLines({
          transactions: all,
          categories,
          noSpendDays,
          overallBudgetMinor: overall,
          today,
        }),
        told.current,
      );
      if (line) return say(line);
    }
    const top = buildInsights(scoped, today, overall, recurring, categories)[0];
    say(insightSentence(top, categories, currency));
  };

  const ask = (q: Question) => {
    setMenu(null);
    const a = answer(q, {
      transactions: scoped,
      categories,
      recurring,
      overallBudgetMinor: budgetsForMonth(budgets, month).overall,
      month,
      today,
      currency,
    });
    const target = a.anchor ? findAnchor(a.anchor) : null;
    if (a.anchor && target) {
      target.scrollIntoView({ block: 'center', behavior: motionReduced() ? 'auto' : 'smooth' });
      setBubble(null);
      showCaption(a);
      announce(a.text);
    } else {
      showCaption(null);
      say(a.text);
    }
  };

  const openMenu = () => {
    if (menu) {
      setMenu(null);
      return;
    }
    // Lay the questions on a ring around the pencil, kept inside the screen.
    const r = (body.current ?? askButton.current)!.getBoundingClientRect();
    const w = window.innerWidth;
    const h = window.innerHeight;
    // Narrow screens get a simple list under the header instead of a ring.
    if (w < 640) {
      setMenu({ x: 0, y: r.bottom + 8, rx: 0, list: true });
      return;
    }
    const rx = Math.min(RING_RADIUS, w / 2 - 110);
    setMenu({
      x: Math.min(Math.max(r.left + r.width / 2, rx + 110), w - rx - 110),
      y: Math.min(Math.max(r.top + r.height / 2, RING_RADIUS + 30), h - RING_RADIUS - 30),
      rx,
      list: false,
    });
  };

  const questions = PAGE_QUESTIONS[path] ?? PAGE_QUESTIONS['/']!;
  const items: { key: string; label: string }[] = [
    ...(placement === 'header' ? [{ key: 'insight', label: 'What should I know?' }] : []),
    ...questions.map((q) => ({ key: q, label: QUESTION_LABEL[q] })),
    { key: 'sketch', label: 'Sketch on this page' },
    { key: 'notes', label: 'Notes' },
  ];

  const runItem = (key: string) => {
    setMenu(null);
    if (key === 'insight') tellInsight();
    else if (key === 'sketch') setSketch(true);
    else if (key === 'notes') setNotesOpen(true);
    else ask(key as Question);
  };

  let ring: ReactNode = null;
  if (menu) {
    const n = items.length;
    ring = (
      <div
        ref={menuRef}
        id={menuId}
        className={menu.list ? 'ask-ring ask-list' : 'ask-ring'}
        role="group"
        aria-label="Ask the pencil"
        style={menu.list ? { top: menu.y } : undefined}
      >
        {items.map((it, i) => {
          const angle = -Math.PI / 2 + (i / n) * Math.PI * 2;
          return (
            <button
              key={it.key}
              type="button"
              className="btn ask-item"
              style={
                menu.list
                  ? { ['--i' as string]: i }
                  : {
                      left: menu.x + Math.cos(angle) * menu.rx,
                      top: menu.y + Math.sin(angle) * RING_RADIUS,
                      ['--i' as string]: i,
                    }
              }
              onClick={() => runItem(it.key)}
            >
              {it.label}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className={`companion companion-${placement} doodle-ui`} data-testid="companion">
      <div className="companion-body" ref={root}>
        <button
          ref={body}
          type="button"
          className="companion-button"
          aria-label={`The pencil, ${MOOD_LABEL[mood]}. ${placement === 'header' ? 'Ask the pencil' : 'Show the top insight'}`}
          aria-expanded={placement === 'header' ? menu !== null : undefined}
          data-mood={mood}
          onClick={onClick}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            drag.current = { x: e.clientX, y: e.clientY, moved: false, id: e.pointerId };
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d || d.id !== e.pointerId) return;
            const dx = e.clientX - d.x;
            const dy = e.clientY - d.y;
            if (!d.moved && Math.hypot(dx, dy) < 5) return;
            if (!d.moved) {
              d.moved = true;
              e.currentTarget.setPointerCapture(e.pointerId);
              spring.current?.set(0, 0);
            }
            spring.current?.set(dx, dy);
          }}
          onPointerUp={() => {
            const d = drag.current;
            if (d?.moved) {
              spring.current?.set(0, 0);
              // Keep `moved` until the click that follows the release has been ignored.
              window.setTimeout(() => {
                drag.current = null;
              }, 0);
            } else drag.current = null;
          }}
          onPointerCancel={() => {
            drag.current = null;
            spring.current?.set(0, 0);
          }}
        >
          <Pencil mood={mood} prop={prop} waving={waving} pupils={pupils} />
        </button>
      </div>
      <button
        ref={askButton}
        type="button"
        className="btn btn-ghost ask-button"
        aria-expanded={menu !== null}
        aria-controls={menu ? menuId : undefined}
        onClick={openMenu}
      >
        Ask
      </button>
      {bubble && (
        <p className="companion-bubble" role="status" data-testid="companion-bubble">
          {bubble}
        </p>
      )}
      {ring && createPortal(ring, document.body)}
    </div>
  );
}
