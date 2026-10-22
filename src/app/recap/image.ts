import type { Slide } from './RecapViewer';

const W = 1080;
const H = 1350;

const cssVar = (name: string, fallback: string): string => {
  if (typeof document === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
};

/** Breaks text into lines that fit `width` at the current font. */
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width > width && line) {
      lines.push(line);
      line = w;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Draws one recap card as a 1080 by 1350 PNG in Ledger's colours. With privacy on (`masked`) the figure
 * is left out and the plain text, which has no amounts, is used.
 */
export async function drawCard(slide: Slide, label: string, masked: boolean): Promise<Blob | null> {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const bg = cssVar('--bg', '#faf9f5');
  const text = cssVar('--text', '#141413');
  const muted = cssVar('--muted', '#6b6a64');
  const accent = cssVar('--accent', '#d97757');
  const serif = "'Newsreader Variable', Newsreader, Georgia, serif";
  const sans = "'Albert Sans Variable', 'Albert Sans', system-ui, sans-serif";
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = accent;
  ctx.fillRect(96, 120, 120, 8);
  ctx.textBaseline = 'top';
  ctx.fillStyle = muted;
  ctx.font = `500 40px ${sans}`;
  ctx.fillText(label, 96, 170);
  ctx.fillStyle = text;
  ctx.font = `500 64px ${sans}`;
  let y = 300;
  for (const line of wrap(ctx, slide.heading, W - 192)) {
    ctx.fillText(line, 96, y);
    y += 80;
  }
  if (slide.figure && !masked) {
    y += 40;
    ctx.font = `400 150px ${serif}`;
    ctx.fillText(slide.figure, 96, y);
    y += 190;
  }
  y += 30;
  ctx.fillStyle = muted;
  ctx.font = `400 48px ${sans}`;
  for (const line of wrap(ctx, masked ? slide.plain : slide.detail, W - 192)) {
    ctx.fillText(line, 96, y);
    y += 64;
  }
  ctx.fillStyle = muted;
  ctx.font = `500 36px ${sans}`;
  ctx.fillText('Ledger', 96, H - 140);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
}

/** Opens the share sheet with the image where the browser can share files; otherwise downloads it. */
export async function shareImage(
  blob: Blob,
  filename: string,
): Promise<'shared' | 'saved' | 'cancelled'> {
  const file = new File([blob], filename, { type: 'image/png' });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file] });
      return 'shared';
    } catch {
      return 'cancelled';
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'saved';
}
