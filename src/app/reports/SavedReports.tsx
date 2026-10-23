import { useState } from 'react';
import { newId, useLedger } from '../../data/store';
import type { SavedReport } from '../../domain/reports';

const MAX_REPORT_NAME = 40;

/**
 * Saved reports (Drop 12): the range and comparison kept under a name. Month, quarter, year and the
 * relative ranges ("Last 3 months") are kept relative to today, so they move with time.
 */
export function SavedReports({
  current,
  onApply,
}: {
  current: Omit<SavedReport, 'id' | 'name' | 'createdAt'>;
  onApply: (r: SavedReport) => void;
}) {
  const reports = useLedger((s) => s.savedReports);
  const saveReport = useLedger((s) => s.saveReport);
  const deleteReport = useLedger((s) => s.deleteReport);
  const [activeId, setActiveId] = useState('');
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  return (
    <div className="saved-views">
      {reports.length > 0 && (
        <>
          <label className="visually-hidden" htmlFor="report-select">
            Saved report
          </label>
          <select
            id="report-select"
            className="select input"
            value={activeId}
            onChange={(e) => {
              setActiveId(e.target.value);
              const r = reports.find((x) => x.id === e.target.value);
              if (r) onApply(r);
            }}
          >
            <option value="">Saved reports</option>
            {reports.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          {activeId && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                void deleteReport(activeId);
                setActiveId('');
              }}
            >
              Delete report
            </button>
          )}
        </>
      )}
      {naming ? (
        <form
          className="bulk-tag"
          onSubmit={(e) => {
            e.preventDefault();
            const n = name.trim();
            if (!n) return;
            const id = newId();
            void saveReport({ id, name: n, ...current, createdAt: Date.now() });
            setActiveId(id);
            setNaming(false);
            setName('');
          }}
        >
          <label className="visually-hidden" htmlFor="report-name">
            Report name
          </label>
          <input
            id="report-name"
            className="input"
            placeholder="Name this report"
            maxLength={MAX_REPORT_NAME}
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button type="submit" className="btn">
            Save
          </button>
        </form>
      ) : (
        <button type="button" className="btn btn-ghost" onClick={() => setNaming(true)}>
          Save this report
        </button>
      )}
    </div>
  );
}
