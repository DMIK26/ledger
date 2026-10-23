import { useState } from 'react';
import { usePrivacy } from './Money';
import { tl } from '../domain/i18n';

/** Opens the share sheet with the file where supported (phones), otherwise downloads it. */
export async function shareOrDownload(file: File): Promise<void> {
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  if (nav.canShare?.({ files: [file] }) && typeof nav.share === 'function') {
    try {
      await nav.share({ files: [file], title: file.name });
      return;
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      /* share failed for another reason: fall back to a download */
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.append(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * A button that builds a file and shares or downloads it. Files hold real amounts, so with privacy mode
 * on it asks first.
 */
export function ExportButton({
  label,
  build,
  disabled = false,
  onDone,
  className = 'btn',
}: {
  label: string;
  build: () => Promise<File> | File;
  disabled?: boolean;
  onDone?: () => void;
  className?: string;
}) {
  const privacy = usePrivacy();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setConfirming(false);
    setBusy(true);
    try {
      await shareOrDownload(await build());
      onDone?.();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className={className}
        disabled={busy || disabled}
        onClick={() => (privacy ? setConfirming(true) : void run())}
      >
        {label}
      </button>
      {confirming && (
        <div className="preview confirm" role="alert">
          <p>{tl('The file contains real amounts, even with privacy mode on.')}</p>
          <div className="btn-row">
            <button type="button" className="btn btn-primary" onClick={() => void run()}>
              {tl('Export anyway')}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setConfirming(false)}>
              {tl('Cancel')}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export const csvFile = (name: string, text: string): File =>
  new File([text], name, { type: 'text/csv;charset=utf-8' });
