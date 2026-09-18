/**
 * Upload rules shared by the server validator and the browser's file picker.
 *
 * Deliberately free of `server-only` so the admin UI can offer exactly the
 * formats the server will accept — a picker that shows more than the server
 * allows just produces failed uploads. The server still re-checks everything;
 * nothing here is a substitute for validation.
 */

/** The only file types this installation accepts. */
export const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
  'application/pdf',
] as const;

export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

export const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg', 'pdf'] as const;

/** `accept` for a file input: MIME types plus extensions, which some OS dialogs prefer. */
export const ACCEPT_ATTRIBUTE = [
  ...ALLOWED_MIME_TYPES,
  ...ALLOWED_EXTENSIONS.map((ext) => `.${ext}`),
].join(',');

/** Images only, for pickers that cannot use a document. */
export const ACCEPT_IMAGES = [
  ...ALLOWED_MIME_TYPES.filter((type) => type.startsWith('image/')),
  ...ALLOWED_EXTENSIONS.filter((ext) => ext !== 'pdf').map((ext) => `.${ext}`),
].join(',');

/**
 * The ceiling when nothing is configured.
 *
 * Deliberately small, and deliberately unchanged by the move to a configurable
 * limit: an installation that was enforcing 150 KB keeps enforcing it after an
 * upgrade. `MAX_UPLOAD_SIZE_MB` is how a deployment that wants room for
 * photographs and PDFs asks for it — see `.env.example`, which ships 10 MB for
 * a new install.
 */
export const DEFAULT_MAX_UPLOAD_KB = 150;

export const UNSUPPORTED_TYPE_MESSAGE =
  'Only JPG, JPEG, WEBP, PNG, PDF, SVG and GIF files are allowed.';

/** "150 KB", "10 MB" — for hint text and for the rejection message. */
export function formatUploadLimit(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    const mb = bytes / (1024 * 1024);
    return `${Number.isInteger(mb) ? mb : mb.toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function tooLargeMessage(bytes: number): string {
  return `File size must be ${formatUploadLimit(bytes)} or less.`;
}
