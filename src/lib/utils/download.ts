'use client';

/** Triggers a client-side download of generated CSV text. */
export function downloadCsv(csv: string, filename: string): void {
  // A BOM keeps Excel from mangling non-ASCII characters.
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
