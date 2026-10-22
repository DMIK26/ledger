import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { useLedger } from '../../data/store';
import { categoryById } from '../../domain/categories';
import { fmtDate, todayISO } from '../../domain/dates';
import { fmtMoney } from '../../domain/money';
import {
  buildRecap,
  guessMax,
  guessResult,
  type Recap,
  type RecapPeriod,
} from '../../domain/recap';
import { useUi } from '../../kit/ui';
import { Icon } from '../icons';
import { usePrivacy } from '../Money';
import { drawCard, shareImage } from './image';

export interface Slide {
  id: string;
  /** Never has an amount, so it can go on a shared image with privacy on. */
  heading: string;
  /** The big figure, an amount. */
  figure: string | null;
  detail: string;
  /** The detail without amounts, for images shared with privacy on. */
  plain: string;
}

const pctText = (pct: number | null, before: string): string =>
  pct === null
    ? `Nothing to compare with ${before}.`
    : pct === 0
      ? `The same as ${before}.`
      : `${Math.abs(pct)}% ${pct > 0 ? 'more' : 'less'} than ${before}.`;

export function recapSlides(
  r: Recap,
  categoryName: (id: string) => string,
  currency: string,
): Slide[] {
  const m = (v: number) => fmtMoney(v, { currency });
  const what =
    r.period.kind === 'week'
      ? 'that week'
      : r.period.kind === 'month'
        ? r.period.label
        : r.period.label;
  const before =
    r.period.kind === 'week'
      ? 'the week before'
      : r.period.kind === 'month'
        ? 'the month before'
        : 'the year before';
  const out: Slide[] = [
    {
      id: 'total',
      heading: `You spent in ${what}`,
      figure: m(r.totalMinor),
      detail: `${r.entries === 1 ? '1 entry' : `${r.entries} entries`}. ${pctText(r.changePct, before)}`,
      plain: `${r.entries === 1 ? '1 entry' : `${r.entries} entries`}. ${pctText(r.changePct, before)}`,
    },
  ];
  if (r.topCategory)
    out.push({
      id: 'category',
      heading: `${categoryName(r.topCategory.categoryId)} took the most`,
      figure: m(r.topCategory.totalMinor),
      detail: `${Math.round(r.topCategory.share * 100)}% of everything.`,
      plain: `${Math.round(r.topCategory.share * 100)}% of everything.`,
    });
  if (r.topMerchant)
    out.push({
      id: 'merchant',
      heading: `Top merchant: ${r.topMerchant.name}`,
      figure: m(r.topMerchant.totalMinor),
      detail: r.topMerchant.count === 1 ? 'One visit.' : `${r.topMerchant.count} visits.`,
      plain: r.topMerchant.count === 1 ? 'One visit.' : `${r.topMerchant.count} visits.`,
    });
  if (r.busiestDay)
    out.push({
      id: 'day',
      heading: `Busiest day: ${fmtDate(r.busiestDay.date)}`,
      figure: m(r.busiestDay.totalMinor),
      detail: 'The most spent on a single day.',
      plain: 'The most spent on a single day.',
    });
  out.push({
    id: 'quiet',
    heading:
      r.quietDays === 1 ? '1 day with nothing spent' : `${r.quietDays} days with nothing spent`,
    figure: null,
    detail: r.quietDays > 0 ? 'Quiet days count too.' : 'Something every day. Busy times.',
    plain: r.quietDays > 0 ? 'Quiet days count too.' : 'Something every day. Busy times.',
  });
  if (r.biggest)
    out.push({
      id: 'biggest',
      heading: `Biggest single expense: ${r.biggest.merchant}`,
      figure: m(r.biggest.amountMinor),
      detail: `On ${fmtDate(r.biggest.date)}.`,
      plain: `On ${fmtDate(r.biggest.date)}.`,
    });
  if (r.leftMinor !== null)
    out.push({
      id: 'left',
      heading: r.leftMinor >= 0 ? 'Left after spending' : 'Spent more than came in',
      figure: m(Math.abs(r.leftMinor)),
      detail: `${m(r.inMinor)} came in.`,
      plain: 'Money in, less spending, interest and fees.',
    });
  return out;
}

const VERDICT: Record<ReturnType<typeof guessResult>['verdict'], string> = {
  'spot-on': 'Spot on.',
  close: 'Close.',
  under: 'You guessed under.',
  over: 'You guessed over.',
};

/**
 * A story recap (Drop 11): a few cards about last week, month or financial year. The month recap starts
 * with a guess. Opening it marks it seen, so the Dashboard never offers it again.
 */
export function RecapViewer({ period }: { period: RecapPeriod }) {
  const close = useUi((s) => s.closeRecap);
  const transactions = useLedger((s) => s.transactions);
  const flows = useLedger((s) => s.flows);
  const categories = useLedger((s) => s.categories);
  const currency = useLedger((s) => s.settings.currency);
  const seen = useLedger((s) => s.settings.recapsSeen);
  const setSetting = useLedger((s) => s.setSetting);
  const masked = usePrivacy();
  const ref = useRef<HTMLDialogElement>(null);
  const recap = useMemo(
    () => buildRecap(period, transactions, flows, todayISO()),
    [period, transactions, flows],
  );
  const slides = useMemo(
    () => recapSlides(recap, (id) => categoryById(categories, id)?.name ?? 'Other', currency),
    // `masked` too: the figures are formatted text, masked while privacy is on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [recap, categories, currency, masked],
  );
  const asksGuess = period.kind === 'month' && recap.totalMinor > 0;
  const max = guessMax(recap.totalMinor, recap.compareMinor);
  const [guess, setGuess] = useState(Math.round(max / 2 / 50_000) * 50_000);
  const [guessed, setGuessed] = useState(!asksGuess);
  const [i, setI] = useState(0);
  const [note, setNote] = useState('');
  const swipe = useRef<number | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) {
      if (typeof d.showModal === 'function') d.showModal();
      else d.setAttribute('open', '');
    }
    if (!seen.includes(period.id)) void setSetting('recapsSeen', [...seen, period.id]);
    // Only when it opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const n = slides.length;
  const go = (delta: number) => setI((x) => Math.min(n - 1, Math.max(0, x + delta)));
  const slide = slides[i]!;
  const result = guessResult(guess, recap.totalMinor);

  const share = async () => {
    const blob = await drawCard(slide, period.label, masked);
    if (!blob) return setNote('This browser cannot make the image.');
    const how = await shareImage(blob, `ledger-${period.id.replace(':', '-')}-${slide.id}.png`);
    setNote(how === 'shared' ? '' : how === 'saved' ? 'Image saved to your downloads.' : '');
  };

  return (
    <dialog
      ref={ref}
      className="recap"
      aria-labelledby="recap-title"
      onClose={close}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onKeyDown={(e) => {
        if (!guessed) return;
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          go(1);
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          go(-1);
        }
      }}
    >
      <div className="recap-body">
        <div className="sheet-head">
          <h2 id="recap-title">{period.label}</h2>
          <button
            type="button"
            className="btn btn-ghost btn-icon"
            aria-label="Close"
            onClick={close}
          >
            <Icon name="close" />
          </button>
        </div>
        {!guessed ? (
          <div className="recap-card" data-testid="recap-guess">
            <p className="recap-heading">Guess first: how much did you spend in {period.label}?</p>
            <p className="recap-figure" aria-hidden="true">
              {fmtMoney(guess, { currency })}
            </p>
            <label className="visually-hidden" htmlFor="recap-guess">
              Your guess
            </label>
            <input
              id="recap-guess"
              className="range"
              type="range"
              min={0}
              max={max}
              step={50_000}
              value={guess}
              aria-valuetext={fmtMoney(guess, { currency })}
              onChange={(e) => setGuess(Number(e.target.value))}
            />
            <button type="button" className="btn btn-primary" onClick={() => setGuessed(true)}>
              Show me
            </button>
          </div>
        ) : (
          <div
            className="recap-card"
            data-testid="recap-card"
            aria-live="polite"
            onPointerDown={(e: PointerEvent<HTMLDivElement>) => {
              swipe.current = e.clientX;
            }}
            onPointerUp={(e: PointerEvent<HTMLDivElement>) => {
              if (swipe.current === null) return;
              const dx = e.clientX - swipe.current;
              swipe.current = null;
              if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
            }}
          >
            <p className="recap-heading">{slide.heading}</p>
            {slide.figure && <p className="recap-figure">{slide.figure}</p>}
            <p className="muted">{slide.detail}</p>
            {asksGuess && slide.id === 'total' && (
              <p className="small" data-testid="recap-guess-result">
                You guessed {fmtMoney(guess, { currency })}. {VERDICT[result.verdict]}
                {result.verdict !== 'spot-on' ? ` Off by ${result.offPct}%.` : ''}
              </p>
            )}
          </div>
        )}
        {guessed && (
          <>
            <div className="recap-nav">
              <button type="button" className="btn" disabled={i === 0} onClick={() => go(-1)}>
                Previous
              </button>
              <span className="muted small" aria-live="polite">
                {i + 1} of {n}
              </span>
              <button type="button" className="btn" disabled={i === n - 1} onClick={() => go(1)}>
                Next
              </button>
            </div>
            <div className="btn-row">
              <button type="button" className="btn btn-ghost" onClick={() => void share()}>
                <Icon name="share" />
                Share this card
              </button>
            </div>
            {masked && (
              <p className="muted small">
                Privacy mode is on, so a shared image leaves amounts out.
              </p>
            )}
            {note && (
              <p className="small" role="status">
                {note}
              </p>
            )}
          </>
        )}
      </div>
    </dialog>
  );
}
