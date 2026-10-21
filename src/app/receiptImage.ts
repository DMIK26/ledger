import { useEffect, useState } from 'react';
import { fitWithin, RECEIPT_QUALITY } from '../domain/receipts';

/** Shrinks a photo to at most 1600px on its longest edge and re-encodes it as JPEG. */
export async function prepareReceipt(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error('Pick a photo or an image file.');
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('This browser cannot read that image. Try a JPEG or PNG.');
  }
  const { width, height } = fitWithin(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot resize images.');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', RECEIPT_QUALITY),
  );
  if (!blob) throw new Error('Could not save that image.');
  return blob;
}

/** A data URL for a blob (the CSP allows data: images), or null while there is none. */
export function useObjectUrl(blob: Blob | null | undefined): string | null {
  const [loaded, setLoaded] = useState<{ blob: Blob; url: string } | null>(null);
  useEffect(() => {
    if (!blob) return;
    let live = true;
    const reader = new FileReader();
    reader.onload = () => {
      if (live && typeof reader.result === 'string') setLoaded({ blob, url: reader.result });
    };
    reader.readAsDataURL(blob);
    return () => {
      live = false;
    };
  }, [blob]);
  return blob && loaded?.blob === blob ? loaded.url : null;
}
