import { serveStoredFile } from '@/lib/media/serve-file';

/**
 * The prefix uploads were published under before `/media`.
 *
 * Kept because the URL of every file uploaded until then is stored on its
 * database row and embedded in published pages. Removing this route would 404
 * all of them at once; it costs one file to keep them working.
 */
export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path: segments } = await params;
  return serveStoredFile(segments);
}
