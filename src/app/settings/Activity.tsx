import { useEffect, useState } from 'react';
import { useLedger } from '../../data/store';
import { fmtDate, fmtTime, todayISO } from '../../domain/dates';
import type { AuditEvent } from '../../domain/types';
import { href } from '../router';
import { tl } from '../../domain/i18n';

const ACTION: Record<AuditEvent['action'], string> = {
  do: '',
  get undo() {
    return tl('Undid:') + ' ';
  },
  get redo() {
    return tl('Redid:') + ' ';
  },
};

/** The audit log: the last 500 changes, newest first. Labels never contain amounts. */
export function Activity() {
  const getActivity = useLedger((s) => s.getActivity);
  const changes = useLedger((s) => s.transactions); // reload when data changes
  const [events, setEvents] = useState<AuditEvent[] | null>(null);

  useEffect(() => {
    let live = true;
    void getActivity().then((e) => {
      if (live) setEvents(e);
    });
    return () => {
      live = false;
    };
  }, [getActivity, changes]);

  const days = (events ?? []).map((e) => fmtDate(todayISO(new Date(e.at))));
  return (
    <>
      <p>
        <a href={href('/settings')}>{tl('Back to settings')}</a>
      </p>
      <section className="card" aria-labelledby="activity-title">
        <h2 id="activity-title">{tl('Activity')}</h2>
        <p className="muted small">{tl('The last 500 changes made on this device.')}</p>
        {events === null ? (
          <p className="muted">{tl('Loading…')}</p>
        ) : events.length === 0 ? (
          <p className="muted">{tl('Nothing yet.')}</p>
        ) : (
          <ol className="activity" data-testid="activity">
            {events.map((e, i) => {
              const day = days[i]!;
              const showDay = i === 0 || day !== days[i - 1];
              return (
                <li key={e.id ?? e.at} className="activity-row">
                  {showDay && <span className="activity-day">{day}</span>}
                  <span className="activity-time muted small">{fmtTime(e.at)}</span>
                  <span>
                    {ACTION[e.action]}
                    {e.label}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </>
  );
}
