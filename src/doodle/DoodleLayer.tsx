import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useLedger, newId } from '../data/store';
import { budgetsForMonth } from '../domain/budgets';
import { autoAnnotation } from '../domain/companion';
import { todayISO } from '../domain/dates';
import { noteText, MAX_NOTE_LENGTH, STAMP_LABEL } from '../domain/notes';
import {
  detectShape,
  hitsStroke,
  simplify,
  sketchId,
  SNAP_HOLD_MS,
  strokePath,
  strokeWidth,
  type Pt,
  type Stroke,
} from '../domain/sketch';
import { usePrivacy } from '../app/Money';
import { tick } from '../kit/haptics';
import { motionReduced } from '../kit/spring';
import { useScopedTransactions, useViewMonth } from '../kit/view';
import { Doodle, STAMP_ART } from './art';
import { useAnchorBoxes, type Box } from './anchors';
import { useDoodle } from './state';

const FADE_MS = 3000;

function StrokePath({ stroke, className = '' }: { stroke: Stroke; className?: string }) {
  const avg = stroke.points.reduce((s, p) => s + p[2], 0) / Math.max(1, stroke.points.length);
  return (
    <path
      className={`ink ink-${stroke.color} ink-${stroke.tool} ${className}`}
      d={strokePath(stroke.points)}
      strokeWidth={strokeWidth(stroke.tool, avg)}
      data-stroke={stroke.id}
    />
  );
}

/** A caption with a hand-drawn arrow at a box. Placed above the box, or below when there is no room. */
function Callout({
  box,
  width,
  children,
  className,
  testId,
}: {
  box: Box;
  width: number;
  children: React.ReactNode;
  className: string;
  testId: string;
}) {
  const capW = 190;
  const above = box.y > 56;
  const tx = box.x + box.w / 2;
  const ty = above ? box.y : box.y + box.h;
  const left = Math.min(Math.max(4, tx + 24), Math.max(4, width - capW - 4));
  const top = above ? box.y - 52 : box.y + box.h + 30;
  // The arrow starts under (or over) the caption's left side and curves to the box edge.
  const sx = left + 12;
  const sy = above ? top + 28 : top - 2;
  const cx = (sx + tx) / 2 + (above ? -10 : 10);
  const cy = Math.min(sy, ty) - (above ? 0 : -6);
  const ang = Math.atan2(ty - cy, tx - cx);
  const head = (a: number) =>
    `${Math.round((tx - Math.cos(ang + a) * 8) * 10) / 10} ${Math.round((ty - Math.sin(ang + a) * 8) * 10) / 10}`;
  return (
    <>
      <svg className={`callout-arrow ${className}`} aria-hidden="true">
        <path d={`M${sx} ${sy}Q${cx} ${cy} ${tx} ${ty}M${head(0.5)}L${tx} ${ty}L${head(-0.5)}`} />
      </svg>
      <p
        className={`callout ${className}`}
        style={{ left, top, maxWidth: capW }}
        data-testid={testId}
      >
        {children}
      </p>
    </>
  );
}

function Typewriter({ text }: { text: string }) {
  const [shown, setShown] = useState(() => (motionReduced() ? text.length : 0));
  useEffect(() => {
    if (shown >= text.length) return;
    const t = window.setTimeout(() => setShown((n) => Math.min(text.length, n + 2)), 28);
    return () => window.clearTimeout(t);
  }, [shown, text]);
  return (
    <>
      <span aria-hidden="true">{text.slice(0, shown)}</span>
      <span className="visually-hidden">{text}</span>
    </>
  );
}

interface Editor {
  x: number;
  y: number;
  anchor: string;
}

/**
 * Everything drawn over a page: saved sketches, notes and stamps at their anchors, the page's
 * auto-annotation and the pencil's answer. In sketch mode it also takes the pointer for drawing.
 * Outside sketch mode nothing here can be clicked, so it never gets in the way.
 */
export function DoodleLayer({ path }: { path: string }) {
  const layer = useRef<HTMLDivElement>(null);
  const month = useViewMonth();
  const sketches = useLedger((s) => s.sketches);
  const notes = useLedger((s) => s.notes);
  const categories = useLedger((s) => s.categories);
  const budgets = useLedger((s) => s.budgets);
  const recurring = useLedger((s) => s.recurring);
  const currency = useLedger((s) => s.settings.currency);
  const doodles = useLedger((s) => s.settings.doodles);
  const addStroke = useLedger((s) => s.addStroke);
  const eraseStrokes = useLedger((s) => s.eraseStrokes);
  const saveNote = useLedger((s) => s.saveNote);
  const transactions = useScopedTransactions();
  const sketchOn = useDoodle((s) => s.sketchOn);
  const tool = useDoodle((s) => s.tool);
  const color = useDoodle((s) => s.color);
  const stamp = useDoodle((s) => s.stamp);
  const fade = useDoodle((s) => s.fade);
  const caption = useDoodle((s) => s.caption);
  const showCaption = useDoodle((s) => s.showCaption);
  usePrivacy();

  const [today] = useState(todayISO);
  const [current, setCurrent] = useState<Stroke | null>(null);
  const [fading, setFading] = useState<Stroke[]>([]);
  const [erasing, setErasing] = useState<string[]>([]);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const live = useRef<{ stroke: Stroke; snapped: boolean; last: Pt } | null>(null);
  const holdTimer = useRef(0);
  const erasingRef = useRef<Set<string>>(new Set());

  const sketch = sketches.find((s) => s.id === sketchId(path, month));
  const mine = budgetsForMonth(budgets, month);
  const ctx = {
    transactions,
    categories,
    recurring,
    overallBudgetMinor: mine.overall,
    month,
    today,
    currency,
  };
  const auto = doodles && !sketchOn ? autoAnnotation(path, ctx, mine.categories) : null;
  const anchors = [
    ...new Set([
      ...notes.map((n) => n.anchor),
      ...(auto ? [auto.anchor!] : []),
      ...(caption?.anchor ? [caption.anchor] : []),
    ]),
  ].filter(Boolean);
  const boxes = useAnchorBoxes(layer, anchors);

  // The layer's size, for the drawing surface and for keeping captions on screen.
  useEffect(() => {
    const el = layer.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    const frame = requestAnimationFrame(measure);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      ro?.disconnect();
    };
  }, []);

  // The pencil's caption goes away after a while, or at the next click.
  useEffect(() => {
    if (!caption) return;
    const t = window.setTimeout(() => showCaption(null), 9000);
    const away = () => showCaption(null);
    const start = window.setTimeout(() => window.addEventListener('pointerdown', away), 0);
    return () => {
      window.clearTimeout(t);
      window.clearTimeout(start);
      window.removeEventListener('pointerdown', away);
    };
  }, [caption, showCaption]);

  // Leaving sketch mode drops a half-written note.
  useEffect(() => {
    if (sketchOn) return;
    const frame = requestAnimationFrame(() => {
      setEditor(null);
      setHint(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [sketchOn]);

  const point = (e: ReactPointerEvent | PointerEvent): Pt => {
    const r = layer.current!.getBoundingClientRect();
    const pressure = e.pointerType === 'pen' && e.pressure > 0 ? e.pressure : 0.5;
    return [e.clientX - r.left, e.clientY - r.top, pressure];
  };

  const anchorAt = (e: ReactPointerEvent): string | null => {
    const els = document.elementsFromPoint?.(e.clientX, e.clientY) ?? [];
    for (const el of els) {
      if (layer.current?.contains(el)) continue;
      const a = el.closest('[data-anchor]');
      if (a) return a.getAttribute('data-anchor');
    }
    return null;
  };

  const armSnap = () => {
    window.clearTimeout(holdTimer.current);
    holdTimer.current = window.setTimeout(() => {
      const l = live.current;
      if (!l || l.snapped) return;
      const shape = detectShape(l.stroke.points);
      if (!shape) return;
      l.snapped = true;
      l.stroke = { ...l.stroke, points: shape.points };
      setCurrent(l.stroke);
      tick();
    }, SNAP_HOLD_MS);
  };

  const eraseAt = (p: Pt) => {
    for (const s of sketch?.strokes ?? []) {
      if (!erasingRef.current.has(s.id) && hitsStroke(s, p[0], p[1], 8)) {
        erasingRef.current.add(s.id);
        setErasing([...erasingRef.current]);
      }
    }
  };

  const onDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    if (tool === 'note' || tool === 'stamp') {
      const anchor = anchorAt(e);
      if (!anchor) {
        setHint('Tap a bar, slice, row, day or budget to attach it there.');
        return;
      }
      setHint(null);
      if (tool === 'stamp') {
        void saveNote({ anchor, page: path, text: '', stamp });
        return;
      }
      const p = point(e);
      setEditor({ x: p[0], y: p[1], anchor });
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = point(e);
    if (tool === 'eraser') {
      erasingRef.current = new Set();
      eraseAt(p);
      return;
    }
    const stroke: Stroke = { id: newId(), tool, color, points: [p] };
    live.current = { stroke, snapped: false, last: p };
    setCurrent(stroke);
    armSnap();
  };

  const onMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (tool === 'eraser') {
      if (e.buttons & 1 || e.pointerType !== 'mouse') eraseAt(point(e));
      return;
    }
    const l = live.current;
    if (!l || l.snapped) return;
    const events = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent];
    const pts = events.map((ev) => point(ev));
    l.stroke = { ...l.stroke, points: [...l.stroke.points, ...pts] };
    setCurrent(l.stroke);
    const p = pts[pts.length - 1]!;
    if (Math.hypot(p[0] - l.last[0], p[1] - l.last[1]) > 3) {
      l.last = p;
      armSnap();
    }
  };

  const onUp = () => {
    window.clearTimeout(holdTimer.current);
    if (tool === 'eraser') {
      const ids = [...erasingRef.current];
      erasingRef.current = new Set();
      if (ids.length > 0) void eraseStrokes(path, month, ids).then(() => setErasing([]));
      return;
    }
    const l = live.current;
    live.current = null;
    setCurrent(null);
    if (!l) return;
    const done: Stroke = {
      ...l.stroke,
      points: l.snapped ? l.stroke.points : simplify(l.stroke.points),
    };
    if (fade) {
      setFading((f) => [...f, done]);
      window.setTimeout(() => setFading((f) => f.filter((s) => s.id !== done.id)), FADE_MS);
    } else void addStroke(path, month, done);
  };

  const visibleNotes = notes.filter((n) => boxes[n.anchor]);

  return (
    <div
      ref={layer}
      className={`doodle-layer${sketchOn ? ' sketching' : ''}`}
      data-testid="doodle-layer"
    >
      <svg className="ink-layer" width={size.w} height={size.h} aria-hidden="true">
        {sketch?.strokes
          .filter((s) => !erasing.includes(s.id))
          .map((s) => (
            <StrokePath key={s.id} stroke={s} />
          ))}
        {fading.map((s) => (
          <StrokePath key={s.id} stroke={s} className="ink-fading" />
        ))}
        {current && <StrokePath stroke={current} className="ink-live" />}
      </svg>

      {visibleNotes.map((n) => {
        const b = boxes[n.anchor]!;
        const left = Math.min(b.x + b.w - 10, Math.max(0, size.w - (n.text ? 190 : 32)));
        return (
          <div
            key={n.id}
            className={n.text ? 'note-mark' : 'stamp-mark'}
            style={{ left, top: Math.max(0, b.y - 14) }}
            data-testid="note-mark"
            data-anchor-for={n.anchor}
          >
            {n.stamp && (
              <Doodle
                art={STAMP_ART[n.stamp]}
                size={n.text ? 18 : 26}
                title={STAMP_LABEL[n.stamp]}
              />
            )}
            {n.text && <span className="note-text">{noteText(n.text)}</span>}
          </div>
        );
      })}

      {auto?.anchor && boxes[auto.anchor] && (
        <Callout
          box={boxes[auto.anchor]!}
          width={size.w}
          className="auto-note doodle-ui"
          testId="auto-annotation"
        >
          {auto.text}
        </Callout>
      )}

      {caption?.anchor && boxes[caption.anchor] && (
        <Callout
          key={caption.at}
          box={boxes[caption.anchor]!}
          width={size.w}
          className="pencil-caption"
          testId="pencil-caption"
        >
          <Typewriter text={caption.text} />
        </Callout>
      )}

      {sketchOn && (
        <svg
          className="sketch-capture"
          width={size.w}
          height={size.h}
          data-tool={tool}
          aria-label="Drawing surface. Use the sketch tools at the bottom of the screen."
          role="img"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        />
      )}

      {hint && sketchOn && (
        <p className="sketch-hint" role="status" style={{ top: 8 }}>
          {hint}
        </p>
      )}

      {editor && (
        <form
          className="note-editor"
          style={{
            left: Math.min(editor.x, Math.max(0, size.w - 260)),
            top: editor.y + 8,
          }}
          onSubmit={(e) => {
            e.preventDefault();
            const text = String(new FormData(e.currentTarget).get('note') ?? '');
            void saveNote({ anchor: editor.anchor, page: path, text });
            setEditor(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              setEditor(null);
            }
          }}
        >
          <label className="visually-hidden" htmlFor="note-input">
            Note
          </label>
          <textarea
            id="note-input"
            name="note"
            className="input"
            rows={3}
            maxLength={MAX_NOTE_LENGTH}
            autoFocus
            placeholder="Write a note"
          />
          <div className="btn-row">
            <button type="submit" className="btn btn-primary">
              Save note
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setEditor(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
